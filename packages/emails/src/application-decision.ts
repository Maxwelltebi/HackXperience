import { layout, type RenderedEmail } from './layout';

export interface ApplicationDecisionData {
  name: string;
  eventName: string;
  status: 'accepted' | 'waitlisted' | 'rejected';
  /** Link to the event page, where the applicant sees their status and RSVPs. */
  eventUrl: string;
}

/** The email sent 10 minutes after an organizer decides an application. */
export function renderApplicationDecision(data: ApplicationDecisionData): RenderedEmail {
  const greeting = `Hi ${data.name.trim() || 'there'},`;

  if (data.status === 'accepted') {
    return {
      subject: `You're in: ${data.eventName}`,
      ...layout({
        preview: `Confirm your place at ${data.eventName}.`,
        heading: `You're in for ${data.eventName}`,
        paragraphs: [
          greeting,
          `Your application to ${data.eventName} was accepted. Confirm your place so we can save you a seat; your ticket appears once you confirm.`,
          "If you can't make it, decline instead so someone on the waitlist can take your place.",
        ],
        action: { label: 'Confirm your place', url: data.eventUrl },
      }),
    };
  }

  if (data.status === 'waitlisted') {
    return {
      subject: `You're on the waitlist: ${data.eventName}`,
      ...layout({
        preview: `We'll email you if a place opens up at ${data.eventName}.`,
        heading: `You're on the waitlist for ${data.eventName}`,
        paragraphs: [
          greeting,
          `Thanks for applying to ${data.eventName}. Every place is taken for now, so you're on the waitlist. If a place opens up, we'll email you.`,
        ],
        action: { label: 'See your application', url: data.eventUrl },
      }),
    };
  }

  return {
    subject: `Your application to ${data.eventName}`,
    ...layout({
      preview: `An update on your application to ${data.eventName}.`,
      heading: `About your application to ${data.eventName}`,
      paragraphs: [
        greeting,
        `Thanks for applying to ${data.eventName}. We couldn't offer you a place this time.`,
        'We hope to see you at the next CIReN hackathon.',
      ],
    }),
  };
}
