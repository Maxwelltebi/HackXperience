import { layout, type RenderedEmail } from './layout';

export interface TeamAssignedData {
  name: string;
  eventName: string;
  teamName: string;
  /** The other members' names. */
  teammates: string[];
  /** Link to the team page. */
  teamUrl: string;
}

/** Sent when organizers publish teams they formed (R36). */
export function renderTeamAssigned(data: TeamAssignedData): RenderedEmail {
  const others =
    data.teammates.length === 0
      ? 'More people may join your team later.'
      : `Your teammates: ${data.teammates.join(', ')}.`;
  return {
    subject: `Your team for ${data.eventName}: ${data.teamName}`,
    ...layout({
      preview: `The organizers put you on ${data.teamName}.`,
      heading: `You're on ${data.teamName}`,
      paragraphs: [
        `Hi ${data.name.trim() || 'there'},`,
        `The organizers of ${data.eventName} formed the teams, and you're on ${data.teamName}. ${others}`,
        'Open your team page to see everyone and their schools, and to start your project together.',
      ],
      action: { label: 'Open your team', url: data.teamUrl },
    }),
  };
}
