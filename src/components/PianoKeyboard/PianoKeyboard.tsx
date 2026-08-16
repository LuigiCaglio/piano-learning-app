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
  // name per active midi instead. Defined inside the component so it can close over
  // activeNotes; falls back to the generic (always-sharp) spelling only if Klavier ever reports
  // a key active that isn't in activeNotes, which shouldn't normally happen.
  const nameByMidi = new Map(activeNotes.map((n) => [n.midi, n.name]));
  function KeyLabel({ note, active }: CustomLabelProps) {
    if (!active) return null;
    return <div className="piano-keyboard__label">{nameByMidi.get(note.midiNumber) ?? midiToNoteName(note.midiNumber)}</div>;
  }

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
        components={{ ...realistic, label: showNoteNames ? KeyLabel : undefined }}
      />
    </div>
  );
}
