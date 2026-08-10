import './HandSelector.css';

export type HandFilter = 'both' | 'right' | 'left';

interface HandSelectorProps {
  value: HandFilter;
  onChange: (value: HandFilter) => void;
}

const OPTIONS: { value: HandFilter; label: string }[] = [
  { value: 'both', label: 'Both hands' },
  { value: 'right', label: 'Right hand' },
  { value: 'left', label: 'Left hand' },
];

/** Lets the player mute one hand's part during playback -- practicing hands separately is a
 * standard technique for building the two-hand independence a guitarist won't already have. */
export function HandSelector({ value, onChange }: HandSelectorProps) {
  return (
    <div className="hand-selector" role="radiogroup" aria-label="Practice hand">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={
            value === option.value ? 'hand-selector__option hand-selector__option--active' : 'hand-selector__option'
          }
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
