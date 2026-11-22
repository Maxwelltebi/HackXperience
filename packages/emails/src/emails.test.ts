import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  renderApplicationDecision,
  renderSubmissionReminder,
  renderStaffAdded,
  renderStaffInvite,
  renderTeamAssigned,
} from './index';

const base = {
  name: 'Ama Mensah',
  eventName: 'The CIReN Experience 5.0',
  eventUrl: 'https://hack.ciren.network/events/the-ciren-experience-5-0',
};

describe('renderApplicationDecision', () => {
  it.each(['accepted', 'waitlisted', 'rejected'] as const)(
    'renders a %s email with HTML and plain text',
    (status) => {
      const email = renderApplicationDecision({ ...base, status });
      expect(email.subject).toContain(base.eventName);
      expect(email.html).toContain('<!doctype html>');
      expect(email.text).toContain('Hi Ama Mensah,');
      expect(email.text).not.toContain('<');
    },
  );

  it('links to the event to confirm when accepted', () => {
    const email = renderApplicationDecision({ ...base, status: 'accepted' });
    expect(email.html).toContain(`href="${base.eventUrl}"`);
    expect(email.text).toContain(`Confirm your place: ${base.eventUrl}`);
  });

  it('escapes names and event names in HTML', () => {
    const email = renderApplicationDecision({
      ...base,
      name: '<script>alert(1)</script>',
      status: 'rejected',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('greets someone with no name', () => {
    expect(renderApplicationDecision({ ...base, name: ' ', status: 'waitlisted' }).text).toContain(
      'Hi there,',
    );
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('renderSubmissionReminder', () => {
  const reminder = {
    name: 'Ama Mensah',
    eventName: 'The CIReN Experience 5.0',
    deadlineText: 'Sat 6 Dec 2026, 18:00 GMT',
    editorUrl: 'https://hack.ciren.network/events/the-ciren-experience-5-0/submission',
  };

  it.each(['24h', '1h'] as const)(
    'renders the %s reminder with the deadline and a link',
    (kind) => {
      const email = renderSubmissionReminder({ ...reminder, kind });
      expect(email.subject).toContain(kind === '24h' ? '24 hours' : '1 hour');
      expect(email.text).toContain(reminder.deadlineText);
      expect(email.text).toContain(`Open your submission: ${reminder.editorUrl}`);
      expect(email.html).toContain(`href="${reminder.editorUrl}"`);
    },
  );
});

describe('renderTeamAssigned', () => {
  it('names the team and the teammates, with a link to the team page', () => {
    const email = renderTeamAssigned({
      name: 'Ama Mensah',
      eventName: 'The CIReN Experience 5.0',
      teamName: 'Team 3',
      teammates: ['Efua Owusu', 'Kwame Boateng'],
      teamUrl: 'https://hack.ciren.network/events/x/team',
    });
    expect(email.subject).toBe('Your team for The CIReN Experience 5.0: Team 3');
    expect(email.text).toContain('Efua Owusu, Kwame Boateng');
    expect(email.html).toContain('https://hack.ciren.network/events/x/team');
  });

  it('escapes names in the HTML', () => {
    const email = renderTeamAssigned({
      name: '<b>Ama</b>',
      eventName: 'Event',
      teamName: 'Team <1>',
      teammates: [],
      teamUrl: 'https://hack.ciren.network/events/x/team',
    });
    expect(email.html).not.toContain('<b>Ama</b>');
    expect(email.html).not.toContain('Team <1>');
  });
});

describe('staff role emails (R39)', () => {
  it('tells someone with an account their role, with a link to their tools', () => {
    const email = renderStaffAdded({
      name: 'Kofi',
      eventName: 'The CIReN Experience 5.0',
      role: 'judge',
      toolsUrl: 'https://hack.ciren.network/organize/e1',
    });
    expect(email.subject).toBe("You're a judge at The CIReN Experience 5.0");
    expect(email.text).toContain('score the projects assigned to you');
    expect(email.html).toContain('https://hack.ciren.network/organize/e1');
  });

  it('invites someone with no account to sign in with the invited address', () => {
    const email = renderStaffInvite({
      email: 'mentor@example.com',
      eventName: 'The CIReN Experience 5.0',
      role: 'mentor',
      inviterName: 'Maxwell Tebi',
      signInUrl: 'https://hack.ciren.network/sign-in?next=%2Forganize%2Fe1',
    });
    expect(email.subject).toBe("You're invited to be a mentor at The CIReN Experience 5.0");
    expect(email.text).toContain('mentor@example.com');
    expect(email.text).toContain('Maxwell Tebi invited you');
    expect(email.html).toContain('sign-in?next=%2Forganize%2Fe1');
  });
});
