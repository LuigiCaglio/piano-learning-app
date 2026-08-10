import { deletePiece, type Piece } from './db';
import './PieceLibrary.css';

interface PieceLibraryProps {
  pieces: Piece[];
  currentPieceId: string | null;
  onSelect: (piece: Piece) => void;
  onDeleted: (id: string) => void;
}

export function PieceLibrary({ pieces, currentPieceId, onSelect, onDeleted }: PieceLibraryProps) {
  if (pieces.length === 0) return null;

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deletePiece(id);
    onDeleted(id);
  };

  return (
    <ul className="piece-library">
      {pieces.map((piece) => (
        <li
          key={piece.id}
          className={
            piece.id === currentPieceId ? 'piece-library__item piece-library__item--active' : 'piece-library__item'
          }
          onClick={() => onSelect(piece)}
        >
          <span className="piece-library__title">{piece.title}</span>
          <button
            type="button"
            className="piece-library__delete"
            onClick={(e) => handleDelete(e, piece.id)}
            aria-label={`Delete ${piece.title}`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
