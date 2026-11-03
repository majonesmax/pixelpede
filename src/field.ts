/**
 * The playfield is a vault arching over the player. Row 0 hangs high behind you, the middle rows
 * run straight overhead, and the last row comes down to the ground in front of you, so the
 * creature has to cross the whole sky above your head before it can reach you.
 */
export const COLUMNS = 25;
export const ROWS = 24;

const EYE_HEIGHT_M = 1.6;
/** Angle from straight up, negative behind you. */
const TOP_TILT_RAD = (-55 * Math.PI) / 180;
const BOTTOM_TILT_RAD = (81 * Math.PI) / 180;
const TOP_RANGE_M = 68;
const BOTTOM_RANGE_M = 25;
/** The vault's width, as a multiple of how far away that part of it is. */
const WIDTH_PER_RANGE = 1.5;
const DEPTH_AMPLITUDE_M = 15;
const LOWEST_POINT_M = 2.5;

export interface Cell {
  column: number;
  row: number;
}

const descentOf = (row: number) => row / (ROWS - 1);
const tiltAt = (descent: number) => TOP_TILT_RAD + (BOTTOM_TILT_RAD - TOP_TILT_RAD) * descent;
const rangeAt = (descent: number) => TOP_RANGE_M + (BOTTOM_RANGE_M - TOP_RANGE_M) * descent;

/**
 * Rolling hills of depth through the vault. Without them everything sits on one curved sheet;
 * with them the creature weaves toward and away from you, and the blocks stand at real distances.
 */
function depthOffset(column: number, row: number, descent: number) {
  const hills =
    Math.sin(column * 0.55 + row * 0.2) * 0.6 +
    Math.sin(column * 0.23 - row * 0.47 + 1.3) * 0.8 +
    Math.sin(column * 1.1 + row * 0.8 + 4) * 0.28;
  return hills * DEPTH_AMPLITUDE_M * (1 - descent * 0.72);
}

/** Fractional cells are allowed, so moving things can sit between two. */
export function cellPosition(column: number, row: number): [number, number, number] {
  const descent = descentOf(row);
  const tilt = tiltAt(descent);
  const range = rangeAt(descent) + depthOffset(column, row, descent);
  const across = (column / (COLUMNS - 1) - 0.5) * rangeAt(descent) * WIDTH_PER_RANGE;
  const height = Math.max(LOWEST_POINT_M, EYE_HEIGHT_M + range * Math.cos(tilt));
  return [across, height, -range * Math.sin(tilt)];
}

/** The gap between neighboring cells, which is how big anything sitting in one can be. */
export function cellSize(row: number): number {
  return (rangeAt(descentOf(row)) * WIDTH_PER_RANGE) / (COLUMNS - 1);
}

export const cellKey = (cell: Cell) => cell.column + cell.row * COLUMNS;
