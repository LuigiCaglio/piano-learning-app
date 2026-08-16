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

// A MusicXML "zip" export (e.g. MuseScore's mobile share sheet) is structurally the same
// compressed container as .mxl, just with a .zip extension -- OSMD detects the format from
// the file's contents either way, so both map to 'mxl' here.
function inferFileType(filename: string): Piece['fileType'] {
  return /\.(mxl|zip)$/i.test(filename) ? 'mxl' : 'xml';
}

export function fileToPiece(file: File): Piece {
  const title = file.name.replace(/\.(xml|musicxml|mxl|zip)$/i, '');
  return {
    id: crypto.randomUUID(),
    title,
    addedAt: Date.now(),
    fileBlob: file,
    fileType: inferFileType(file.name),
  };
}

/** Builds a Piece from an in-memory MusicXML string, for library entries that aren't a
 * user-imported File -- currently only the bundled sample pieces (see data/samples). */
export function stringToPiece(id: string, title: string, composer: string, xml: string): Piece {
  return {
    id,
    title,
    composer,
    addedAt: Date.now(),
    fileBlob: new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }),
    fileType: 'xml',
  };
}
