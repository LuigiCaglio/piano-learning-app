import './LoopSelector.css';

export interface LoopRangeState {
  startMeasure: number;
  endMeasure: number;
  enabled: boolean;
}

interface LoopSelectorProps {
  minMeasure: number;
  maxMeasure: number;
  value: LoopRangeState;
  onChange: (value: LoopRangeState) => void;
}

export function LoopSelector({ minMeasure, maxMeasure, value, onChange }: LoopSelectorProps) {
  const clamp = (n: number) => Math.min(maxMeasure, Math.max(minMeasure, n));

  const setStart = (n: number) => {
    const startMeasure = clamp(n);
    onChange({ ...value, startMeasure, endMeasure: Math.max(startMeasure, value.endMeasure) });
  };

  const setEnd = (n: number) => {
    const endMeasure = clamp(n);
    onChange({ ...value, endMeasure, startMeasure: Math.min(endMeasure, value.startMeasure) });
  };

  return (
    <div className="loop-selector">
      <label className="loop-selector__toggle">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        Loop measures
      </label>
      <input
        type="number"
        className="loop-selector__measure-input"
        min={minMeasure}
        max={maxMeasure}
        value={value.startMeasure}
        onChange={(e) => setStart(Number(e.target.value))}
        disabled={!value.enabled}
      />
      <span>to</span>
      <input
        type="number"
        className="loop-selector__measure-input"
        min={minMeasure}
        max={maxMeasure}
        value={value.endMeasure}
        onChange={(e) => setEnd(Number(e.target.value))}
        disabled={!value.enabled}
      />
    </div>
  );
}
