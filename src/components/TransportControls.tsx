import './TransportControls.css';

interface TransportControlsProps {
  isReady: boolean;
  isPlaying: boolean;
  tempoRatio: number;
  metronomeEnabled: boolean;
  audioError?: string | null;
  onPlay: () => void;
  onPause: () => void;
  onTempoChange: (ratio: number) => void;
  onMetronomeChange: (enabled: boolean) => void;
}

export function TransportControls({
  isReady,
  isPlaying,
  tempoRatio,
  metronomeEnabled,
  audioError,
  onPlay,
  onPause,
  onTempoChange,
  onMetronomeChange,
}: TransportControlsProps) {
  return (
    <div className="transport-controls">
      <div className="transport-controls__row">
        <button
          type="button"
          className="transport-controls__play-pause"
          disabled={!isReady}
          onClick={isPlaying ? onPause : onPlay}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
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
