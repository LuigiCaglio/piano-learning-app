import { useMemo, useRef } from 'react';
import { Klavier, type CustomLabelProps } from 'klavier';
import { realistic } from 'klavier/presets/realistic';
import 'klavier/presets/realistic.css';
import { midiToNoteName, type DisplayNote } from '../../lib/midi';
import './PianoKeyboard.css';

interface PianoKeyboardProps {
  activeNotes: DisplayNote[];
  keyRange?: [number, number];
  /** Note-name labels under active keys -- off by default; a beginner reading the score by
   * tapping doesn't want the answer spelled out until they choose to see it (see SettingsPanel). */
  showNoteNames?: boolean;
  /** Active-key highlight color (settings-configurable); falls back to the CSS default below
   * when not given. */
  highlightColor?: string;
}

export function PianoKeyboard({ activeNotes, keyRange = [36, 96], showNoteNames = false, highlightColor }: PianoKeyboardProps) {
  // Klavier's label component only gets the key's raw midi number, which can't distinguish
  // enharmonic spellings (D#4 vs Eb4 are the same midi) -- look up the score's actual spelled
  // name per active midi instead. Read from a ref (rather than closed over directly) so
  // KeyLabel's own identity doesn't need to change when activeNotes does -- see the
  // `components` comment below for why that identity stability matters during playback.
  const nameByMidiRef = useRef(new Map<number, string>());
  nameByMidiRef.current = new Map(activeNotes.map((n) => [n.midi, n.name]));
  const KeyLabel = useMemo(() => {
    return function KeyLabel({ note, active }: CustomLabelProps) {
      if (!active) return null;
      return (
        <div className="piano-keyboard__label">
          {nameByMidiRef.current.get(note.midiNumber) ?? midiToNoteName(note.midiNumber)}
        </div>
      );
    };
  }, []);

  // Klavier passes this same object to every one of its ~60 memoized key components as a
  // shared `components` prop -- a fresh object reference here (as `{...realistic, label: ...}`
  // inline would produce) changes every key's props on every render, so React.memo can't skip
  // re-rendering keys whose `active` state didn't actually change. During playback, activeNotes
  // changes on every single note on/off (several times a second), so without this the whole
  // keyboard re-renders that often instead of just the 1-2 keys that actually toggled --
  // contributing to the audio/cursor stutter this was added to fix.
  const components = useMemo(
    () => ({ ...realistic, label: showNoteNames ? KeyLabel : undefined }),
    [showNoteNames, KeyLabel],
  );

  return (
    <div
      className="piano-keyboard"
      style={highlightColor ? ({ '--key-highlight-color': highlightColor } as React.CSSProperties) : undefined}
    >
      <Klavier
        keyRange={keyRange}
        activeKeys={activeNotes.map((n) => n.midi)}
        interactive={false}
        width="100%"
        height="100%"
        components={components}
      />
    </div>
  );
}
