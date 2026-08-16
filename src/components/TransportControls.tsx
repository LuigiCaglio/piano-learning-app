import './TransportControls.css';

interface TransportControlsProps {
  tempoRatio: number;
  metronomeEnabled: boolean;
  audioError?: string | null;
  onTempoChange: (ratio: number) => void;
  onMetronomeChange: (enabled: boolean) => void;
}

/** Tempo and metronome controls. Play/Pause lives outside this component, in PracticeBar's
 * always-visible row -- unlike tempo/metronome, it needs to stay reachable without expanding
 * the rest of the controls (see App.tsx). */
export function TransportControls({
  tempoRatio,
  metronomeEnabled,
  audioError,
  onTempoChange,
  onMetronomeChange,
}: TransportControlsProps) {
  return (
    <div className="transport-controls">
      <div className="transport-controls__row">
        <label className="transport-controls__tempo">
          Tempo: {Math.round(tempoRatio * 100)}%
          <input
            type="range"
            min={0.25}
            max={1.5}
            step={0.05}
            value={tempoRatio}
            onChange={(e) => onTempoChange(Number(e.target.value))}
          />
        </label>
        <label className="transport-controls__metronome">
          <input
            type="checkbox"
            checked={metronomeEnabled}
            onChange={(e) => onMetronomeChange(e.target.checked)}
          />
          Metronome
        </label>
      </div>
      {audioError && <div className="transport-controls__error">{audioError}</div>}
    </div>
  );
}
