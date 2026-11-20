import { closeSql, getSql } from '@hx/db';
import { testData } from '@hx/db/testing';
import { errorBodySchema, SERVER_TIME_HEADER } from '@hx/shared';
import { expect } from 'vitest';

type RouteHandler = (
  request: Request,
  context?: { params?: Promise<Record<string, string | string[] | undefined>> },
) => Promise<Response>;

interface CallOptions {
  method?: string;
  path?: string;
  /** Signed in as this user id. */
  as?: string;
  body?: unknown;
  rawBody?: string;
  params?: Record<string, string | string[]>;
  headers?: Record<string, string>;
}

/** Call a route handler the way Next.js would. */
export async function call(route: RouteHandler, options: CallOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.as) headers.set('authorization', `Bearer test:${options.as}`);
  let body: string | undefined;
  if (options.rawBody !== undefined) body = options.rawBody;
  else if (options.body !== undefined) body = JSON.stringify(options.body);
  if (body !== undefined) headers.set('content-type', 'application/json');

  const request = new Request(`http://localhost${options.path ?? '/api/v1/test'}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });
  return route(request, { params: Promise.resolve(options.params ?? {}) });
}

/** Asserts the server_time header is a current UTC ISO 8601 timestamp. */
export function expectServerTime(response: Response): void {
  const value = response.headers.get(SERVER_TIME_HEADER);
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  expect(Math.abs(Date.parse(value ?? '') - Date.now())).toBeLessThan(60_000);
}

/** Asserts the standard error shape and code, and returns the parsed body. */
export async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expectServerTime(response);
  const body = errorBodySchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  return body;
}

/** Creates users through the auth trigger and removes them after the file's tests. */
export function testUsers() {
  const data = testData(getSql());
  return {
    create: (name = 'Test User') => data.user(name),
    async cleanup() {
      await data.cleanup();
      await closeSql();
    },
  };
}

/**
 * Users, events and staff roles for a test file, all removed afterwards.
 * `roles` builds one person per staff role plus a plain participant, for permission tests.
 */
export function fixtures() {
  const data = testData(getSql());
  return {
    ...data,
    async eventWithRoles(options: Parameters<typeof data.event>[1] = {}) {
      const owner = await data.user('Owner');
      const event = await data.event(owner.id, options);
      const people = {
        owner,
        admin: await data.user('Admin'),
        judge: await data.user('Judge'),
        mentor: await data.user('Mentor'),
        volunteer: await data.user('Volunteer'),
        participant: await data.user('Participant'),
      };
      for (const role of ['admin', 'judge', 'mentor', 'volunteer'] as const) {
        await data.staff(event.id, people[role].id, role);
      }
      return { event, people };
    },
    async cleanup() {
      await data.cleanup();
      await closeSql();
    },
  };
}
