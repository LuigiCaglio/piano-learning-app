import { PianoKeyboard } from '../PianoKeyboard/PianoKeyboard';
import type { DisplayNote } from '../../lib/midi';
import './NotePopup.css';

interface NotePopupProps {
  /** Viewport coordinates of the tap that opened this popup (see ScoreViewer's onNoteTap) --
   * used to anchor the popup near where the user actually touched, not some fixed spot. */
  x: number;
  y: number;
  activeNotes: DisplayNote[];
  showNoteNames?: boolean;
  highlightColor?: string;
  onClose: () => void;
}

// Half the popup's own CSS width (see .note-popup max-width) -- used only to keep the popup
// from running off the left/right edge of the viewport. An approximation, not a measurement:
// good enough for keeping the popup roughly on-screen without the extra render pass a ref-based
// measurement would need.
const POPUP_HALF_WIDTH = 170;
const EDGE_MARGIN = 8;

/** A small keyboard that pops up next to a tapped note in full-score view, so identifying a
 * note doesn't require scrolling all the way down to the keyboard fixed at the page bottom.
 * Flips above/below the tap point depending on which half of the viewport it landed in, so it
 * never renders off the top or bottom of the screen. */
export function NotePopup({ x, y, activeNotes, showNoteNames, highlightColor, onClose }: NotePopupProps) {
  const opensBelow = y < window.innerHeight / 2;
  const clampedX = Math.min(Math.max(x, POPUP_HALF_WIDTH + EDGE_MARGIN), window.innerWidth - POPUP_HALF_WIDTH - EDGE_MARGIN);

  return (
    <div
      className="note-popup"
      style={{
        left: clampedX,
        ...(opensBelow ? { top: y + 20 } : { bottom: window.innerHeight - y + 20 }),
      }}
    >
      <div className="note-popup__header">
        <span className="note-popup__label">{activeNotes.map((n) => n.name).join(', ')}</span>
        <button type="button" className="note-popup__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <PianoKeyboard activeNotes={activeNotes} showNoteNames={showNoteNames} highlightColor={highlightColor} />
    </div>
  );
}
