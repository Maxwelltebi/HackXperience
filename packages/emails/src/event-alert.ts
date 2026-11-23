import { layout, type RenderedEmail } from './layout';

export type EventAlertKindName = 'published' | 'applications_open' | 'closing_soon';

export interface EventAlertData {
  kind: EventAlertKindName;
  eventName: string;
  /** "In person · Accra, Ghana" */
  where: string;
  /** Formatted in the event's time zone. Null when the event has no application window. */
  applicationsOpen: string | null;
  applicationsClose: string | null;
  /** Applications are open at the moment the email is written. */
  applicationsOpenNow: boolean;
  startsAt: string;
  eventUrl: string;
  unsubscribeUrl: string;
}

const REASON =
  'You get this email because you signed up for CIReN event alerts on hack.ciren.network.';

/** Event alerts (R42): a new event, applications open, applications closing soon. */
export function renderEventAlert(data: EventAlertData): RenderedEmail {
  const unsubscribe = { reason: REASON, url: data.unsubscribeUrl };
  const starts = `Hacking starts ${data.startsAt}.`;

  if (data.kind === 'published') {
    const applications = data.applicationsOpenNow
      ? `Applications are open until ${data.applicationsClose}.`
      : data.applicationsOpen
        ? `Applications open ${data.applicationsOpen}. We'll email you when they do.`
        : null;
    return {
      subject: `New CIReN hackathon: ${data.eventName}`,
      ...layout({
        preview: data.applicationsOpenNow
          ? `Applications are open until ${data.applicationsClose}.`
          : starts,
        heading: `${data.eventName} is on the calendar`,
        paragraphs: [
          `CIReN has published a new hackathon: ${data.eventName}. ${data.where}.`,
          ...(applications ? [applications] : []),
          starts,
        ],
        action: { label: 'See the event', url: data.eventUrl },
        unsubscribe,
      }),
    };
  }

  if (data.kind === 'applications_open') {
    return {
      subject: `Applications are open for ${data.eventName}`,
      ...layout({
        preview: `Apply by ${data.applicationsClose}.`,
        heading: `Applications are open for ${data.eventName}`,
        paragraphs: [
          `You can apply for ${data.eventName} until ${data.applicationsClose}. ${data.where}.`,
          starts,
          'Sign in with Google or GitHub to apply. It takes a few minutes.',
        ],
        action: { label: 'Apply now', url: data.eventUrl },
        unsubscribe,
      }),
    };
  }

  return {
    subject: `Applications for ${data.eventName} close in 2 days`,
    ...layout({
      preview: `Applications close ${data.applicationsClose}.`,
      heading: `Applications close in 2 days`,
      paragraphs: [
        `Applications for ${data.eventName} close ${data.applicationsClose}. If you want a place, apply before then.`,
        starts,
      ],
      action: { label: 'Apply now', url: data.eventUrl },
      unsubscribe,
    }),
  };
}
