import type { EventStatus } from '@hx/shared';

/** Allowed event status changes (DESIGN Step 4 rule 2: status changes are checked actions). */
export const EVENT_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  draft: ['published'],
  published: ['draft', 'live'],
  live: ['judging'],
  judging: ['completed'],
  completed: [],
};

export interface EventTransitionContext {
  event: {
    status: EventStatus;
    applications_open_at: string | null;
    applications_close_at: string | null;
    ends_at: string;
    submission_deadline: string;
  };
  /** The database's now(), never the client's clock (Agent rule 10). */
  now: Date;
  applicationCount: number;
  rubricCount: number;
}

export type TransitionResult = { ok: true } | { ok: false; reasons: string[] };

/**
 * Whether the event may move to `to`, and if not, why. The checks per transition:
 * - publish: an application window that opens before it closes, closing by the event's end
 * - back to draft: only while nobody has applied
 * - start judging: the submission deadline has passed and the rubric has at least one criterion
 * Phase 5 adds the checks for completing (all scores in, results snapshot).
 */
export function checkEventTransition(
  to: EventStatus,
  ctx: EventTransitionContext,
): TransitionResult {
  const from = ctx.event.status;
  if (!EVENT_TRANSITIONS[from].includes(to)) {
    return { ok: false, reasons: [`An event can't go from ${from} to ${to}.`] };
  }

  const reasons: string[] = [];
  if (to === 'published') reasons.push(...publishProblems(ctx.event));
  if (from === 'published' && to === 'draft' && ctx.applicationCount > 0) {
    reasons.push('People have already applied, so the event can’t go back to draft.');
  }
  if (to === 'judging') {
    if (ctx.now < new Date(ctx.event.submission_deadline)) {
      reasons.push('Judging starts after the submission deadline.');
    }
    if (ctx.rubricCount === 0) reasons.push('Add at least one rubric criterion first.');
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

function publishProblems(event: EventTransitionContext['event']): string[] {
  const { applications_open_at: open, applications_close_at: close } = event;
  if (!open || !close) return ['Set when applications open and close.'];
  const problems: string[] = [];
  if (new Date(open) >= new Date(close)) problems.push('Applications must open before they close.');
  if (new Date(close) > new Date(event.ends_at)) {
    problems.push('Applications must close by the end of the event.');
  }
  return problems;
}
