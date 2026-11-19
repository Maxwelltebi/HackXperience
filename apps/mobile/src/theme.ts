// HackXperience design foundations for React Native (HackXperience screens.pdf, page 1).
// Same tokens as apps/web/app/globals.css.

export const color = {
  surface: '#E6EBF1',
  ink: '#1F2A37',
  muted: '#5B6676',
  green: '#046E00',
  bright: '#40B830',
  forest: '#0B2416',
  success: '#17643E',
  warning: '#7A4F00',
  danger: '#A11F15',
  info: '#1C46B8',
  white: '#FFFFFF',
} as const;

/** One light source, top left. */
export const shadow = {
  raised: '-8px -8px 18px rgba(255, 255, 255, 0.9), 8px 8px 18px rgba(163, 177, 198, 0.65)',
  raisedSm: '-4px -4px 10px rgba(255, 255, 255, 0.9), 4px 4px 10px rgba(163, 177, 198, 0.6)',
  inset: 'inset 4px 4px 9px rgba(163, 177, 198, 0.6), inset -4px -4px 9px rgba(255, 255, 255, 0.9)',
} as const;

export const radius = {
  card: 28,
  control: 999,
} as const;

/** Phone controls are 52 px tall. */
export const controlHeight = 52;
