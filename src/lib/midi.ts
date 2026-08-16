const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Converts a MIDI note number to scientific pitch notation, e.g. 60 -> "C4" (middle C).
 * Always spells with sharps -- a fallback for when no score-derived spelling is available.
 * Prefer a note's actual DisplayNote.name (from the score's own Pitch) wherever one exists:
 * midi alone can't distinguish enharmonic pairs like D#4/Eb4, which sound and fall on the same
 * piano key but are written, and read by a musician, differently. */
export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
}

/** A note identified both by its piano key (midi -- what Klavier/the keyboard need) and its
 * actual spelled name as written in the score (name -- what a musician reads). */
export interface DisplayNote {
  midi: number;
  name: string;
}
