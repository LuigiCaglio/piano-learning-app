import type { GraphicalNote, OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

export interface NoteHit {
  midi: number;
  /** This note's position in the piece, in the same units OSMD's cursor iterator uses
   * (CurrentEnrolledTimestamp.RealValue) -- lets a tap drive the score cursor to this exact
   * spot via the same mechanism playback already uses, instead of only updating the piano
   * keyboard below the score. */
  timestampRealValue: number;
}

/** A tappable element on the rendered score: the SVG group for one chord/note stack (VexFlow
 * draws a chord's noteheads as a single stack, sharing one SVG group) plus every pitch
 * sounding there. Deliberately holds no position data -- see findNoteHitAtPoint for why. */
export interface TappableNote {
  element: SVGGElement;
  hits: NoteHit[];
  /** Identity of the system (line of music) this note renders in. A system resets its x
   * coordinates back to the left margin, so two notes on different lines can land at a
   * similar-looking x position -- this lets findColumnHit stay within one system instead of
   * also matching an unrelated note on a different line. */
  systemId: unknown;
}

interface GraphicalNoteWithSvg extends GraphicalNote {
  getSVGGElement?: () => SVGGElement | undefined;
}

/** Which SVG element belongs to which note(s) is stable until OSMD re-renders (e.g. on
 * resize) -- unlike screen position, which changes on every scroll, and isn't captured here
 * at all. */
export function buildNoteIndex(osmd: OpenSheetMusicDisplay): TappableNote[] {
  const notes: TappableNote[] = [];
  const noteByElement = new Map<SVGGElement, TappableNote>();
  const measureList = osmd.GraphicSheet?.MeasureList ?? [];

  for (const measures of measureList) {
    for (const measure of measures) {
      if (!measure) continue;
      const systemId = measure.ParentMusicSystem;
      for (const staffEntry of measure.staffEntries) {
        const timestampRealValue = staffEntry.getAbsoluteTimestamp().RealValue;
        for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
          for (const note of voiceEntry.notes) {
            const sourceNote = note.sourceNote;
            if (!sourceNote || sourceNote.isRest()) continue;

            const svgG = (note as GraphicalNoteWithSvg).getSVGGElement?.();
            if (!svgG) continue;

            const midi = sourceNote.halfTone + 12;
            let entry = noteByElement.get(svgG);
            if (!entry) {
              entry = { element: svgG, hits: [], systemId };
              noteByElement.set(svgG, entry);
              notes.push(entry);
            }
            entry.hits.push({ midi, timestampRealValue });
          }
        }
      }
    }
  }

  return notes;
}

/** Finds the note nearest a tap point, within `toleranceCss` CSS pixels of its bounding box.
 * Note heads render far smaller than a comfortable touch target, so distance to the box (not
 * exact containment) is what makes tapping usable on a tablet.
 *
 * Deliberately reads each element's position fresh via getBoundingClientRect() on every call,
 * rather than from a cache built once after render: a cached rect is only correct until the
 * next scroll (page or container), resize, font swap, or anything else that shifts layout --
 * an open-ended list of triggers we'd otherwise have to individually detect and rebuild on.
 * Querying live is the one approach immune to all of them by construction. A few hundred
 * getBoundingClientRect() calls on a single tap is imperceptible; this must not be called
 * per animation frame. */
export function findNoteHitAtPoint(
  notes: TappableNote[],
  x: number,
  y: number,
  toleranceCss = 20,
): NoteHit[] | undefined {
  let best: TappableNote | undefined;
  let bestDistance = Infinity;

  for (const note of notes) {
    const rect = note.element.getBoundingClientRect();
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const distance = Math.hypot(dx, dy);
    if (distance <= toleranceCss && distance < bestDistance) {
      bestDistance = distance;
      best = note;
    }
  }
  if (best) return best.hits;

  return findColumnHit(notes, x, y, toleranceCss);
}

/** Fallback for a tap that lands too far from any single note to match above -- most notably
 * the empty gap between a grand staff's two staves. If the tap's *x* lines up with a note
 * anywhere in the same system (line of music), selects every note at that beat rather than
 * requiring a precise vertical hit -- e.g. tapping between the staves selects the full
 * two-hand chord for that beat. Scoped to whichever system is vertically closest to the tap so
 * a coincidentally similar x position on a different line of music doesn't also match. */
function findColumnHit(notes: TappableNote[], x: number, y: number, toleranceCss: number): NoteHit[] | undefined {
  let closestSystemId: unknown;
  let closestSystemDistance = Infinity;
  for (const note of notes) {
    const rect = note.element.getBoundingClientRect();
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    if (dy < closestSystemDistance) {
      closestSystemDistance = dy;
      closestSystemId = note.systemId;
    }
  }

  const hits: NoteHit[] = [];
  for (const note of notes) {
    if (note.systemId !== closestSystemId) continue;
    const rect = note.element.getBoundingClientRect();
    if (x >= rect.left - toleranceCss && x <= rect.right + toleranceCss) {
      hits.push(...note.hits);
    }
  }
  return hits.length > 0 ? hits : undefined;
}
