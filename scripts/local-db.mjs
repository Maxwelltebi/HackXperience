#!/usr/bin/env node
// Local Postgres without Docker, for machines that cannot run `supabase start`.
//
//   pnpm db:local          start Postgres on 127.0.0.1:54322, reset it, keep running (Ctrl+C stops)
//   pnpm db:local reset    drop and rebuild the database of a running instance
//
// It applies a small Supabase stand-in (scripts/local-db/supabase-stub.sql), then every
// file in supabase/migrations in order, then supabase/seed.sql. The connection string is the
// same as the Supabase CLI's: postgresql://postgres:postgres@127.0.0.1:54322/postgres
//
// This is a fallback. CI and `pnpm db:start` use the real Supabase stack.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const root = resolve(import.meta.dirname, '..');
const dataDir = join(root, '.local-db', 'data');
const port = 54322;

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  onLog: () => {},
});

async function runSql(database, label, sql) {
  const client = pg.getPgClient(database);
  await client.connect();
  try {
    await client.query(sql);
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await client.end();
  }
}

async function reset() {
  // Separate queries: DROP and CREATE DATABASE cannot run inside one implicit transaction.
  await runSql('template1', 'drop database', 'drop database if exists postgres with (force)');
  await runSql('template1', 'create database', 'create database postgres');
  await runSql('postgres', 'supabase-stub.sql', read('scripts/local-db/supabase-stub.sql'));

  const migrationsDir = join(root, 'supabase', 'migrations');
  const migrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const name of migrations) {
    await runSql('postgres', name, read(join('supabase', 'migrations', name)));
    console.log(`applied ${name}`);
  }
  await runSql('postgres', 'seed.sql', read('supabase/seed.sql'));
  console.log('applied seed.sql');
}

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

async function main() {
  const command = process.argv[2] ?? 'start';
  if (command === 'reset') {
    await reset();
    return;
  }
  if (command !== 'start') {
    throw new Error(`Unknown command "${command}". Use "start" or "reset".`);
  }

  if (!existsSync(join(dataDir, 'PG_VERSION'))) {
    await pg.initialise();
  }
  await pg.start();
  await reset();
  console.log(`Postgres ready: postgresql://postgres:postgres@127.0.0.1:${port}/postgres`);

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
