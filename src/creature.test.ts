import { describe, expect, it } from 'vitest';
import {
  WAVE_SEGMENTS,
  hasLanded,
  segmentCount,
  spawnChain,
  splitChain,
  stepChain,
  waveChains,
} from './creature';
import { COLUMNS, ROWS, cellKey } from './field';

describe('creature', () => {
  it('walks along a row', () => {
    const chain = spawnChain(3, 5);
    stepChain(chain, new Set());
    expect(chain.segments.map((segment) => segment.column)).toEqual([6, 5, 4]);
  });

  it('drops a row and turns back at the wall', () => {
    const chain = spawnChain(2, COLUMNS - 1);
    stepChain(chain, new Set());
    expect(chain.segments[0]).toMatchObject({ column: COLUMNS - 1, row: 1 });
    expect(chain.direction).toBe(-1);
  });

  it('turns at a block', () => {
    const chain = spawnChain(2, 5);
    stepChain(chain, new Set([cellKey({ column: 6, row: 0 })]));
    expect(chain.segments[0]).toMatchObject({ column: 5, row: 1 });
  });

  it('splits into two creatures heading opposite ways', () => {
    const pieces = splitChain(spawnChain(5, 8), 2);
    expect(pieces.map((piece) => piece.segments.length)).toEqual([2, 2]);
    expect(pieces.map((piece) => piece.direction)).toEqual([1, -1]);
  });

  it('leaves nothing when the last segment is shot', () => {
    expect(splitChain(spawnChain(1, 8), 0)).toEqual([]);
  });

  it('reaches the bottom eventually', () => {
    const chain = spawnChain(4, 8);
    for (let step = 0; step < COLUMNS * ROWS * 2; step++) stepChain(chain, new Set());
    expect(hasLanded(chain)).toBe(true);
  });
});

describe('waves', () => {
  it('opens with one long body', () => {
    expect(waveChains(1).map((chain) => chain.segments.length)).toEqual([WAVE_SEGMENTS]);
  });

  it('adds heads rather than segments as waves go on', () => {
    const chains = waveChains(5);
    expect(chains).toHaveLength(5);
    expect(segmentCount(chains)).toBe(WAVE_SEGMENTS);
  });

  it('starts every head in its own clear column', () => {
    for (let wave = 2; wave < 12; wave++) {
      const chains = waveChains(wave);
      const columns = chains.flatMap((chain) => chain.segments.map((segment) => segment.column));
      for (const head of chains.slice(1)) {
        const near = columns.filter((column) => Math.abs(column - head.segments[0].column) <= 1);
        expect(near).toHaveLength(1);
      }
    }
  });

  it('keeps a real body even in very late waves', () => {
    expect(waveChains(40)[0].segments.length).toBeGreaterThanOrEqual(6);
  });
});
