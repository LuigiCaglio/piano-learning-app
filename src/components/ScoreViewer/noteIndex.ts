import type { GraphicalNote, OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

export interface NoteHit {
  midi: number;
}

/** A tappable region on the rendered score: the on-screen bounding box of one chord/note
 * group (VexFlow draws a chord's noteheads as a single stack, sharing one SVG group) plus
 * every pitch sounding there. */
export interface NoteRegion {
  rect: DOMRect;
  hits: NoteHit[];
}

interface GraphicalNoteWithSvg extends GraphicalNote {
  getSVGGElement?: () => SVGGElement | undefined;
}

export function buildNoteIndex(osmd: OpenSheetMusicDisplay): NoteRegion[] {
  const regions: NoteRegion[] = [];
  const regionByElement = new Map<SVGGElement, NoteRegion>();
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
            let region = regionByElement.get(svgG);
            if (!region) {
              region = { rect: svgG.getBoundingClientRect(), hits: [] };
              regionByElement.set(svgG, region);
              regions.push(region);
            }
            region.hits.push({ midi });
          }
        }
      }
    }
  }

  return regions;
}

/** Finds the note region nearest a tap point, within `toleranceCss` CSS pixels of its
 * bounding box. Note heads render far smaller than a comfortable touch target, so distance
 * to the box (not exact containment) is what makes tapping usable on a tablet. */
export function findNoteHitAtPoint(
  regions: NoteRegion[],
  x: number,
  y: number,
  toleranceCss = 20,
): NoteHit[] | undefined {
  let best: NoteRegion | undefined;
  let bestDistance = Infinity;

  for (const region of regions) {
    const { rect } = region;
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const distance = Math.hypot(dx, dy);
    if (distance <= toleranceCss && distance < bestDistance) {
      bestDistance = distance;
      best = region;
    }
  }

  return best?.hits;
}
