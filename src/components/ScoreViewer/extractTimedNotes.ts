import { MusicPartManagerIterator, type Fraction, type OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

export interface TimedNote {
  midi: number;
  startTime: number;
  duration: number;
  measureNumber: number;
  timestamp: Fraction;
  /** The staff this note is written on, 1-indexed as MusicXML/OSMD assign it. For a standard
   * piano grand staff, staff 1 is the top/treble staff (typically the right hand) and staff 2
   * is the bottom/bass staff (typically the left hand) -- used for hands-separate practice. */
  staffId: number;
}

const DEFAULT_BPM = 100;
const SECONDS_PER_WHOLE_NOTE = (bpm: number) => (4 * 60) / bpm;

/** Flattens the score into a single, time-sorted note list (source of truth for both audio
 * scheduling and visual sync), following OSMD's own documented pattern of walking a
 * MusicPartManagerIterator and reading CurrentBpm/CurrentEnrolledTimestamp at each step. */
export function extractTimedNotes(osmd: OpenSheetMusicDisplay): TimedNote[] {
  const sheet = osmd.Sheet;
  if (!sheet) return [];

  const notes: TimedNote[] = [];
  const iterator = new MusicPartManagerIterator(sheet);

  while (!iterator.EndReached) {
    const bpm = iterator.CurrentBpm || DEFAULT_BPM;
    const secondsPerWhole = SECONDS_PER_WHOLE_NOTE(bpm);
    const timestamp = iterator.CurrentEnrolledTimestamp;
    const startTime = timestamp.RealValue * secondsPerWhole;
    const measureNumber = iterator.CurrentMeasure?.MeasureNumber ?? 0;

    for (const voiceEntry of iterator.CurrentVoiceEntries) {
      for (const note of voiceEntry.Notes) {
        if (note.isRest()) continue;
        notes.push({
          midi: note.halfTone + 12,
          startTime,
          duration: note.Length.RealValue * secondsPerWhole,
          measureNumber,
          timestamp,
          staffId: note.ParentStaff?.Id ?? 0,
        });
      }
    }

    iterator.moveToNext();
  }

  notes.sort((a, b) => a.startTime - b.startTime);
  return notes;
}

export interface MetronomeClick {
  time: number;
  /** True for beat 1 of the measure, so playback can accent the downbeat. */
  isDownbeat: boolean;
}

const QUARTER_NOTE_AS_WHOLE = 0.25;

/** Generates one click per quarter-note beat across the piece, using each measure's own
 * Duration (a fraction of a whole note) to infer its beat count -- correct for simple meters
 * (4/4, 3/4, 2/4, etc.); compound meters (6/8 etc.) get quarter-note subdivisions rather than
 * their felt dotted-quarter pulse, a reasonable v1 simplification. */
export function extractMetronomeClicks(osmd: OpenSheetMusicDisplay): MetronomeClick[] {
  const sheet = osmd.Sheet;
  if (!sheet) return [];

  const clicks: MetronomeClick[] = [];
  const iterator = new MusicPartManagerIterator(sheet);
  let lastMeasureIndex = -1;

  while (!iterator.EndReached) {
    if (iterator.CurrentMeasureIndex !== lastMeasureIndex) {
      lastMeasureIndex = iterator.CurrentMeasureIndex;
      const bpm = iterator.CurrentBpm || DEFAULT_BPM;
      const secondsPerWhole = SECONDS_PER_WHOLE_NOTE(bpm);
      const measureStart = iterator.CurrentEnrolledTimestamp.RealValue * secondsPerWhole;
      const measureDurationWhole = iterator.CurrentMeasure?.Duration.RealValue ?? 1;
      const beatsInMeasure = Math.max(1, Math.round(measureDurationWhole / QUARTER_NOTE_AS_WHOLE));
      const secondsPerBeat = secondsPerWhole * QUARTER_NOTE_AS_WHOLE;

      for (let beat = 0; beat < beatsInMeasure; beat++) {
        clicks.push({ time: measureStart + beat * secondsPerBeat, isDownbeat: beat === 0 });
      }
    }
    iterator.moveToNext();
  }

  return clicks;
}

/** Returns the OSMD enrolled-timestamp real value of the latest note that has started
 * sounding by `currentTime`, for driving the score cursor from playback position. */
export function findTimestampAtTime(notes: TimedNote[], currentTime: number): number | null {
  let target: number | null = null;
  for (const note of notes) {
    if (note.startTime > currentTime) break;
    target = note.timestamp.RealValue;
  }
  return target;
}

export interface MeasureRange {
  min: number;
  max: number;
}

export function getMeasureRange(notes: TimedNote[]): MeasureRange | null {
  if (notes.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const note of notes) {
    if (note.measureNumber < min) min = note.measureNumber;
    if (note.measureNumber > max) max = note.measureNumber;
  }
  return { min, max };
}

/** Converts an inclusive [startMeasure, endMeasure] range to a [start, end) time range in
 * seconds, for driving PlaybackEngine.setLoop(). The end boundary is the start of the first
 * note after endMeasure, or the end of the last note in range if endMeasure is the final measure. */
export function measureRangeToSeconds(
  notes: TimedNote[],
  startMeasure: number,
  endMeasure: number,
): { start: number; end: number } | null {
  const inRange = notes.filter((n) => n.measureNumber >= startMeasure && n.measureNumber <= endMeasure);
  if (inRange.length === 0) return null;

  const start = Math.min(...inRange.map((n) => n.startTime));
  const afterRange = notes.filter((n) => n.measureNumber > endMeasure);
  const end =
    afterRange.length > 0
      ? Math.min(...afterRange.map((n) => n.startTime))
      : Math.max(...inRange.map((n) => n.startTime + n.duration));

  return { start, end };
}
