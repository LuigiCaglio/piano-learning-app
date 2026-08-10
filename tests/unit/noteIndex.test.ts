import { describe, it, expect } from 'vitest';
import { findNoteHitAtPoint, type TappableNote } from '../../src/components/ScoreViewer/noteIndex.js';

/** A fake SVG element whose getBoundingClientRect() is queried live, matching the real
 * findNoteHitAtPoint contract -- catches any regression back to reading a cached rect. */
function note(midis: number[], left: number, top: number, right: number, bottom: number): TappableNote {
  const rect = { left, top, right, bottom } as DOMRect;
  const element = { getBoundingClientRect: () => rect } as unknown as SVGGElement;
  return { element, hits: midis.map((midi) => ({ midi })) };
}

describe('findNoteHitAtPoint', () => {
  it('returns undefined when there are no notes', () => {
    expect(findNoteHitAtPoint([], 10, 10)).toBeUndefined();
  });

  it('finds a note when the point is exactly inside its box', () => {
    const notes = [note([60], 0, 0, 10, 10)];
    expect(findNoteHitAtPoint(notes, 5, 5)).toEqual([{ midi: 60 }]);
  });

  it('finds a note within the tolerance radius outside its box (fat-finger touch)', () => {
    const notes = [note([60], 100, 100, 110, 110)];
    // 12px outside the left/top edge -- inside the default 20px tolerance.
    expect(findNoteHitAtPoint(notes, 88, 88)).toEqual([{ midi: 60 }]);
  });

  it('does not match a point beyond the tolerance radius', () => {
    const notes = [note([60], 100, 100, 110, 110)];
    expect(findNoteHitAtPoint(notes, 50, 50)).toBeUndefined();
  });

  it('respects a custom tolerance value', () => {
    const notes = [note([60], 100, 100, 110, 110)];
    // 15px away: within a 20px tolerance, outside a 5px tolerance.
    expect(findNoteHitAtPoint(notes, 85, 100, 20)).toEqual([{ midi: 60 }]);
    expect(findNoteHitAtPoint(notes, 85, 100, 5)).toBeUndefined();
  });

  it('picks the nearest note when two are within tolerance', () => {
    const notes = [note([60], 0, 0, 10, 10), note([64], 30, 0, 40, 10)];
    // x=15 is 5px from the first box's right edge, 15px from the second box's left edge.
    expect(findNoteHitAtPoint(notes, 15, 5)).toEqual([{ midi: 60 }]);
  });

  it('returns every pitch in a chord', () => {
    const notes = [note([48, 52, 55], 0, 0, 10, 10)];
    expect(findNoteHitAtPoint(notes, 5, 5)).toEqual([{ midi: 48 }, { midi: 52 }, { midi: 55 }]);
  });

  it('reads position fresh on every call rather than a cached rect', () => {
    let left = 0;
    const element = {
      getBoundingClientRect: () => ({ left, top: 0, right: left + 10, bottom: 10 }) as DOMRect,
    } as unknown as SVGGElement;
    const notes: TappableNote[] = [{ element, hits: [{ midi: 60 }] }];

    expect(findNoteHitAtPoint(notes, 5, 5)).toEqual([{ midi: 60 }]);
    left = 200; // element "moved" (e.g. the page scrolled) without any rebuild step
    expect(findNoteHitAtPoint(notes, 5, 5)).toBeUndefined();
    expect(findNoteHitAtPoint(notes, 205, 5)).toEqual([{ midi: 60 }]);
  });
});
