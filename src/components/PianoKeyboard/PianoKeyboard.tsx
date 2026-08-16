import { Klavier, type CustomLabelProps } from 'klavier';
import { realistic } from 'klavier/presets/realistic';
import 'klavier/presets/realistic.css';
import { midiToNoteName } from '../../lib/midi';
import './PianoKeyboard.css';

interface PianoKeyboardProps {
  activeMidiNotes: number[];
  keyRange?: [number, number];
  /** Note-name labels under active keys -- off by default; a beginner reading the score by
   * tapping doesn't want the answer spelled out until they choose to see it (see SettingsPanel). */
  showNoteNames?: boolean;
  /** Active-key highlight color (settings-configurable); falls back to the CSS default below
   * when not given. */
  highlightColor?: string;
}

function KeyLabel({ note, active }: CustomLabelProps) {
  if (!active) return null;
  return <div className="piano-keyboard__label">{midiToNoteName(note.midiNumber)}</div>;
}

export function PianoKeyboard({ activeMidiNotes, keyRange = [36, 96], showNoteNames = false, highlightColor }: PianoKeyboardProps) {
  return (
    <div
      className="piano-keyboard"
      style={highlightColor ? ({ '--key-highlight-color': highlightColor } as React.CSSProperties) : undefined}
    >
      <Klavier
        keyRange={keyRange}
        activeKeys={activeMidiNotes}
        interactive={false}
        width="100%"
        height="100%"
        components={{ ...realistic, label: showNoteNames ? KeyLabel : undefined }}
      />
    </div>
  );
}
