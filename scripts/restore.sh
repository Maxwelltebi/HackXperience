#!/usr/bin/env bash
# Restore a nightly backup into the LOCAL database.
#
#   pnpm db:start && pnpm db:reset          # schema from migrations
#   BACKUP_ENCRYPTION_KEY=... scripts/restore.sh ~/Downloads/hackxperience-20261118-021700.tar.gz.gpg
#
# Accepts the .tar.gz.gpg file, or the .zip GitHub gives you when you download the artifact.
# Replaces every row in the public tables and in auth.users / auth.identities.
#
# psql: uses `psql` if installed, otherwise runs psql inside the Supabase CLI's database
# container (docker exec). Target: RESTORE_DATABASE_URL, default the local Supabase database.
set -euo pipefail

usage() {
  echo "Usage: BACKUP_ENCRYPTION_KEY=... $0 <backup.tar.gz.gpg | artifact.zip>" >&2
  exit 2
}

input="${1:-}"
[ -n "$input" ] || usage
[ -f "$input" ] || { echo "No such file: $input" >&2; exit 2; }
: "${BACKUP_ENCRYPTION_KEY:?Set BACKUP_ENCRYPTION_KEY to the key used by the nightly workflow}"

target="${RESTORE_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$target" in
  *@127.0.0.1:* | *@localhost:*) ;;
  *)
    if [ "${ALLOW_REMOTE_RESTORE:-}" != "yes" ]; then
      echo "Refusing to restore into a non-local database. Set ALLOW_REMOTE_RESTORE=yes if you mean it." >&2
      exit 1
    fi
    ;;
esac

work="$(mktemp -d)"
cleanup() {
  [ -n "${GNUPGHOME:-}" ] && gpgconf --kill gpg-agent >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

# 1. Unwrap the GitHub artifact zip if needed.
encrypted="$input"
case "$input" in
  *.zip)
    unzip -q "$input" -d "$work/zip"
    encrypted="$(find "$work/zip" -name '*.tar.gz.gpg' | head -n 1)"
    [ -n "$encrypted" ] || { echo "No .tar.gz.gpg inside $input" >&2; exit 1; }
    ;;
esac

# 2. Decrypt and unpack. A throwaway GnuPG home keeps your own keyring untouched.
export GNUPGHOME="$work/gnupg"
mkdir -p "$GNUPGHOME"
chmod 700 "$GNUPGHOME" 2>/dev/null || true
mkdir -p "$work/dump"
if ! gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 \
  --output "$work/backup.tar.gz" --decrypt "$encrypted" 3<<<"$BACKUP_ENCRYPTION_KEY" 2>"$work/gpg.log"; then
  echo "Could not decrypt $encrypted. Is BACKUP_ENCRYPTION_KEY the key the nightly workflow used?" >&2
  exit 1
fi
tar -xzf "$work/backup.tar.gz" -C "$work/dump"
for file in public.sql auth.sql; do
  [ -f "$work/dump/$file" ] || { echo "Backup is missing $file" >&2; exit 1; }
done
echo "Backup created at: $(head -n 1 "$work/dump/CREATED_AT" 2>/dev/null || echo unknown)"

# 3. Pick a psql.
if command -v psql >/dev/null 2>&1; then
  run_psql() { psql "$target" --quiet --no-psqlrc --set ON_ERROR_STOP=1 "$@"; }
elif command -v docker >/dev/null 2>&1; then
  container="${SUPABASE_DB_CONTAINER:-supabase_db_hackxperience}"
  echo "No local psql; using docker exec $container"
  run_psql() { docker exec -i "$container" psql -U postgres -d postgres --quiet --no-psqlrc --set ON_ERROR_STOP=1 "$@"; }
else
  echo "Need psql or docker. Install the PostgreSQL client, or start Supabase with pnpm db:start." >&2
  exit 1
fi

# 4. One transaction: clear, load auth, load public. Replica mode skips triggers
#    (so on_auth_user_created does not create duplicate rows) and foreign-key checks
#    while rows load in dump order.
{
  cat <<'SQL'
begin;
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('truncate table public.%I cascade', t.tablename);
  end loop;
end
$$;
delete from auth.users;
set local session_replication_role = replica;
SQL
  cat "$work/dump/auth.sql"
  cat "$work/dump/public.sql"
  cat <<'SQL'
commit;
select (select count(*) from auth.users) as auth_users,
       (select count(*) from public.users) as users,
       (select count(*) from public.profiles) as profiles;
SQL
} | run_psql

echo "Restore finished."
