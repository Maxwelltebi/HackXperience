import { layout, type RenderedEmail } from './layout';

export type StaffRoleName = 'owner' | 'admin' | 'judge' | 'mentor' | 'volunteer';

/** What each role does, in one line, for the emails. */
const ROLE_LINES: Record<StaffRoleName, { title: string; line: string }> = {
  owner: { title: 'an owner', line: 'You can run every part of the event.' },
  admin: {
    title: 'an admin',
    line: 'You can review applications, check people in, run judging and post announcements.',
  },
  judge: {
    title: 'a judge',
    line: 'You score the projects assigned to you once judging starts.',
  },
  mentor: { title: 'a mentor', line: 'You help teams who ask for a mentor during the event.' },
  volunteer: {
    title: 'a volunteer',
    line: "You check people in at the door with your phone's camera.",
  },
};

export interface StaffAddedData {
  name: string;
  eventName: string;
  role: StaffRoleName;
  /** The person's tools for this event. */
  toolsUrl: string;
}

/** Sent when someone with an account is given a staff role (R39). */
export function renderStaffAdded(data: StaffAddedData): RenderedEmail {
  const role = ROLE_LINES[data.role];
  return {
    subject: `You're ${role.title} at ${data.eventName}`,
    ...layout({
      preview: `Your role at ${data.eventName} is ready.`,
      heading: `You're ${role.title} at ${data.eventName}`,
      paragraphs: [
        `Hi ${data.name.trim() || 'there'},`,
        `The organizers added you to ${data.eventName} as ${role.title}. ${role.line}`,
        'Sign in to HackXperience and open Organize to see your tools for this event.',
      ],
      action: { label: 'Open your tools', url: data.toolsUrl },
    }),
  };
}

export interface StaffInviteData {
  /** The address the invitation was sent to: they must sign in with it. */
  email: string;
  eventName: string;
  role: StaffRoleName;
  inviterName: string;
  /** The sign-in page, returning to their tools for this event. */
  signInUrl: string;
}

/** Sent when someone with no account yet is given a staff role (R39). */
export function renderStaffInvite(data: StaffInviteData): RenderedEmail {
  const role = ROLE_LINES[data.role];
  const from = data.inviterName.trim() || 'The organizers';
  return {
    subject: `You're invited to be ${role.title} at ${data.eventName}`,
    ...layout({
      preview: `Sign in to HackXperience with ${data.email} to accept.`,
      heading: `You're invited to be ${role.title}`,
      paragraphs: [
        'Hi there,',
        `${from} invited you to ${data.eventName} as ${role.title}. ${role.line}`,
        `To accept, sign in to HackXperience with the Google or GitHub account that uses ${data.email}. Signing in creates your account, and your role is added straight away. There's no password to set.`,
        'If your Google or GitHub account uses a different email address, ask the organizers to invite that address instead.',
      ],
      action: { label: 'Sign in to accept', url: data.signInUrl },
    }),
  };
}
