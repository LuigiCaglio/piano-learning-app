import { Klavier, type CustomLabelProps } from 'klavier';
import { realistic } from 'klavier/presets/realistic';
import 'klavier/presets/realistic.css';
import { midiToNoteName } from '../../lib/midi';
import './PianoKeyboard.css';

interface PianoKeyboardProps {
  activeMidiNotes: number[];
  keyRange?: [number, number];
}

function KeyLabel({ note, active }: CustomLabelProps) {
  if (!active) return null;
  return <div className="piano-keyboard__label">{midiToNoteName(note.midiNumber)}</div>;
}

export function PianoKeyboard({ activeMidiNotes, keyRange = [36, 96] }: PianoKeyboardProps) {
  return (
    <div className="piano-keyboard">
      <Klavier
        keyRange={keyRange}
        activeKeys={activeMidiNotes}
        interactive={false}
        width="100%"
        height="100%"
        components={{ ...realistic, label: KeyLabel }}
      />
    </div>
  );
}
