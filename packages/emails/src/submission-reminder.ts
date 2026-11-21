import { layout, type RenderedEmail } from './layout';

export interface SubmissionReminderData {
  name: string;
  eventName: string;
  kind: '24h' | '1h';
  /** The deadline in the recipient's time zone, e.g. "Sat 22 Nov, 18:00 GMT". */
  deadlineText: string;
  /** Link to the team's submission editor. */
  editorUrl: string;
}

/** Sent 24 hours and 1 hour before the deadline to teams that haven't pressed Submit. */
export function renderSubmissionReminder(data: SubmissionReminderData): RenderedEmail {
  const left = data.kind === '24h' ? 'about 24 hours' : 'under an hour';
  return {
    subject:
      data.kind === '24h'
        ? `24 hours left to submit: ${data.eventName}`
        : `1 hour left to submit: ${data.eventName}`,
    ...layout({
      preview: `Submissions close ${data.deadlineText}.`,
      heading: `You have ${left} to submit`,
      paragraphs: [
        `Hi ${data.name.trim() || 'there'},`,
        `Submissions for ${data.eventName} close ${data.deadlineText}. Your team hasn't pressed Submit yet.`,
        'At the deadline, a draft with a title and a write-up is submitted for you. An empty draft is not judged.',
      ],
      action: { label: 'Open your submission', url: data.editorUrl },
    }),
  };
}
