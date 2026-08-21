export const BIOMETRIC_TEMPLATE_FORMAT = 'ANSI_378_2004';
export const MAX_TEMPLATE_BYTES = 65_536;
export const MIN_TEMPLATE_BYTES = 32;

export const FINGER_POSITIONS = [
  'LEFT_THUMB',
  'LEFT_INDEX',
  'LEFT_MIDDLE',
  'LEFT_RING',
  'LEFT_LITTLE',
  'RIGHT_THUMB',
  'RIGHT_INDEX',
  'RIGHT_MIDDLE',
  'RIGHT_RING',
  'RIGHT_LITTLE',
] as const;

export type FingerPosition = (typeof FINGER_POSITIONS)[number];
