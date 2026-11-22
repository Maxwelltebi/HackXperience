import {
  ApiError,
  PROJECT_IMAGES,
  type ProjectImage,
  type ProjectImageList,
  type ProjectImageType,
} from '@hx/shared';
import type { ISql } from './client';
import { lockEventForDeadline } from './guards';
import { lockMyTeam } from './teams';

/*
 * Project images (R41). Kept per team (so a team can add them before the project's first save)
 * in the project-images storage bucket under `{event}/{team}/{random}.{ext}`. Every change is a
 * deadline-sensitive write (Agent rules 7 and 8): event row FOR SHARE, then the team row. The
 * storage calls (signed upload, existence check, removal) happen in the route, outside any
 * transaction (Agent rule 9).
 */

const EXTENSIONS: Record<ProjectImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * The images of team `t` as a JSON array of ProjectImage, in display order. Use inside a query
 * that has the teams table as `t`.
 */
export function projectImagesJson(sql: ISql) {
  return sql`
    coalesce((select json_agg(json_build_object('id', i.id, 'path', i.path, 'caption', i.caption,
                                                'width', i.width, 'height', i.height)
                              order by i.position, i.created_at)
              from project_images i where i.team_id = t.id), '[]')
  `;
}

async function listImages(sql: ISql, teamId: string): Promise<ProjectImage[]> {
  return sql<ProjectImage[]>`
    select id, path, caption, width, height from project_images
    where team_id = ${teamId}
    order by position, created_at
  `;
}

async function myTeamId(sql: ISql, eventId: string, userId: string): Promise<string> {
  const [membership] = await sql<[{ team_id: string }?]>`
    select team_id from team_members where event_id = ${eventId} and user_id = ${userId}
  `;
  if (!membership) throw new ApiError('NOT_ON_TEAM', "You're not on a team at this event.");
  return membership.team_id;
}

/** GET /events/{id}/teams/me/images: the caller's team's images, cover first. */
export async function getMyImages(
  sql: ISql,
  eventId: string,
  userId: string,
): Promise<ProjectImageList> {
  return { items: await listImages(sql, await myTeamId(sql, eventId, userId)) };
}

/**
 * The checks before an upload link is made: the deadline, team membership and room for another
 * image. Returns where the file goes. Run inside tx(); the route then asks storage for the link.
 */
export async function planImageUpload(
  sql: ISql,
  eventId: string,
  userId: string,
  contentType: ProjectImageType,
): Promise<{ path: string }> {
  await lockEventForDeadline(sql, eventId);
  const team = await lockMyTeam(sql, eventId, userId);
  const [{ count }] = await sql<[{ count: number }]>`
    select count(*)::int as count from project_images where team_id = ${team.id}
  `;
  if (count >= PROJECT_IMAGES.max) {
    throw ApiError.validation(`A project can have up to ${PROJECT_IMAGES.max} images.`, {
      images: `Remove an image to add another (up to ${PROJECT_IMAGES.max}).`,
    });
  }
  return { path: `${eventId}/${team.id}/${crypto.randomUUID()}.${EXTENSIONS[contentType]}` };
}

/** Whether `path` is a file in this team's folder: nobody can register another team's file. */
export function isTeamPath(path: string, eventId: string, teamId: string): boolean {
  const prefix = `${eventId}/${teamId}/`;
  return (
    path.startsWith(prefix) && /^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(path.slice(prefix.length))
  );
}

/**
 * POST /events/{id}/teams/me/images: adds an uploaded file as the last image. The route has
 * already checked the file exists in storage. Run inside tx().
 */
export async function addImage(
  sql: ISql,
  eventId: string,
  userId: string,
  image: { path: string; caption: string; width: number | null; height: number | null },
): Promise<ProjectImageList> {
  await lockEventForDeadline(sql, eventId);
  const team = await lockMyTeam(sql, eventId, userId);
  if (!isTeamPath(image.path, eventId, team.id)) {
    throw ApiError.validation('That upload belongs to another project.', {
      path: 'Upload the image again.',
    });
  }
  const [{ count, next }] = await sql<[{ count: number; next: number }]>`
    select count(*)::int as count, coalesce(max(position), -1)::int + 1 as next
    from project_images where team_id = ${team.id}
  `;
  if (count >= PROJECT_IMAGES.max) {
    throw ApiError.validation(`A project can have up to ${PROJECT_IMAGES.max} images.`, {
      images: `Remove an image to add another (up to ${PROJECT_IMAGES.max}).`,
    });
  }
  await sql`
    insert into project_images (event_id, team_id, path, caption, position, width, height, uploaded_by)
    values (${eventId}, ${team.id}, ${image.path}, ${image.caption}, ${next},
            ${image.width}, ${image.height}, ${userId})
    on conflict (path) do nothing
  `;
  return { items: await listImages(sql, team.id) };
}

/**
 * PUT /events/{id}/teams/me/images: the new order (first is the cover) and captions. The list
 * must name every image exactly once. Run inside tx().
 */
export async function arrangeImages(
  sql: ISql,
  eventId: string,
  userId: string,
  images: { id: string; caption: string }[],
): Promise<ProjectImageList> {
  await lockEventForDeadline(sql, eventId);
  const team = await lockMyTeam(sql, eventId, userId);
  const current = await listImages(sql, team.id);
  const ids = new Set(images.map((i) => i.id));
  if (
    ids.size !== images.length ||
    ids.size !== current.length ||
    current.some((i) => !ids.has(i.id))
  ) {
    throw new ApiError('CONFLICT', 'The images changed. Reload to see the latest.');
  }
  for (const [position, image] of images.entries()) {
    await sql`
      update project_images set position = ${position}, caption = ${image.caption}
      where id = ${image.id} and team_id = ${team.id}
    `;
  }
  return { items: await listImages(sql, team.id) };
}

/**
 * DELETE /events/{id}/teams/me/images/{imageId}. Returns the storage path so the route can remove
 * the file after the transaction. Run inside tx().
 */
export async function deleteImage(
  sql: ISql,
  eventId: string,
  userId: string,
  imageId: string,
): Promise<{ list: ProjectImageList; path: string }> {
  await lockEventForDeadline(sql, eventId);
  const team = await lockMyTeam(sql, eventId, userId);
  const [removed] = await sql<[{ path: string }?]>`
    delete from project_images where id = ${imageId} and team_id = ${team.id}
    returning path
  `;
  if (!removed) throw new ApiError('NOT_FOUND', 'That image was already removed.');
  return { list: { items: await listImages(sql, team.id) }, path: removed.path };
}
