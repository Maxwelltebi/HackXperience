import { describe, expect, it } from 'vitest';
import { escapeHtml, renderApplicationDecision } from './index';

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
