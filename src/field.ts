/** The playfield: a grid wrapped over the sky, with the top row far overhead. */
export const COLUMNS = 25;
export const ROWS = 22;

const SPAN_RAD = (150 * Math.PI) / 180;
const TOP_ELEVATION_RAD = (64 * Math.PI) / 180;
const BOTTOM_ELEVATION_RAD = (9 * Math.PI) / 180;
const TOP_RANGE_M = 105;
const BOTTOM_RANGE_M = 25;
const DEPTH_AMPLITUDE_M = 21;

export interface Cell {
  column: number;
  row: number;
}

/**
 * Rolling hills of depth through the grid. Without them everything sits on one curved sheet;
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
  const azimuth = (column / (COLUMNS - 1) - 0.5) * SPAN_RAD;
  const descent = row / (ROWS - 1);
  const elevation = TOP_ELEVATION_RAD + (BOTTOM_ELEVATION_RAD - TOP_ELEVATION_RAD) * descent;
  const range =
    TOP_RANGE_M + (BOTTOM_RANGE_M - TOP_RANGE_M) * descent + depthOffset(column, row, descent);
  const flat = range * Math.cos(elevation);
  return [Math.sin(azimuth) * flat, range * Math.sin(elevation), -Math.cos(azimuth) * flat];
}

/** Columns squeeze together toward the zenith, so sizes follow the actual gap between them. */
export function cellSize(row: number): number {
  const descent = row / (ROWS - 1);
  const elevation = TOP_ELEVATION_RAD + (BOTTOM_ELEVATION_RAD - TOP_ELEVATION_RAD) * descent;
  const range = TOP_RANGE_M + (BOTTOM_RANGE_M - TOP_RANGE_M) * descent;
  return range * Math.cos(elevation) * (SPAN_RAD / (COLUMNS - 1));
}

export const cellKey = (cell: Cell) => cell.column + cell.row * COLUMNS;
