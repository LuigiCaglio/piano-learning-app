import { openDB, type DBSchema } from 'idb';

export interface Piece {
  id: string;
  title: string;
  composer?: string;
  addedAt: number;
  lastOpenedAt?: number;
  fileBlob: Blob;
  fileType: 'xml' | 'mxl';
}

interface PianoLearningDB extends DBSchema {
  pieces: {
    key: string;
    value: Piece;
  };
}

const dbPromise = openDB<PianoLearningDB>('piano-learning', 1, {
  upgrade(db) {
    db.createObjectStore('pieces', { keyPath: 'id' });
  },
});

export async function listPieces(): Promise<Piece[]> {
  const db = await dbPromise;
  const pieces = await db.getAll('pieces');
  return pieces.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt));
}

export async function savePiece(piece: Piece): Promise<void> {
  const db = await dbPromise;
  await db.put('pieces', piece);
}

export async function deletePiece(id: string): Promise<void> {
  const db = await dbPromise;
  await db.delete('pieces', id);
}

export async function touchPiece(id: string): Promise<void> {
  const db = await dbPromise;
  const piece = await db.get('pieces', id);
  if (piece) {
    piece.lastOpenedAt = Date.now();
    await db.put('pieces', piece);
  }
}

function inferFileType(filename: string): Piece['fileType'] {
  return filename.toLowerCase().endsWith('.mxl') ? 'mxl' : 'xml';
}

export function fileToPiece(file: File): Piece {
  const title = file.name.replace(/\.(xml|musicxml|mxl)$/i, '');
  return {
    id: crypto.randomUUID(),
    title,
    addedAt: Date.now(),
    fileBlob: file,
    fileType: inferFileType(file.name),
  };
}
