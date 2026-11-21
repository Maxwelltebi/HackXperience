'use client';

import { SKILL_LABELS, SKILL_SCALE, SKILLS, type Skill, type SkillRatings } from '@hx/shared';
import { useId } from 'react';
import { AlertIcon } from './icons';

export type RatingsDraft = Partial<SkillRatings>;

const STEPS = Array.from(
  { length: SKILL_SCALE.max - SKILL_SCALE.min + 1 },
  (_, i) => SKILL_SCALE.min + i,
);

/** True when all four skills have a rating. */
export function ratingsComplete(value: RatingsDraft): value is SkillRatings {
  return SKILLS.every((skill) => typeof value[skill] === 'number');
}

/**
 * The four built-in skills (R36), each rated 1 to 5 with toggle chips. Organizers use the
 * ratings to form balanced teams.
 */
export function SkillRatingsInput({
  value,
  onChange,
  error,
}: {
  value: RatingsDraft;
  onChange: (next: RatingsDraft) => void;
  error?: string | undefined;
}) {
  const id = useId();
  return (
    <fieldset className="skill-ratings" aria-describedby={`${id}-scale`}>
      <legend className="label">Rate your skills</legend>
      <p id={`${id}-scale`} className="hint" style={{ margin: 0 }}>
        1 is {SKILL_SCALE.low.toLowerCase()}, 5 is {SKILL_SCALE.high.toLowerCase()}. Organizers use
        these to make teams with a fair mix of skills.
      </p>
      {SKILLS.map((skill) => (
        <SkillRow
          key={skill}
          skill={skill}
          name={`${id}-${skill}`}
          rating={value[skill]}
          onPick={(rating) => onChange({ ...value, [skill]: rating })}
        />
      ))}
      {error ? (
        <span className="field-error" role="alert">
          <AlertIcon width={16} height={16} /> {error}
        </span>
      ) : null}
    </fieldset>
  );
}

function SkillRow({
  skill,
  name,
  rating,
  onPick,
}: {
  skill: Skill;
  name: string;
  rating: number | undefined;
  onPick: (rating: number) => void;
}) {
  return (
    <fieldset className="skill-row">
      <legend>{SKILL_LABELS[skill]}</legend>
      <div className="toggle-chips">
        {STEPS.map((step) => (
          <label key={step} className="toggle-chip rating-chip">
            <input
              type="radio"
              name={name}
              value={step}
              checked={rating === step}
              onChange={() => onPick(step)}
            />
            {step}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
