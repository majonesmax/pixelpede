/**
 * The playfield. In surround mode it's a vault arching over the player: row 0 hangs high behind
 * you, the middle rows run straight overhead, and the last row comes down in front of you. Gallery
 * mode folds it into a close arc ahead, for playing without turning around.
 */
export const COLUMNS = 25;
export const ROWS = 24;

const EYE_HEIGHT_M = 1.6;
const LOWEST_POINT_M = 2.5;

export type Mode = 'surround' | 'gallery';

interface Layout {
  /** Angle from straight up where the creature starts, negative behind you. */
  topTiltRad: number;
  bottomTiltRad: number;
  topRangeM: number;
  bottomRangeM: number;
  /** The field's width, as a multiple of how far away that part of it is. */
  widthPerRange: number;
  depthAmplitudeM: number;
}

const degrees = (value: number) => (value * Math.PI) / 180;

const LAYOUTS: Record<Mode, Layout> = {
  surround: {
    topTiltRad: degrees(-55),
    bottomTiltRad: degrees(81),
    topRangeM: 68,
    bottomRangeM: 25,
    widthPerRange: 1.5,
    depthAmplitudeM: 15,
  },
  // Everything in a forward arc, close and low enough to play from a fixed seat.
  gallery: {
    topTiltRad: degrees(28),
    bottomTiltRad: degrees(84),
    topRangeM: 40,
    bottomRangeM: 15,
    widthPerRange: 1.35,
    depthAmplitudeM: 6,
  },
};

let layout = LAYOUTS.surround;

export function setMode(mode: Mode) {
  layout = LAYOUTS[mode];
}

export interface Cell {
  column: number;
  row: number;
}

const descentOf = (row: number) => row / (ROWS - 1);
const tiltAt = (descent: number) =>
  layout.topTiltRad + (layout.bottomTiltRad - layout.topTiltRad) * descent;
const rangeAt = (descent: number) =>
  layout.topRangeM + (layout.bottomRangeM - layout.topRangeM) * descent;

/**
 * Rolling hills of depth through the vault. Without them everything sits on one curved sheet;
 * with them the creature weaves toward and away from you, and the blocks stand at real distances.
 */
function depthOffset(column: number, row: number, descent: number) {
  const hills =
    Math.sin(column * 0.55 + row * 0.2) * 0.6 +
    Math.sin(column * 0.23 - row * 0.47 + 1.3) * 0.8 +
    Math.sin(column * 1.1 + row * 0.8 + 4) * 0.28;
  return hills * layout.depthAmplitudeM * (1 - descent * 0.72);
}

/** Fractional cells are allowed, so moving things can sit between two. */
export function cellPosition(column: number, row: number): [number, number, number] {
  const descent = descentOf(row);
  const tilt = tiltAt(descent);
  const range = rangeAt(descent) + depthOffset(column, row, descent);
  const across = (column / (COLUMNS - 1) - 0.5) * rangeAt(descent) * layout.widthPerRange;
  const height = Math.max(LOWEST_POINT_M, EYE_HEIGHT_M + range * Math.cos(tilt));
  return [across, height, -range * Math.sin(tilt)];
}

/** The gap between neighboring cells, which is how big anything sitting in one can be. */
export function cellSize(row: number): number {
  return (rangeAt(descentOf(row)) * layout.widthPerRange) / (COLUMNS - 1);
}

export const cellKey = (cell: Cell) => cell.column + cell.row * COLUMNS;
