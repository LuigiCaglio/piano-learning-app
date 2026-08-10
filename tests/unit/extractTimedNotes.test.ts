import { describe, it, expect } from 'vitest';
import type { Fraction } from 'opensheetmusicdisplay';
import {
  findTimestampAtTime,
  getMeasureRange,
  measureRangeToSeconds,
  type TimedNote,
} from '../../src/components/ScoreViewer/extractTimedNotes.js';

/** Builds a minimal TimedNote for tests. `timestampReal` only needs a `.RealValue` reader,
 * which is all the functions under test ever touch on the real OSMD Fraction type. */
function note(
  midi: number,
  startTime: number,
  duration: number,
  measureNumber: number,
  timestampReal = startTime,
  staffId = 0,
): TimedNote {
  return {
    midi,
    startTime,
    duration,
    measureNumber,
    timestamp: { RealValue: timestampReal } as unknown as Fraction,
    staffId,
  };
}

// Mirrors the demo piece: measure 1 has a C4-D4-E4-F4 melody plus a sustained C3+E3+G3 chord;
// measure 2 has G4-A4-B4-C5 plus F2+A2+C3.
const demoNotes: TimedNote[] = [
  note(60, 0.0, 0.6, 1, 0.0), // C4
  note(48, 0.0, 2.4, 1, 0.0), // C3 (chord)
  note(52, 0.0, 2.4, 1, 0.0), // E3 (chord)
  note(55, 0.0, 2.4, 1, 0.0), // G3 (chord)
  note(62, 0.6, 0.6, 1, 0.25),
  note(64, 1.2, 0.6, 1, 0.5),
  note(65, 1.8, 0.6, 1, 0.75),
  note(67, 2.4, 0.6, 2, 1.0),
  note(41, 2.4, 2.4, 2, 1.0),
  note(45, 2.4, 2.4, 2, 1.0),
  note(48, 2.4, 2.4, 2, 1.0),
  note(69, 3.0, 0.6, 2, 1.25),
  note(71, 3.6, 0.6, 2, 1.5),
  note(72, 4.2, 0.6, 2, 1.75),
];

describe('findTimestampAtTime', () => {
  it('returns null for a time before any note starts', () => {
    expect(findTimestampAtTime(demoNotes, -1)).toBeNull();
  });

  it('returns null for an empty note list', () => {
    expect(findTimestampAtTime([], 5)).toBeNull();
  });

  it('returns the timestamp of the latest note that has started by the given time', () => {
    expect(findTimestampAtTime(demoNotes, 0)).toBe(0.0);
    expect(findTimestampAtTime(demoNotes, 0.6)).toBe(0.25);
    expect(findTimestampAtTime(demoNotes, 1.0)).toBe(0.25); // between onsets -- stays at the last one
    expect(findTimestampAtTime(demoNotes, 4.2)).toBe(1.75);
  });

  it('stays at the final timestamp once past the end of the piece', () => {
    expect(findTimestampAtTime(demoNotes, 100)).toBe(1.75);
  });
});

describe('getMeasureRange', () => {
  it('returns null for an empty note list', () => {
    expect(getMeasureRange([])).toBeNull();
  });

  it('returns the min/max measure number across all notes', () => {
    expect(getMeasureRange(demoNotes)).toEqual({ min: 1, max: 2 });
  });

  it('handles a single-measure piece', () => {
    expect(getMeasureRange([note(60, 0, 1, 5)])).toEqual({ min: 5, max: 5 });
  });
});

describe('measureRangeToSeconds', () => {
  it('returns null when no notes fall in the requested range', () => {
    expect(measureRangeToSeconds(demoNotes, 9, 9)).toBeNull();
  });

  it('spans the earliest onset to the latest note-end within a single measure', () => {
    const range = measureRangeToSeconds(demoNotes, 1, 1);
    expect(range).toEqual({ start: 0.0, end: 2.4 }); // measure 1 starts at 0, chord ends at 2.4
  });

  it('ends at the start of the next measure, not at its own last note-end, when there is a gap', () => {
    // A short note in measure 1 ending well before measure 2 actually begins (e.g. a rest
    // in between). If the range boundary were computed from the range's own last note-end
    // instead of the next measure's onset, this would incorrectly return 1.0 instead of 2.5.
    const notesWithGap: TimedNote[] = [note(60, 0, 1.0, 1, 0), note(62, 2.5, 0.5, 2, 1.0)];
    const range = measureRangeToSeconds(notesWithGap, 1, 1);
    expect(range).toEqual({ start: 0, end: 2.5 });
  });

  it('ends at the last note-end when the range includes the final measure', () => {
    const range = measureRangeToSeconds(demoNotes, 2, 2);
    expect(range).toEqual({ start: 2.4, end: 4.8 }); // last melody note ends at 4.2+0.6=4.8
  });

  it('spans the whole piece when the range covers every measure', () => {
    const range = measureRangeToSeconds(demoNotes, 1, 2);
    expect(range).toEqual({ start: 0.0, end: 4.8 });
  });
});
