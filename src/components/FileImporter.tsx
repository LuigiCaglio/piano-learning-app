import { useRef } from 'react';
import { fileToPiece, savePiece, type Piece } from './PieceLibrary/db';

interface FileImporterProps {
  onImported: (piece: Piece) => void;
}

export function FileImporter({ onImported }: FileImporterProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const piece = fileToPiece(file);
    await savePiece(piece);
    onImported(piece);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xml,.musicxml,.mxl,.zip"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <button type="button" onClick={() => inputRef.current?.click()}>
        Import score
      </button>
    </>
  );
}
