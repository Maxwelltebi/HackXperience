// k6 load test of the deadline minute (build plan Phase 7 item 7).
//
// 80 teams save their submission every 30 seconds through the last 15 minutes, compressed:
// by default every 3 seconds for 90 seconds, with the event's deadline set to land inside the
// run so the lock fires under load. Run it against a PREVIEW deployment, never production:
//
//   k6 run -e BASE_URL=https://<preview>.vercel.app -e EVENT_ID=<uuid> \
//          -e TOKENS=tokens.json scripts/loadtest.js
//
// tokens.json is a JSON array of 80 Supabase access tokens, one member of each test team (see
// docs/RUNBOOK.md, "Load test"). Targets (proposed): no errors, 95% of saves under 800 ms, no
// save lost at the lock. A 423 after the deadline is the correct answer, not an error; a 409
// can't happen here because each team has one writer.
import { check, sleep } from 'k6';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL;
const EVENT_ID = __ENV.EVENT_ID;
const TOKENS = JSON.parse(open(__ENV.TOKENS || 'tokens.json'));
const INTERVAL = Number(__ENV.INTERVAL_SECONDS || 3);
const DURATION = __ENV.DURATION || '90s';

const saveTime = new Trend('save_ms', true);
const saved = new Counter('saves_ok');
const locked = new Counter('saves_after_lock');
const unexpected = new Counter('saves_unexpected');

export const options = {
  scenarios: {
    teams: { executor: 'constant-vus', vus: TOKENS.length, duration: DURATION },
  },
  thresholds: {
    save_ms: ['p(95)<800'],
    saves_unexpected: ['count==0'],
  },
};

const url = `${BASE_URL}/api/v1/events/${EVENT_ID}/teams/me/submission`;

export default function () {
  const token = TOKENS[(__VU - 1) % TOKENS.length];
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const current = http.get(url, { headers });
  if (current.status !== 200) {
    unexpected.add(1);
    sleep(INTERVAL);
    return;
  }
  const { version } = current.json();
  const body = JSON.stringify({
    title: `Load test team ${__VU}`,
    write_up: `Saved at iteration ${__ITER} by VU ${__VU}.`,
  });
  const response = http.put(url, body, { headers: { ...headers, 'if-match': String(version) } });
  saveTime.add(response.timings.duration);
  if (response.status === 200) saved.add(1);
  else if (response.status === 423) locked.add(1);
  else unexpected.add(1);
  check(response, { 'saved or locked': (r) => r.status === 200 || r.status === 423 });
  sleep(INTERVAL);
}

// Afterwards, check "no save lost" in SQL: every team's last 200 is in the locked data:
//   select count(*) from submissions where event_id = '<EVENT_ID>' and status = 'submitted';
// equals the number of teams that got at least one 200 (all of them, if the deadline was
// late enough in the run).
