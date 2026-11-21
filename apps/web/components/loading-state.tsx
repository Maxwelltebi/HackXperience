'use client';

import { useEffect, useState } from 'react';

/*
 * LOADING STATE: a pixel-grid loader for anything that waits on the network.
 *
 * Variants:
 *   drive: square cells, a chevron wavefront driving right; the 650 ms cycle is shorter than
 *          the sweep, so two fronts are always in flight
 *   dots:  the same wavefront, round cells
 *   orbit: a comet lapping the grid's edge
 *
 * Next to the grid, one word at a time in a shuffled order ("Fetching…", "Gathering…"), with a
 * shimmer, and a live elapsed timer in mono figures. Reduced motion freezes the grid and the
 * shimmer (globals.css); the word and the timer still change.
 */

const chevron = Array.from({ length: 9 }, (_, i) => {
  const row = Math.floor(i / 3);
  const col = i % 3;
  return (col + Math.abs(row - 1)) * 90;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, i) => {
  const k = ORBIT_ORDER.indexOf(i);
  return k === -1 ? null : k * 110;
});

export type LoaderVariant = 'drive' | 'dots' | 'orbit';

const PATTERNS: Record<LoaderVariant, { delays: (number | null)[]; dur: number; round: boolean }> =
  {
    drive: { delays: chevron, dur: 650, round: false },
    dots: { delays: chevron, dur: 650, round: true },
    orbit: { delays: orbit, dur: 950, round: false },
  };

/** The words shown one at a time while something loads. */
export const LOADING_WORDS = [
  'Loading',
  'Fetching',
  'Thinking',
  'Churning',
  'Gathering',
  'Sorting',
  'Checking',
  'Preparing',
  'Assembling',
  'Syncing',
  'Reading',
  'Counting',
] as const;

/** A new random order of `items` (Fisher–Yates). Never starts with `avoid`, if it can help it. */
export function shuffled<T>(
  items: readonly T[],
  avoid?: T,
  random: () => number = Math.random,
): T[] {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j] as T, deck[i] as T];
  }
  if (deck.length > 1 && deck[0] === avoid) deck.push(deck.shift() as T);
  return deck;
}

/** "4.2s", then "1m 3.0s" past a minute. */
export function formatElapsed(tenths: number): string {
  const total = tenths / 10;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

function useElapsed(): string {
  const [tenths, setTenths] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTenths((t) => t + 1), 100);
    return () => window.clearInterval(timer);
  }, []);
  return formatElapsed(tenths);
}

/**
 * One word at a time from `words`, in a shuffled order that reshuffles when it runs out. The
 * first word is always the first in the list, so the server and the browser render the same thing.
 */
function useShuffledWord(words: readonly string[], everyMs: number): string {
  const [word, setWord] = useState(words[0] ?? '');
  useEffect(() => {
    if (words.length < 2) return;
    let deck = shuffled(words, words[0]);
    let last = words[0];
    const timer = window.setInterval(() => {
      if (deck.length === 0) deck = shuffled(words, last);
      last = deck.shift() ?? last;
      setWord(last ?? '');
    }, everyMs);
    return () => window.clearInterval(timer);
  }, [words, everyMs]);
  return word;
}

/** The 3 × 3 grid on its own, for inside a button ("Saving…"). Takes the text color. */
export function PixelGrid({ variant = 'drive' }: { variant?: LoaderVariant }) {
  const { delays, dur, round } = PATTERNS[variant];
  return (
    <span aria-hidden="true" className={round ? 'pixel-grid pixel-grid-round' : 'pixel-grid'}>
      {delays.map((delay, i) => (
        <span
          key={i}
          className={delay === null ? 'pixel-off' : undefined}
          style={
            delay === null
              ? undefined
              : { animation: `pixel-on ${dur}ms ease-in-out ${delay}ms infinite` }
          }
        />
      ))}
    </span>
  );
}

/**
 * The full loader: grid, one shuffled word at a time, elapsed time. `label` is what screen
 * readers hear; the moving word is hidden from them.
 */
export function LoadingState({
  label = 'Loading',
  words = LOADING_WORDS,
  variant = 'drive',
  everyMs = 1800,
}: {
  label?: string;
  words?: readonly string[];
  variant?: LoaderVariant;
  everyMs?: number;
}) {
  const elapsed = useElapsed();
  const word = useShuffledWord(words, everyMs);
  return (
    <span className="loading-state" role="status">
      <span className="visually-hidden">{label}</span>
      <PixelGrid variant={variant} />
      <span key={word} className="loading-word" aria-hidden="true">
        {word}…
      </span>
      <span className="loading-time" aria-hidden="true">
        {elapsed}
      </span>
    </span>
  );
}

/** A button label while its request runs: the grid, then the words ("Saving…"). */
export function Busy({ children }: { children: string }) {
  return (
    <>
      <PixelGrid />
      {children}
    </>
  );
}
