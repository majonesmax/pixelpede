import { COLUMNS, ROWS, cellKey, type Cell } from './field';

export interface Segment extends Cell {
  previous: Cell;
}

export interface Chain {
  direction: 1 | -1;
  /** The head is first. */
  segments: Segment[];
}

const clampedSegment = (column: number, row: number): Segment => ({
  column,
  row,
  previous: { column, row },
});

/** A chain on the top row with its head at `headColumn`, trailing back against its direction. */
export function spawnChain(length: number, headColumn: number, direction: 1 | -1 = 1): Chain {
  const segments: Segment[] = [];
  for (let i = 0; i < length; i++) segments.push(clampedSegment(headColumn - i * direction, 0));
  return { direction, segments };
}

/** The chain takes one step. A blocked head drops a row and turns back, and the body follows. */
export function stepChain(chain: Chain, blocked: ReadonlySet<number>) {
  const head = chain.segments[0];
  const column = head.column + chain.direction;
  const hitsWall = column < 0 || column >= COLUMNS;
  const hitsBlock = blocked.has(cellKey({ column, row: head.row }));
  const turn = hitsWall || hitsBlock;

  let next: Cell = turn
    ? { column: head.column, row: Math.min(head.row + 1, ROWS - 1) }
    : { column, row: head.row };
  if (turn) chain.direction = chain.direction === 1 ? -1 : 1;

  for (const segment of chain.segments) {
    const current = { column: segment.column, row: segment.row };
    segment.previous = current;
    segment.column = next.column;
    segment.row = next.row;
    next = current;
  }
}

/**
 * Shooting a segment removes it and leaves a block in its place. Whatever was behind it becomes a
 * new creature heading the other way, which is why shooting the middle makes things worse.
 */
export function splitChain(chain: Chain, index: number): Chain[] {
  const front = chain.segments.slice(0, index);
  const back = chain.segments.slice(index + 1);
  const pieces: Chain[] = [];
  if (front.length) pieces.push({ direction: chain.direction, segments: front });
  if (back.length) pieces.push({ direction: chain.direction === 1 ? -1 : 1, segments: back });
  return pieces;
}

export const hasLanded = (chain: Chain) => chain.segments[0].row >= ROWS - 1;

/** Total segments per wave. Later waves divide them between more creatures, not more speed. */
export const WAVE_SEGMENTS = 15;
const MAX_CREATURES = 3;
/** Waves per extra creature. */
const WAVES_PER_CREATURE = 3;

/**
 * The creatures a wave opens with. Wave 1 is one long body; every few waves the same segments are
 * shared between more creatures, each a proper body with its own head. They start spread across
 * the top: from the left heading right, from the right heading left, then down the middle.
 */
export function waveChains(wave: number): Chain[] {
  const count = Math.min(MAX_CREATURES, 1 + Math.floor((wave - 1) / WAVES_PER_CREATURE));
  const lengths = Array.from(
    { length: count },
    (_, i) => Math.floor(WAVE_SEGMENTS / count) + (i < WAVE_SEGMENTS % count ? 1 : 0),
  );
  const starts: [number, 1 | -1][] = [
    [lengths[0] - 1, 1],
    [COLUMNS - lengths[1], -1],
    [Math.floor(COLUMNS / 2) + 2, 1],
  ];
  return lengths.map((length, i) => spawnChain(length, ...starts[i]));
}

export const segmentCount = (chains: readonly Chain[]) =>
  chains.reduce((total, chain) => total + chain.segments.length, 0);
