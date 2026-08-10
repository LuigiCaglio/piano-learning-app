import type { GraphicalNote, OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

export interface NoteHit {
  midi: number;
}

/** A tappable element on the rendered score: the SVG group for one chord/note stack (VexFlow
 * draws a chord's noteheads as a single stack, sharing one SVG group) plus every pitch
 * sounding there. Deliberately holds no position data -- see findNoteHitAtPoint for why. */
export interface TappableNote {
  element: SVGGElement;
  hits: NoteHit[];
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
      for (const staffEntry of measure.staffEntries) {
        for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
          for (const note of voiceEntry.notes) {
            const sourceNote = note.sourceNote;
            if (!sourceNote || sourceNote.isRest()) continue;

            const svgG = (note as GraphicalNoteWithSvg).getSVGGElement?.();
            if (!svgG) continue;

            const midi = sourceNote.halfTone + 12;
            let entry = noteByElement.get(svgG);
            if (!entry) {
              entry = { element: svgG, hits: [] };
              noteByElement.set(svgG, entry);
              notes.push(entry);
            }
            entry.hits.push({ midi });
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

  return best?.hits;
}
