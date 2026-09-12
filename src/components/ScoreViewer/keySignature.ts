import { ClefEnum, ClefInstruction, KeyInstruction, type OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

export interface StaffKeyInfo {
  staffId: number;
  /** Unicode clef glyph (e.g. the treble-clef symbol). Empty for a clef type this app has no
   * glyph for (rare in piano music, e.g. tab) -- callers should skip the row in that case. */
  clefSymbol: string;
  sharps: number;
  flats: number;
}

const CLEF_SYMBOLS: Partial<Record<ClefEnum, string>> = {
  [ClefEnum.G]: '\u{1D11E}', // 𝄞 treble
  [ClefEnum.F]: '\u{1D122}', // 𝄢 bass
  [ClefEnum.C]: '\u{1D121}', // 𝄡 alto/tenor
};

/** The initial clef and key signature for each staff, read straight from the score's own data
 * (SourceMeasure instructions), not scraped from the rendered SVG -- VexFlow's SVG output has no
 * stable per-glyph markup (class names etc.) to reliably pick "the clef" or "the key signature"
 * back out of. Used to keep a persistent reminder of clef/key pinned to the left edge of the
 * single-line scrolling view, since that view draws them only once, at the very start of the
 * (potentially very wide) line.
 *
 * KeyInstruction.Key mirrors MusicXML's <fifths>: positive = sharps, negative = flats.
 *
 * v1 simplification: reports only the piece's opening clef/key per staff, not a later
 * mid-piece change -- most pieces never change either, and tracking "which key/clef is the
 * current scroll position actually in" would need following the horizontal scroll position back
 * to a measure, which is out of scope for now. */
export function extractInitialKeySignatures(osmd: OpenSheetMusicDisplay): StaffKeyInfo[] {
  const sheet = osmd.Sheet;
  if (!sheet) return [];

  // FirstInstructionsStaffEntries is parallel to sheet.Staves (one slot per staff index, per its
  // own doc comment) -- its entries' own ParentStaff is unset (these are synthetic
  // "first instructions" entries, not real staff entries), so the staff identity has to come
  // from that positional pairing rather than from the entry itself.
  const staves = sheet.Staves;
  const seenStaffIds = new Set<number>();
  const results: StaffKeyInfo[] = [];

  for (const measure of sheet.SourceMeasures) {
    if (seenStaffIds.size >= staves.length) break;
    const entries = measure.FirstInstructionsStaffEntries;
    for (let staffIndex = 0; staffIndex < entries.length; staffIndex++) {
      const entry = entries[staffIndex];
      const staffId = staves[staffIndex]?.Id;
      if (!entry || staffId === undefined || seenStaffIds.has(staffId)) continue;

      let clef: ClefInstruction | undefined;
      let key: KeyInstruction | undefined;
      for (const instruction of entry.Instructions) {
        if (instruction instanceof ClefInstruction) clef = instruction;
        else if (instruction instanceof KeyInstruction) key = instruction;
      }
      if (!clef) continue;

      seenStaffIds.add(staffId);
      const fifths = key?.Key ?? 0;
      results.push({
        staffId,
        clefSymbol: CLEF_SYMBOLS[clef.ClefType] ?? '',
        sharps: fifths > 0 ? fifths : 0,
        flats: fifths < 0 ? -fifths : 0,
      });
    }
  }

  return results.sort((a, b) => a.staffId - b.staffId);
}
