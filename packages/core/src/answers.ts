import type { ApplicationQuestion, Answers, FieldErrors } from '@hx/shared';

const MAX_LENGTH = { short_text: 300, long_text: 5000, url: 500 } as const;

export type AnswersResult = { ok: true; answers: Answers } | { ok: false; fields: FieldErrors };

/**
 * Checks answers against the event's questions. Returns trimmed answers with blanks
 * dropped, or field errors keyed "answers.<question id>".
 */
export function validateAnswers(
  questions: readonly ApplicationQuestion[],
  answers: Answers,
): AnswersResult {
  const fields: FieldErrors = {};
  const clean: Answers = {};
  const known = new Set(questions.map((q) => q.id));

  for (const key of Object.keys(answers)) {
    if (!known.has(key)) fields[`answers.${key}`] = 'Not a question on this form.';
  }

  for (const question of questions) {
    const result = checkAnswer(question, answers[question.id]);
    if ('error' in result) fields[`answers.${question.id}`] = result.error;
    else if (result.value !== undefined) clean[question.id] = result.value;
  }

  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, answers: clean };
}

type Checked = { value: string | string[] | undefined } | { error: string };

function checkAnswer(question: ApplicationQuestion, raw: string | string[] | undefined): Checked {
  const value = typeof raw === 'string' ? raw.trim() : raw;
  const blank = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  if (blank)
    return question.required ? { error: 'This question is required.' } : { value: undefined };

  switch (question.type) {
    case 'short_text':
    case 'long_text':
      if (typeof value !== 'string') return { error: 'Enter text.' };
      if (value.length > MAX_LENGTH[question.type]) {
        return { error: `Keep it under ${MAX_LENGTH[question.type]} characters.` };
      }
      return { value };
    case 'url':
      if (typeof value !== 'string' || !isWebUrl(value) || value.length > MAX_LENGTH.url) {
        return { error: 'Enter the full link, starting with https://' };
      }
      return { value };
    case 'single_choice':
      if (typeof value !== 'string' || !question.options?.includes(value)) {
        return { error: 'Choose one of the options.' };
      }
      return { value };
    case 'multi_choice': {
      if (!Array.isArray(value)) return { error: 'Choose from the options.' };
      const unique = Array.from(new Set(value));
      if (unique.some((choice) => !question.options?.includes(choice))) {
        return { error: 'Choose from the options.' };
      }
      return { value: unique };
    }
  }
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}
