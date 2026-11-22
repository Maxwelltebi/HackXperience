// R40 and R41: owners open the gallery at any time; teams add images to their project.
// Storage is faked in tests/setup.ts: uploads always "arrive" unless the path says "missing".
import { createTeam, getSql, tx } from '@hx/db';
import { confirmApplicant } from '@hx/db/testing';
import {
  eventSchema,
  galleryPageSchema,
  imageUploadSchema,
  projectImageListSchema,
} from '@hx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as publishGallery } from '@/app/api/v1/events/[id]/gallery/route';
import { GET as gallery } from '@/app/api/v1/events/[id]/submissions/route';
import { DELETE as removeImage } from '@/app/api/v1/events/[id]/teams/me/images/[imageId]/route';
import {
  GET as listImages,
  POST as addImage,
  PUT as arrangeImages,
} from '@/app/api/v1/events/[id]/teams/me/images/route';
import { POST as uploadLink } from '@/app/api/v1/events/[id]/teams/me/images/upload/route';
import { PUT as saveSubmission } from '@/app/api/v1/events/[id]/teams/me/submission/route';
import { POST as submit } from '@/app/api/v1/events/[id]/teams/me/submission/submit/route';
import { call, expectError, fixtures } from './helpers';

const fx = fixtures();
const sql = getSql();
afterAll(() => fx.cleanup());

let eventId: string;
let people: Awaited<ReturnType<typeof fx.eventWithRoles>>['people'];

beforeAll(async () => {
  const result = await fx.eventWithRoles();
  eventId = result.event.id;
  people = result.people;
  await confirmApplicant(sql, eventId, people.participant.id);
  await tx((t) => createTeam(t, eventId, people.participant.id, crypto.randomUUID(), 'Pixels'));
});

const params = () => ({ id: eventId });
const asMember = { as: '' };
beforeAll(() => {
  asMember.as = people.participant.id;
});

async function uploadOne(): Promise<string> {
  const response = await call(uploadLink, {
    method: 'POST',
    as: asMember.as,
    params: params(),
    body: { content_type: 'image/png', size: 2048 },
  });
  return imageUploadSchema.parse(await response.json()).path;
}

async function add(path: string, caption = '') {
  return call(addImage, {
    method: 'POST',
    as: asMember.as,
    params: params(),
    body: { path, caption, width: 1600, height: 1000 },
  });
}

describe('project images', () => {
  it('gives a member an upload link into their team folder; refuses others', async () => {
    const path = await uploadOne();
    expect(path).toMatch(new RegExp(`^${eventId}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.png$`));
    await expectError(
      await call(uploadLink, {
        method: 'POST',
        as: people.judge.id,
        params: params(),
        body: { content_type: 'image/png', size: 2048 },
      }),
      404,
      'NOT_ON_TEAM',
    );
    await expectError(
      await call(uploadLink, {
        method: 'POST',
        as: asMember.as,
        params: params(),
        body: { content_type: 'image/gif', size: 2048 },
      }),
      400,
      'VALIDATION_FAILED',
    );
    await expectError(
      await call(uploadLink, {
        method: 'POST',
        as: asMember.as,
        params: params(),
        body: { content_type: 'image/png', size: 6 * 1024 * 1024 },
      }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('adds uploaded images in order, and refuses a path outside the team folder', async () => {
    const first = await add(await uploadOne(), 'The home screen');
    expect(first.status).toBe(201);
    await add(await uploadOne(), 'The map');
    const list = projectImageListSchema.parse(
      await (await call(listImages, { as: asMember.as, params: params() })).json(),
    );
    expect(list.items.map((i) => i.caption)).toEqual(['The home screen', 'The map']);

    await expectError(
      await add(`${eventId}/${crypto.randomUUID()}/${crypto.randomUUID()}.png`),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('reorders and captions; refuses a list that misses an image', async () => {
    const { items } = projectImageListSchema.parse(
      await (await call(listImages, { as: asMember.as, params: params() })).json(),
    );
    const [a, b] = items;
    if (!a || !b) throw new Error('two images expected');
    const arranged = projectImageListSchema.parse(
      await (
        await call(arrangeImages, {
          method: 'PUT',
          as: asMember.as,
          params: params(),
          body: {
            images: [
              { id: b.id, caption: 'The map, now the cover' },
              { id: a.id, caption: a.caption },
            ],
          },
        })
      ).json(),
    );
    expect(arranged.items.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(arranged.items[0]?.caption).toBe('The map, now the cover');
    await expectError(
      await call(arrangeImages, {
        method: 'PUT',
        as: asMember.as,
        params: params(),
        body: { images: [{ id: a.id, caption: '' }] },
      }),
      409,
      'CONFLICT',
    );
  });

  it('keeps a project to six images', async () => {
    for (let i = 0; i < 4; i++) expect((await add(await uploadOne())).status).toBe(201);
    await expectError(
      await call(uploadLink, {
        method: 'POST',
        as: asMember.as,
        params: params(),
        body: { content_type: 'image/webp', size: 2048 },
      }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('removes an image', async () => {
    const { items } = projectImageListSchema.parse(
      await (await call(listImages, { as: asMember.as, params: params() })).json(),
    );
    const last = items.at(-1);
    if (!last) throw new Error('image expected');
    const after = projectImageListSchema.parse(
      await (
        await call(removeImage, {
          method: 'DELETE',
          as: asMember.as,
          params: { id: eventId, imageId: last.id },
        })
      ).json(),
    );
    expect(after.items).toHaveLength(items.length - 1);
  });
});

describe('gallery publishing', () => {
  beforeAll(async () => {
    const saved = await call(saveSubmission, {
      method: 'PUT',
      as: asMember.as,
      params: params(),
      body: { title: 'Pixels', write_up: 'Pictures of places.' },
      headers: { 'if-match': '0' },
    });
    expect(saved.status).toBe(200);
    expect((await call(submit, { method: 'POST', as: asMember.as, params: params() })).status).toBe(
      200,
    );
  });

  it('keeps the gallery private until an owner publishes it', async () => {
    await expectError(await call(gallery, { params: params() }), 404, 'RESULTS_NOT_PUBLISHED');
  });

  it.each(['admin', 'judge', 'participant'] as const)('refuses a %s', async (role) => {
    await expectError(
      await call(publishGallery, {
        method: 'POST',
        as: people[role].id,
        params: params(),
        body: { published: true },
      }),
      403,
      'FORBIDDEN',
    );
  });

  it('opens to everyone when the owner publishes it, with each project images', async () => {
    const event = eventSchema.parse(
      await (
        await call(publishGallery, {
          method: 'POST',
          as: people.owner.id,
          params: params(),
          body: { published: true },
        })
      ).json(),
    );
    expect(event.gallery_published_at).not.toBeNull();
    const page = galleryPageSchema.parse(await (await call(gallery, { params: params() })).json());
    expect(page.items.map((i) => i.title)).toEqual(['Pixels']);
    expect(page.items[0]?.images.length).toBeGreaterThan(0);
    const audits = await sql`
      select 1 from audit_log where event_id = ${eventId} and action = 'event.gallery_published'
    `;
    expect(audits).toHaveLength(1);
  });

  it('closes again when the owner hides it', async () => {
    await call(publishGallery, {
      method: 'POST',
      as: people.owner.id,
      params: params(),
      body: { published: false },
    });
    await expectError(await call(gallery, { params: params() }), 404, 'RESULTS_NOT_PUBLISHED');
  });

  it('refuses image changes after the deadline', async () => {
    await sql`
      update events set starts_at = now() - interval '2 hours',
             submission_deadline = now() - interval '1 minute'
      where id = ${eventId}
    `;
    await expectError(
      await call(uploadLink, {
        method: 'POST',
        as: asMember.as,
        params: params(),
        body: { content_type: 'image/png', size: 2048 },
      }),
      423,
      'SUBMISSION_LOCKED',
    );
  });
});
