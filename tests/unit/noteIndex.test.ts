import { describe, it, expect } from 'vitest';
import { findNoteHitAtPoint, getSystemOrder, type TappableNote } from '../../src/components/ScoreViewer/noteIndex.js';

/** A fake SVG element whose getBoundingClientRect() is queried live, matching the real
 * findNoteHitAtPoint contract -- catches any regression back to reading a cached rect.
 * timestampRealValue defaults to `left`, so distinct x positions get distinct beats
 * automatically (matching real scores, where different beats render at different x) --
 * tests simulating notes that share a beat (e.g. a grand-staff chord) must pass a matching
 * timestampRealValue explicitly. `name` defaults to a deterministic placeholder per midi
 * (these tests exercise hit-detection geometry, not real enharmonic spelling). */
function note(
  midis: number[],
  left: number,
  top: number,
  right: number,
  bottom: number,
  options: { systemId?: unknown; timestampRealValue?: number; staffId?: number; names?: string[] } = {},
): TappableNote {
  const { systemId = 'system-1', timestampRealValue = left, staffId = 1, names } = options;
  const rect = { left, top, right, bottom } as DOMRect;
  const element = { getBoundingClientRect: () => rect } as unknown as SVGGElement;
  return {
    element,
    hits: midis.map((midi, i) => ({ midi, name: names?.[i] ?? `N${midi}`, timestampRealValue, staffId })),
    systemId,
  };
}

describe('findNoteHitAtPoint', () => {
  it('returns undefined when there are no notes', () => {
    expect(findNoteHitAtPoint([], 10, 10)).toBeUndefined();
  });

  it('finds a note when the point is exactly inside its box', () => {
    const notes = [note([60], 0, 0, 10, 10)];
    expect(findNoteHitAtPoint(notes, 5, 5)).toEqual([{ midi: 60, name: 'N60', timestampRealValue: 0, staffId: 1 }]);
  });

  it('finds a note within the tolerance radius outside its box (fat-finger touch)', () => {
    const notes = [note([60], 100, 100, 110, 110)];
    // 12px outside the left/top edge -- inside the default 20px tolerance.
    expect(findNoteHitAtPoint(notes, 88, 88)).toEqual([{ midi: 60, name: 'N60', timestampRealValue: 100, staffId: 1 }]);
  });

  it('does not match a point beyond the tolerance radius', () => {
    const notes = [note([60], 100, 100, 110, 110)];
    expect(findNoteHitAtPoint(notes, 50, 50)).toBeUndefined();
  });

  it('respects a custom tolerance value', () => {
    const notes = [note([60], 100, 100, 110, 110)];
    // 15px away: within a 20px tolerance, outside a 5px tolerance.
    expect(findNoteHitAtPoint(notes, 85, 100, 20)).toEqual([
      { midi: 60, name: 'N60', timestampRealValue: 100, staffId: 1 },
    ]);
    expect(findNoteHitAtPoint(notes, 85, 100, 5)).toBeUndefined();
  });

  it('picks the nearest note when two are within tolerance', () => {
    const notes = [note([60], 0, 0, 10, 10), note([64], 30, 0, 40, 10)];
    // x=15 is 5px from the first box's right edge, 15px from the second box's left edge.
    // Different x -> different default timestamps, so this also confirms the second (a
    // different beat) isn't pulled in by the whole-beat expansion.
    expect(findNoteHitAtPoint(notes, 15, 5)).toEqual([{ midi: 60, name: 'N60', timestampRealValue: 0, staffId: 1 }]);
  });

  it('returns every pitch in a chord', () => {
    const notes = [note([48, 52, 55], 0, 0, 10, 10)];
    expect(findNoteHitAtPoint(notes, 5, 5)).toEqual([
      { midi: 48, name: 'N48', timestampRealValue: 0, staffId: 1 },
      { midi: 52, name: 'N52', timestampRealValue: 0, staffId: 1 },
      { midi: 55, name: 'N55', timestampRealValue: 0, staffId: 1 },
    ]);
  });

  it('carries each note-stack\'s position in the piece, for driving the score cursor on tap', () => {
    const notes = [note([60], 0, 0, 10, 10, { timestampRealValue: 2.5 })];
    expect(findNoteHitAtPoint(notes, 5, 5)).toEqual([{ midi: 60, name: 'N60', timestampRealValue: 2.5, staffId: 1 }]);
  });

  it('carries which staff each note is written on', () => {
    const notes = [note([60], 0, 0, 10, 10, { staffId: 2 })];
    expect(findNoteHitAtPoint(notes, 5, 5)).toEqual([{ midi: 60, name: 'N60', timestampRealValue: 0, staffId: 2 }]);
  });

  it('carries the note\'s spelled name as written in the score, not just its midi number', () => {
    // Same midi (63), different spelling -- an enharmonic pair a musician would read as
    // distinct notes (Eb vs D#), which must not collapse into one generic name.
    const notes = [note([63], 0, 0, 10, 10, { names: ['Eb4'] })];
    expect(findNoteHitAtPoint(notes, 5, 5)).toEqual([{ midi: 63, name: 'Eb4', timestampRealValue: 0, staffId: 1 }]);
  });

  it('reads position fresh on every call rather than a cached rect', () => {
    let left = 0;
    const element = {
      getBoundingClientRect: () => ({ left, top: 0, right: left + 10, bottom: 10 }) as DOMRect,
    } as unknown as SVGGElement;
    const notes: TappableNote[] = [
      { element, hits: [{ midi: 60, name: 'N60', timestampRealValue: 0, staffId: 1 }], systemId: 'system-1' },
    ];

    expect(findNoteHitAtPoint(notes, 5, 5)).toEqual([{ midi: 60, name: 'N60', timestampRealValue: 0, staffId: 1 }]);
    left = 200; // element "moved" (e.g. the page scrolled) without any rebuild step
    expect(findNoteHitAtPoint(notes, 5, 5)).toBeUndefined();
    expect(findNoteHitAtPoint(notes, 205, 5)).toEqual([{ midi: 60, name: 'N60', timestampRealValue: 0, staffId: 1 }]);
  });

  describe('whole-beat expansion (a tap returns every note at that beat, across staves)', () => {
    it('expands a precise tap on one staff to also include another staff at the same beat', () => {
      // Grand-staff chord: treble near the top, bass far below, sharing one beat (explicit
      // matching timestamp -- see note()'s doc comment on why this can't rely on the x
      // default alone). Tapping exactly on the treble note should still return both.
      const notes = [
        note([72, 76], 100, 0, 110, 10, { staffId: 1, timestampRealValue: 1.0 }),
        note([48, 52], 100, 300, 110, 310, { staffId: 2, timestampRealValue: 1.0 }),
      ];
      expect(findNoteHitAtPoint(notes, 105, 5)).toEqual([
        { midi: 72, name: 'N72', timestampRealValue: 1.0, staffId: 1 },
        { midi: 76, name: 'N76', timestampRealValue: 1.0, staffId: 1 },
        { midi: 48, name: 'N48', timestampRealValue: 1.0, staffId: 2 },
        { midi: 52, name: 'N52', timestampRealValue: 1.0, staffId: 2 },
      ]);
    });

    it('does not pull in an adjacent but different beat, even if it renders close by', () => {
      // Two distinct beats placed only 20px apart on screen (closer than they'd realistically
      // render, but exactly the case pixel-distance matching would get wrong) -- a precise tap
      // on the first must not also grab the second, since they're different beats (different
      // timestamps) despite the visual proximity.
      const notes = [note([60], 0, 0, 10, 10, { timestampRealValue: 0 }), note([64], 30, 0, 40, 10, { timestampRealValue: 0.5 })];
      expect(findNoteHitAtPoint(notes, 5, 5)).toEqual([{ midi: 60, name: 'N60', timestampRealValue: 0, staffId: 1 }]);
    });
  });

  describe('column fallback (tap far from any note vertically, but aligned with one horizontally)', () => {
    it('selects a note whose column the tap falls in, even far outside its box vertically', () => {
      // Treble note at x=100-110, y=0-10; tap lands at y=200, way below tolerance range.
      const notes = [note([72], 100, 0, 110, 10)];
      expect(findNoteHitAtPoint(notes, 105, 200)).toEqual([{ midi: 72, name: 'N72', timestampRealValue: 100, staffId: 1 }]);
    });

    it('selects every note aligned with that beat across staves in the same system', () => {
      // A grand-staff chord: treble notes near the top, bass notes far below, sharing one beat.
      // Tapping in the gap between them should return both.
      const notes = [
        note([72, 76], 100, 0, 110, 10, { staffId: 1, timestampRealValue: 1.0 }),
        note([48, 52], 100, 300, 110, 310, { staffId: 2, timestampRealValue: 1.0 }),
      ];
      expect(findNoteHitAtPoint(notes, 105, 150)).toEqual([
        { midi: 72, name: 'N72', timestampRealValue: 1.0, staffId: 1 },
        { midi: 76, name: 'N76', timestampRealValue: 1.0, staffId: 1 },
        { midi: 48, name: 'N48', timestampRealValue: 1.0, staffId: 2 },
        { midi: 52, name: 'N52', timestampRealValue: 1.0, staffId: 2 },
      ]);
    });

    it('does not match a note in a different system even at a similar x position', () => {
      // Second system's notes reset to a similar x range as the first system's -- tapping
      // near the first system should not pick up the second system's note, even though a
      // coincidence of the x-derived default timestamp would otherwise match too.
      const notes = [note([72], 100, 0, 110, 10, { systemId: 'system-1' }), note([60], 100, 500, 110, 510, { systemId: 'system-2' })];
      expect(findNoteHitAtPoint(notes, 105, 200)).toEqual([{ midi: 72, name: 'N72', timestampRealValue: 100, staffId: 1 }]);
    });

    it('still returns undefined when the tap is outside every note column', () => {
      const notes = [note([72], 100, 0, 110, 10)];
      expect(findNoteHitAtPoint(notes, 500, 200)).toBeUndefined();
    });

    it('prefers a precise nearby hit over the column fallback', () => {
      const notes = [note([72], 100, 0, 110, 10), note([60], 300, 190, 310, 210)];
      // Close enough (within default 20px tolerance) to the second note directly.
      expect(findNoteHitAtPoint(notes, 305, 215)).toEqual([{ midi: 60, name: 'N60', timestampRealValue: 300, staffId: 1 }]);
    });
  });
});

describe('getSystemOrder', () => {
  it('returns an empty list for no notes', () => {
    expect(getSystemOrder([])).toEqual([]);
  });

  it('returns each distinct system once, in first-encountered order', () => {
    const notes = [
      note([60], 0, 0, 10, 10, { systemId: 'a' }),
      note([64], 20, 0, 30, 10, { systemId: 'a' }), // same system as the first -- not a duplicate entry
      note([48], 0, 300, 10, 310, { systemId: 'b' }),
      note([72], 0, 600, 10, 610, { systemId: 'c' }),
    ];
    expect(getSystemOrder(notes)).toEqual(['a', 'b', 'c']);
  });

  it('does not reorder if a system reappears out of sequence in the input', () => {
    // Notes aren't necessarily perfectly sorted by system when this is called -- the order
    // returned should still reflect first appearance, not a later one.
    const notes = [
      note([60], 0, 0, 10, 10, { systemId: 'a' }),
      note([48], 0, 300, 10, 310, { systemId: 'b' }),
      note([64], 20, 0, 30, 10, { systemId: 'a' }),
    ];
    expect(getSystemOrder(notes)).toEqual(['a', 'b']);
  });
});
