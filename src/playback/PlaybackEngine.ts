import { CacheStorage, SplendidGrandPiano, type StopFn } from 'smplr';
import type { MetronomeClick, TimedNote } from '../components/ScoreViewer/extractTimedNotes';

/** Standard 88-key piano range (A0-C8). */
const PIANO_KEY_RANGE = Array.from({ length: 88 }, (_, i) => i + 21);
const COUNT_IN_BEATS = 4;
const DEFAULT_SECONDS_PER_BEAT = 0.6; // fallback (~100bpm) if no metronome clicks are available yet

/**
 * Drives piano playback of a TimedNote[] timeline against the Web Audio clock.
 * Owns a single audio-time anchor (startAudioTime/startOffsetSeconds) so that
 * play/pause/seek/tempo changes can all re-anchor from "now" without drifting.
 * Notes are scheduled ahead of time via smplr's own lookahead Scheduler; the
 * StopFn each `start()` call returns lets us cancel not-yet-fired notes.
 */
export class PlaybackEngine {
  private context: AudioContext;
  private piano: ReturnType<typeof SplendidGrandPiano>;
  private notes: TimedNote[] = [];
  private metronomeClicks: MetronomeClick[] = [];
  private metronomeEnabled = false;
  private tempoRatio = 1;
  private playing = false;
  private startAudioTime = 0;
  private startOffsetSeconds = 0;
  private activeStopFns: StopFn[] = [];
  private activeMidiNotes = new Set<number>();
  private endTimeoutId: ReturnType<typeof setTimeout> | undefined;
  private loop: { start: number; end: number } | null = null;
  private onNoteOn?: (midi: number) => void;
  private onNoteOff?: (midi: number) => void;
  private onPlaybackEnd?: () => void;

  constructor(options?: {
    onLoadProgress?: (progress: { loaded: number; total: number }) => void;
    onNoteOn?: (midi: number) => void;
    onNoteOff?: (midi: number) => void;
    onPlaybackEnd?: () => void;
  }) {
    this.context = new AudioContext();
    // Samples are fetched from smplr's CDN on first use, then served from the Cache Storage
    // API on subsequent loads -- so playback keeps working offline after that first fetch.
    // The default instrument loads ~5 velocity layers (~250 files); since this app always
    // plays at a fixed velocity, notesToLoad restricts fetching to a single "MF" layer
    // across the full 88-key range, cutting first-load time roughly 4-5x.
    this.piano = SplendidGrandPiano(this.context, {
      storage: CacheStorage('piano-samples'),
      notesToLoad: { notes: PIANO_KEY_RANGE, velocityRange: [90, 90] },
      onLoadProgress: options?.onLoadProgress,
    });
    this.onNoteOn = options?.onNoteOn;
    this.onNoteOff = options?.onNoteOff;
    this.onPlaybackEnd = options?.onPlaybackEnd;
  }

  get ready(): Promise<void> {
    return this.piano.ready;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get durationSeconds(): number {
    return this.notes.reduce((max, n) => Math.max(max, n.startTime + n.duration), 0);
  }

  /** Replaces the schedulable note list (e.g. when a hand is muted for practice). If
   * currently playing, re-anchors and reschedules from "now" using the new list -- otherwise
   * a hand-filter change wouldn't take effect until the next pause, tempo change, or loop. */
  setNotes(notes: TimedNote[]): void {
    this.notes = notes;
    if (this.playing) this.rescheduleFromCurrentPosition();
  }

  setMetronomeClicks(clicks: MetronomeClick[]): void {
    this.metronomeClicks = clicks;
  }

  /** Enables/disables the metronome click track. Takes effect immediately if playing. */
  setMetronomeEnabled(enabled: boolean): void {
    this.metronomeEnabled = enabled;
    if (this.playing) this.rescheduleFromCurrentPosition();
  }

  /** Current position in the nominal (1.0x tempo) timeline, in seconds. */
  currentTime(): number {
    if (!this.playing) return this.startOffsetSeconds;
    const elapsedReal = this.context.currentTime - this.startAudioTime;
    return this.startOffsetSeconds + elapsedReal * this.tempoRatio;
  }

  async play(): Promise<void> {
    if (this.playing) return;
    await this.context.resume();
    const segmentStart = this.loop ? this.loop.start : 0;
    const segmentEnd = this.loop ? this.loop.end : this.durationSeconds;
    const isFreshStart = this.currentTime() < segmentStart || this.currentTime() >= segmentEnd;
    if (isFreshStart) {
      this.startOffsetSeconds = segmentStart;
    }
    this.playing = true;

    const countInSeconds = this.metronomeEnabled && isFreshStart ? this.scheduleCountIn() : 0;
    this.startAudioTime = this.context.currentTime + countInSeconds;
    this.scheduleFrom(this.startOffsetSeconds);
  }

  /** Plays the given notes once, immediately, independent of the scheduled timeline -- used to
   * preview a tapped note's sound. No-ops during normal playback so a tap doesn't layer an
   * extra, out-of-time copy of the note on top of what's already sounding. */
  async previewNotes(midiNotes: number[], durationSeconds = 0.8): Promise<void> {
    if (this.playing || midiNotes.length === 0) return;
    await this.context.resume();
    const time = this.context.currentTime;
    for (const midi of midiNotes) {
      this.piano.start({ note: midi, time, duration: durationSeconds });
    }
  }

  pause(): void {
    if (!this.playing) return;
    this.startOffsetSeconds = this.currentTime();
    this.playing = false;
    this.cancelScheduled();
    this.silenceActiveNotes();
  }

  seek(seconds: number): void {
    const wasPlaying = this.playing;
    if (wasPlaying) this.cancelScheduled();
    this.startOffsetSeconds = Math.max(0, seconds);
    if (wasPlaying) {
      this.startAudioTime = this.context.currentTime;
      this.scheduleFrom(this.startOffsetSeconds);
    }
  }

  /** Sets (or clears, with null) the loop range in seconds. If the current position falls
   * outside the new range, it snaps to the loop start; otherwise playback continues from
   * where it was. */
  setLoop(range: { start: number; end: number } | null): void {
    this.loop = range;
    const pos = this.currentTime();
    const newPos = range && (pos < range.start || pos >= range.end) ? range.start : pos;
    this.startOffsetSeconds = newPos;
    this.startAudioTime = this.context.currentTime;
    if (this.playing) {
      this.cancelScheduled();
      this.scheduleFrom(newPos);
    }
  }

  setTempoRatio(ratio: number): void {
    const pos = this.currentTime();
    this.tempoRatio = ratio;
    this.startOffsetSeconds = pos;
    this.startAudioTime = this.context.currentTime;
    if (this.playing) {
      this.cancelScheduled();
      this.scheduleFrom(pos);
    }
  }

  /** Cancels and reschedules from the current position, using "now" as the new anchor.
   * Shared by any setter that must take effect immediately during playback. */
  private rescheduleFromCurrentPosition(): void {
    const pos = this.currentTime();
    this.cancelScheduled();
    this.silenceActiveNotes();
    this.startOffsetSeconds = pos;
    this.startAudioTime = this.context.currentTime;
    this.scheduleFrom(pos);
  }

  private scheduleFrom(offsetSeconds: number): void {
    // Anchored to startAudioTime (not a fresh context.currentTime read) so a count-in delay
    // set by play() actually pushes note/click start times out, rather than being ignored.
    const audioAnchor = this.startAudioTime;
    const segmentEnd = this.loop ? this.loop.end : this.durationSeconds;
    const remaining = (segmentEnd - offsetSeconds) / this.tempoRatio;
    this.endTimeoutId = setTimeout(
      () => {
        if (this.loop) {
          this.cancelScheduled();
          this.silenceActiveNotes();
          this.startOffsetSeconds = this.loop.start;
          this.startAudioTime = this.context.currentTime;
          this.scheduleFrom(this.loop.start);
        } else {
          this.playing = false;
          this.startOffsetSeconds = this.durationSeconds;
          this.activeStopFns = [];
          this.onPlaybackEnd?.();
        }
      },
      Math.max(0, remaining) * 1000,
    );

    for (const note of this.notes) {
      if (note.startTime < offsetSeconds) continue;
      if (note.startTime >= segmentEnd) break;
      const time = audioAnchor + (note.startTime - offsetSeconds) / this.tempoRatio;
      const duration = note.duration / this.tempoRatio;
      const midi = note.midi;
      this.activeStopFns.push(
        this.piano.start({
          note: midi,
          time,
          duration,
          onStart: () => {
            this.activeMidiNotes.add(midi);
            this.onNoteOn?.(midi);
          },
          onEnded: () => {
            this.activeMidiNotes.delete(midi);
            this.onNoteOff?.(midi);
          },
        }),
      );
    }

    if (this.metronomeEnabled) {
      for (const click of this.metronomeClicks) {
        if (click.time < offsetSeconds) continue;
        if (click.time >= segmentEnd) break;
        const time = audioAnchor + (click.time - offsetSeconds) / this.tempoRatio;
        this.activeStopFns.push(this.scheduleClick(time, click.isDownbeat));
      }
    }
  }

  /** Schedules a synthesized metronome tick (a short sine burst) at an absolute audio-context
   * time -- no sample assets needed. Returns a StopFn so it can be cancelled like a note. */
  private scheduleClick(time: number, accented: boolean): StopFn {
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.frequency.value = accented ? 1500 : 1000;
    osc.connect(gain).connect(this.context.destination);
    gain.gain.setValueAtTime(accented ? 0.3 : 0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.start(time);
    osc.stop(time + 0.06);
    return () => {
      try {
        osc.stop(this.context.currentTime);
      } catch {
        // already stopped
      }
    };
  }

  /** Schedules a count-in (a bar's worth of clicks) starting now, at the tempo implied by the
   * piece's own first two beats. Returns the count-in's duration in seconds. */
  private scheduleCountIn(): number {
    // Click spacing is in nominal (1.0x) tempo coordinates, like note.startTime elsewhere;
    // the count-in itself runs in real wall-clock time, so it must be scaled by tempoRatio too.
    const nominalSecondsPerBeat =
      this.metronomeClicks.length >= 2
        ? this.metronomeClicks[1].time - this.metronomeClicks[0].time
        : DEFAULT_SECONDS_PER_BEAT;
    const secondsPerBeat = nominalSecondsPerBeat / this.tempoRatio;
    const now = this.context.currentTime;
    for (let beat = 0; beat < COUNT_IN_BEATS; beat++) {
      this.activeStopFns.push(this.scheduleClick(now + beat * secondsPerBeat, beat === 0));
    }
    return COUNT_IN_BEATS * secondsPerBeat;
  }

  private cancelScheduled(): void {
    for (const stop of this.activeStopFns) stop();
    this.activeStopFns = [];
    clearTimeout(this.endTimeoutId);
  }

  /** Notifies onNoteOff for any note left sounding after a pause/cancel cuts it off early. */
  private silenceActiveNotes(): void {
    for (const midi of this.activeMidiNotes) this.onNoteOff?.(midi);
    this.activeMidiNotes.clear();
  }

  dispose(): void {
    this.cancelScheduled();
    this.silenceActiveNotes();
    this.piano.dispose();
    this.context.close();
  }
}
