import { describe, it, expect } from 'vitest';
import { findNoteHitAtPoint, type NoteRegion } from '../../src/components/ScoreViewer/noteIndex.js';

function region(midis: number[], left: number, top: number, right: number, bottom: number): NoteRegion {
  return { rect: { left, top, right, bottom } as DOMRect, hits: midis.map((midi) => ({ midi })) };
}

describe('findNoteHitAtPoint', () => {
  it('returns undefined when there are no regions', () => {
    expect(findNoteHitAtPoint([], 10, 10)).toBeUndefined();
  });

  it('finds a note when the point is exactly inside its box', () => {
    const regions = [region([60], 0, 0, 10, 10)];
    expect(findNoteHitAtPoint(regions, 5, 5)).toEqual([{ midi: 60 }]);
  });

  it('finds a note within the tolerance radius outside its box (fat-finger touch)', () => {
    const regions = [region([60], 100, 100, 110, 110)];
    // 12px outside the left/top edge -- inside the default 20px tolerance.
    expect(findNoteHitAtPoint(regions, 88, 88)).toEqual([{ midi: 60 }]);
  });

  it('does not match a point beyond the tolerance radius', () => {
    const regions = [region([60], 100, 100, 110, 110)];
    expect(findNoteHitAtPoint(regions, 50, 50)).toBeUndefined();
  });

  it('respects a custom tolerance value', () => {
    const regions = [region([60], 100, 100, 110, 110)];
    // 15px away: within a 20px tolerance, outside a 5px tolerance.
    expect(findNoteHitAtPoint(regions, 85, 100, 20)).toEqual([{ midi: 60 }]);
    expect(findNoteHitAtPoint(regions, 85, 100, 5)).toBeUndefined();
  });

  it('picks the nearest region when two are within tolerance', () => {
    const regions = [region([60], 0, 0, 10, 10), region([64], 30, 0, 40, 10)];
    // x=15 is 5px from the first box's right edge, 15px from the second box's left edge.
    expect(findNoteHitAtPoint(regions, 15, 5)).toEqual([{ midi: 60 }]);
  });

  it('returns every pitch in a chord region', () => {
    const regions = [region([48, 52, 55], 0, 0, 10, 10)];
    expect(findNoteHitAtPoint(regions, 5, 5)).toEqual([{ midi: 48 }, { midi: 52 }, { midi: 55 }]);
  });
});
