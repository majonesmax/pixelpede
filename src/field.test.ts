import { afterEach, describe, expect, it } from 'vitest';
import { COLUMNS, ROWS, cellPosition, setMode } from './field';

const middle = (COLUMNS - 1) / 2;

describe('field', () => {
  it('starts high behind the player', () => {
    const [, height, z] = cellPosition(middle, 0);
    expect(z).toBeGreaterThan(30);
    expect(height).toBeGreaterThan(30);
  });

  it('passes straight overhead', () => {
    const overhead = Array.from({ length: ROWS }, (_, row) => cellPosition(middle, row)).find(
      ([, height, z]) => Math.abs(z) < 10 && height > 35,
    );
    expect(overhead).toBeDefined();
  });

  it('comes down to the ground in front', () => {
    const [, height, z] = cellPosition(middle, ROWS - 1);
    expect(z).toBeLessThan(-15);
    expect(height).toBeLessThan(8);
  });
});

describe('gallery mode', () => {
  afterEach(() => setMode('surround'));

  it('keeps the whole field in front of the player', () => {
    setMode('gallery');
    for (let row = 0; row < ROWS; row++) {
      for (const column of [0, middle, COLUMNS - 1]) {
        expect(cellPosition(column, row)[2]).toBeLessThan(-5);
      }
    }
  });
});
