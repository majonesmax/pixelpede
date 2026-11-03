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

export function spawnChain(length: number, startColumn: number): Chain {
  const segments: Segment[] = [];
  for (let i = 0; i < length; i++) segments.push(clampedSegment(startColumn - i, 0));
  return { direction: 1, segments };
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

/** Total segments per wave. Later waves split them into more independent heads, not more speed. */
export const WAVE_SEGMENTS = 15;
const MAIN_BODY_MIN = 6;

/**
 * The creatures a wave opens with: one long body, plus a separate single head for each wave
 * after the first. The heads start in their own columns, clear of the body and of each other, so
 * they read as separate creatures rather than extra heads stuck in the line.
 */
export function waveChains(wave: number, random: () => number = Math.random): Chain[] {
  const heads = Math.min(wave - 1, WAVE_SEGMENTS - MAIN_BODY_MIN);
  const body = spawnChain(WAVE_SEGMENTS - heads, WAVE_SEGMENTS - heads - 1);
  const chains = [body];
  for (let i = 0; i < heads; i++) {
    const head = spawnHead(chains, random);
    if (head) chains.push(head);
  }
  return chains;
}

const GAP_COLUMNS = 1;

/** A lone head on the top row, in a column with clear space around it, or null if there's none. */
export function spawnHead(existing: readonly Chain[], random: () => number = Math.random) {
  const taken = new Set<number>();
  for (const chain of existing) {
    for (const segment of chain.segments) {
      if (segment.row !== 0) continue;
      for (let gap = -GAP_COLUMNS; gap <= GAP_COLUMNS; gap++) taken.add(segment.column + gap);
    }
  }
  const free: number[] = [];
  for (let column = 0; column < COLUMNS; column++) if (!taken.has(column)) free.push(column);
  if (!free.length) return null;
  const chain = spawnChain(1, free[Math.floor(random() * free.length)]);
  chain.direction = random() < 0.5 ? 1 : -1;
  return chain;
}

export const segmentCount = (chains: readonly Chain[]) =>
  chains.reduce((total, chain) => total + chain.segments.length, 0);
