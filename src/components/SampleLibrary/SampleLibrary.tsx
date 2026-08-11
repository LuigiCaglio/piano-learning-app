import { useState } from 'react';
import type { SamplePiece } from '../../data/samples';
import './SampleLibrary.css';

interface SampleLibraryProps {
  samples: SamplePiece[];
  onSelect: (sample: SamplePiece) => void;
}

/** A small dropdown (not a modal) listing the bundled public-domain sample pieces, so there's
 * something recognizable to open beyond the demo scale exercise without needing to find and
 * import a file first. Open/closed state is tracked explicitly (rather than native <details>)
 * so picking a sample can close the panel -- otherwise it stays open until the toggle is
 * clicked again, which reads as broken after a selection. */
export function SampleLibrary({ samples, onSelect }: SampleLibraryProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (sample: SamplePiece) => {
    setIsOpen(false);
    onSelect(sample);
  };

  return (
    <div className="sample-library">
      <button type="button" className="sample-library__toggle" onClick={() => setIsOpen((open) => !open)}>
        Sample pieces
      </button>
      {isOpen && (
        <ul className="sample-library__list">
          {samples.map((sample) => (
            <li key={sample.id}>
              <button type="button" className="sample-library__item" onClick={() => handleSelect(sample)}>
                <span className="sample-library__title">{sample.title}</span>
                <span className="sample-library__composer">{sample.composer}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
