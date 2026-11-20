import {
  createSetupItem,
  deleteSetupItem,
  getEventSetup,
  getSql,
  tx,
  updateSetupItem,
  type SetupKind,
} from '@hx/db';
import { eventItemParamsSchema } from '@hx/shared';
import type { ZodType } from 'zod';
import { handler } from './handler';
import { json, noContent } from './respond';

/**
 * GET and POST for /events/{id}/{kind}. Reading follows the event's visibility; writing is
 * owner and admin (DESIGN Step 4: CRUD /tracks, /schedule, /rubric, /awards).
 */
export function setupCollectionRoutes(
  kind: SetupKind,
  createSchema: ZodType<Record<string, unknown>>,
) {
  return {
    GET: handler({ auth: 'optional', event: {} }, async ({ access }) => {
      const setup = await getEventSetup(getSql(), access.event.id);
      return json({ items: setup[kind] });
    }),
    POST: handler(
      { event: { permission: 'event.edit' }, body: createSchema },
      async ({ access, body }) => {
        const item = await tx((sql) => createSetupItem(sql, kind, access.event.id, body));
        return json(item, 201);
      },
    ),
  };
}

/** PATCH and DELETE for /events/{id}/{kind}/{itemId}: owner, admin. Deletes are audited. */
export function setupItemRoutes(kind: SetupKind, updateSchema: ZodType<Record<string, unknown>>) {
  return {
    PATCH: handler(
      { event: { permission: 'event.edit' }, params: eventItemParamsSchema, body: updateSchema },
      async ({ access, params, body }) => {
        const item = await tx((sql) =>
          updateSetupItem(sql, kind, access.event.id, params.itemId, body),
        );
        return json(item);
      },
    ),
    DELETE: handler(
      { event: { permission: 'event.edit' }, params: eventItemParamsSchema },
      async ({ access, params, userId }) => {
        await tx((sql) => deleteSetupItem(sql, kind, access.event.id, params.itemId, userId));
        return noContent();
      },
    ),
  };
}
