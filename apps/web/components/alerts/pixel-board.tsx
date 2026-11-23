import type { CSSProperties } from 'react';

/**
 * The event alerts pop-up's pixel display (R42): a 21 × 7 grid of square cells on the dark band.
 *
 * - idle:    the HX mark, with a few cells flickering
 * - typing:  a meter along the bottom row fills as the email is typed
 * - ready:   the email looks right: an arrow that nudges toward the button
 * - sending: the arrow, with a wave across the columns
 * - done:    a check mark, drawn left to right
 *
 * Reduced motion stops every animation (globals.css).
 */
export type BoardMode = 'idle' | 'typing' | 'ready' | 'sending' | 'done';

const COLS = 21;
const ROWS = 7;

const GLYPHS = {
  hx: [
    '.....#...#.#...#.....',
    '.....#...#.#...#.....',
    '.....#...#..#.#......',
    '.....#####...#.......',
    '.....#...#..#.#......',
    '.....#...#.#...#.....',
    '.....#...#.#...#.....',
  ],
  arrow: [
    '.....................',
    '............#........',
    '.............#.......',
    '.....##########......',
    '.............#.......',
    '............#........',
    '.....................',
  ],
  check: [
    '.....................',
    '..............#......',
    '.............#.......',
    '......#.....#........',
    '.......#...#.........',
    '........#.#..........',
    '.........#...........',
  ],
} as const;

/** A fixed pseudo-random number in [0, 1) per cell, so the flicker looks scattered but renders the same on server and client. */
function noise(row: number, col: number): number {
  return (((row * 31 + col * 17) * 9301 + 49297) % 233280) / 233280;
}

export function PixelBoard({ mode, progress = 0 }: { mode: BoardMode; progress?: number }) {
  const glyphName =
    mode === 'done' ? 'check' : mode === 'ready' || mode === 'sending' ? 'arrow' : 'hx';
  const glyph = GLYPHS[glyphName];
  const meter = mode === 'typing' ? Math.max(1, Math.round(progress * COLS)) : 0;

  const cells = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const on = glyph[row]?.[col] === '#';
      const metered = !on && row === ROWS - 1 && col < meter;
      const n = noise(row, col);
      const flicker = !on && !metered && mode === 'idle' && n < 0.22;
      const className = ['px', on && 'px-on', metered && 'px-meter', flicker && 'px-flicker']
        .filter(Boolean)
        .join(' ');
      cells.push(
        <span
          key={`${row}-${col}`}
          className={className}
          style={{ '--c': col, '--n': n } as CSSProperties}
        />,
      );
    }
  }

  // Keyed on the glyph, so a new glyph remounts its cells and its draw-in animation runs.
  return (
    <div key={glyphName} className={`pixel-board pixel-board-${mode}`} aria-hidden="true">
      {cells}
    </div>
  );
}
