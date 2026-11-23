export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LayoutInput {
  /** Short line shown in inbox previews. */
  preview: string;
  heading: string;
  /** Paragraphs of plain text; escaped here. */
  paragraphs: string[];
  action?: { label: string; url: string };
  /** Alert emails (R42) say why they came and link to the unsubscribe page. */
  unsubscribe?: { reason: string; url: string };
}

const FOOTER = 'HackXperience by CIReN · hack.ciren.network';

/**
 * One simple, table-free layout with inline styles: it renders in Gmail and Outlook and
 * stays small for mobile data. Colors from the design foundations.
 */
export function layout(input: LayoutInput): { html: string; text: string } {
  const paragraphs = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1F2A37">${escapeHtml(p)}</p>`,
    )
    .join('');
  const action = input.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#046E00;color:#ffffff;font-weight:600;text-decoration:none">${escapeHtml(input.action.label)}</a></p>`
    : '';
  const unsubscribe = input.unsubscribe
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:20px;color:#5B6676">${escapeHtml(input.unsubscribe.reason)} <a href="${escapeHtml(input.unsubscribe.url)}" style="color:#5B6676">Unsubscribe</a></p>`
    : '';

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(input.heading)}</title></head><body style="margin:0;padding:24px 16px;background:#E6EBF1;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif"><span style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.preview)}</span><div style="max-width:560px;margin:0 auto;background:#EEF2F6;border-radius:24px;padding:32px 28px"><p style="margin:0 0 24px;font-weight:800;font-size:18px;color:#1F2A37">Hack<span style="color:#046E00">X</span>perience</p><h1 style="margin:0 0 16px;font-size:24px;line-height:30px;color:#1F2A37">${escapeHtml(input.heading)}</h1>${paragraphs}${action}<p style="margin:32px 0 0;font-size:13px;color:#5B6676">${FOOTER}</p>${unsubscribe}</div></body></html>`;

  const text = [
    input.heading,
    '',
    ...input.paragraphs.flatMap((p) => [p, '']),
    ...(input.action ? [`${input.action.label}: ${input.action.url}`, ''] : []),
    '--',
    FOOTER,
    ...(input.unsubscribe
      ? [input.unsubscribe.reason, `Unsubscribe: ${input.unsubscribe.url}`]
      : []),
  ].join('\n');

  return { html, text };
}
