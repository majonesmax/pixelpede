/** The playfield: a grid wrapped over the sky, with the top row far overhead. */
export const COLUMNS = 25;
export const ROWS = 22;

const SPAN_RAD = (150 * Math.PI) / 180;
const TOP_ELEVATION_RAD = (64 * Math.PI) / 180;
const BOTTOM_ELEVATION_RAD = (9 * Math.PI) / 180;
const TOP_RANGE_M = 105;
const BOTTOM_RANGE_M = 25;

export interface Cell {
  column: number;
  row: number;
}

/** Fractional cells are allowed, so moving things can sit between two. */
export function cellPosition(column: number, row: number): [number, number, number] {
  const azimuth = (column / (COLUMNS - 1) - 0.5) * SPAN_RAD;
  const descent = row / (ROWS - 1);
  const elevation = TOP_ELEVATION_RAD + (BOTTOM_ELEVATION_RAD - TOP_ELEVATION_RAD) * descent;
  const range = TOP_RANGE_M + (BOTTOM_RANGE_M - TOP_RANGE_M) * descent;
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
