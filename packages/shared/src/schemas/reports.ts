import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './base';

const countsSchema = z.array(z.object({ value: z.string(), count: z.number().int() }));

/** Impact numbers for grant applications (DESIGN Step 3, "Where the impact report comes from"). */
export const impactFiguresSchema = z.object({
  applicants: z.number().int(),
  /** Offered a place: accepted, then confirmed or declined. */
  accepted: z.number().int(),
  confirmed: z.number().int(),
  checked_in: z.number().int(),
  /** Demographics of checked-in participants; blank answers count as "Not given". */
  demographics: z.object({
    school: countsSchema,
    level_of_study: countsSchema,
    country: countsSchema,
    gender: countsSchema,
  }),
  teams: z.number().int(),
  submissions: z.number().int(),
  /** Submitted projects over teams; null with no teams. */
  completion_rate: z.number().nullable(),
  mentor_requests: z.number().int(),
  mentor_resolved: z.number().int(),
  /** Median minutes from asking to a mentor claiming it; null with no claims. */
  median_response_minutes: z.number().nullable(),
});
export type ImpactFigures = z.infer<typeof impactFiguresSchema>;

export const eventImpactSchema = impactFiguresSchema.extend({
  event_id: uuidSchema,
  event_name: z.string(),
  starts_at: isoDateTimeSchema,
});
export type EventImpact = z.infer<typeof eventImpactSchema>;

/** GET /orgs/{orgId}/reports/impact?from=&to=: events starting in the range, and totals. */
export const orgImpactSchema = z.object({
  org_id: uuidSchema,
  from: z.string().nullable(),
  to: z.string().nullable(),
  events: z.array(eventImpactSchema),
  totals: impactFiguresSchema,
  /** People checked in at more than one of these events. */
  returning_participants: z.number().int(),
});
export type OrgImpact = z.infer<typeof orgImpactSchema>;

export const reportFormatQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
});

const dateOnly = z.iso.date({ message: 'Use a date like 2026-12-31.' });
export const orgReportQuerySchema = reportFormatQuerySchema.extend({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});
