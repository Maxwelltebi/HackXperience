// handler() behaviour that no Phase 1 endpoint exercises on its own.
import { ApiError } from '@hx/shared';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { handler } from '@/lib/api/handler';
import { json } from '@/lib/api/respond';
import { call, expectError, expectServerTime } from './helpers';

const createThing = handler(
  { clientId: true, body: z.object({ name: z.string().min(1) }).strict() },
  async ({ id, body, userId }) => json({ id, name: body.name, owner: userId }, 201),
);

describe('handler() client-generated ids', () => {
  const user = crypto.randomUUID();

  it('uses the id the client sent, so a retry targets the same row', async () => {
    const id = crypto.randomUUID();
    const first = await call(createThing, { method: 'POST', as: user, body: { id, name: 'x' } });
    const retry = await call(createThing, { method: 'POST', as: user, body: { id, name: 'x' } });
    expect((await first.json()).id).toBe(id);
    expect((await retry.json()).id).toBe(id);
  });

  it('generates an id when the client sent none', async () => {
    const response = await call(createThing, { method: 'POST', as: user, body: { name: 'x' } });
    expect((await response.json()).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects an id that is not a UUID', async () => {
    const response = await call(createThing, {
      method: 'POST',
      as: user,
      body: { id: '42', name: 'x' },
    });
    const body = await expectError(response, 400, 'VALIDATION_FAILED');
    expect(body.error.details).toEqual([{ path: 'id', message: 'Must be a UUID.' }]);
  });
});

describe('handler() error mapping', () => {
  it('maps an ApiError to its status and code', async () => {
    const route = handler({ auth: 'none' }, async () => {
      throw new ApiError('FORBIDDEN', 'Not yours.');
    });
    await expectError(await call(route), 403, 'FORBIDDEN');
  });

  it('turns an unexpected error into a 500 that leaks nothing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = handler({ auth: 'none' }, async () => {
      throw new Error('secret detail ama@example.com');
    });
    const response = await call(route);
    const body = await expectError(response, 500, 'INTERNAL');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(log.mock.calls.flat().join(' ')).not.toContain('ama@example.com');
    log.mockRestore();
  });

  it('validates the query string', async () => {
    const route = handler(
      { auth: 'none', query: z.object({ limit: z.coerce.number().int().max(100) }) },
      async ({ query }) => json(query),
    );
    expectServerTime(await call(route, { path: '/x?limit=5' }));
    expect(await (await call(route, { path: '/x?limit=5' })).json()).toEqual({ limit: 5 });
    await expectError(await call(route, { path: '/x?limit=500' }), 400, 'VALIDATION_FAILED');
  });

  it('lets optional auth through with a null user', async () => {
    const route = handler({ auth: 'optional' }, async ({ userId }) => json({ userId }));
    expect(await (await call(route)).json()).toEqual({ userId: null });
  });
});
