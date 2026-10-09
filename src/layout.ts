// Shared world-space layout constants for the altar.

/** Where each player's captured souls are piled (the "tribute pedestals"). */
export const CAPTURE_POS = {
  1: [-8.0, 0, 2.9],
  2: [8.0, 0, -2.9],
} as const;

/** Braziers standing at the four corners of the altar. */
export const TORCH_POS: [number, number, number][] = [
  [-8.85, -0.3, 4.15],
  [8.85, -0.3, 4.15],
  [-8.85, -0.3, -4.15],
  [8.85, -0.3, -4.15],
];

export const BASE_FOV = 45;
