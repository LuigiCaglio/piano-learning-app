import { Pitch, type GraphicalNote, type OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

export interface NoteHit {
  midi: number;
  /** The note's actual spelled name as written in the score, e.g. "Eb4" or "D#4" -- these are
   * the same piano key (same midi), but harmonically distinct, and a musician reading the score
   * cares which one is written. Derived from the source Note's own Pitch, not recomputed from
   * midi (which is spelling-blind: enharmonic pairs share one midi number). */
  name: string;
  /** This note's position in the piece, in the same units OSMD's cursor iterator uses
   * (CurrentEnrolledTimestamp.RealValue) -- lets a tap drive the score cursor to this exact
   * spot via the same mechanism playback already uses, instead of only updating the piano
   * keyboard below the score. */
  timestampRealValue: number;
  /** The staff this note is written on, 1-indexed as MusicXML/OSMD assign it (matches
   * TimedNote.staffId in extractTimedNotes.ts) -- lets a caller narrow a tap's whole-beat
   * result down to one hand when a hand filter is active. */
  staffId: number;
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
            // ToStringShort()'s default octave is OSMD's internal numbering, not the standard
            // scientific-pitch-notation one MusicXML (and this app's midiToNoteName fallback)
            // use -- OctaveXmlDifference is OSMD's own documented offset between the two.
            const name = sourceNote.ToStringShort(Pitch.OctaveXmlDifference);
            const staffId = sourceNote.ParentStaff?.Id ?? 0;
            let entry = noteByElement.get(svgG);
            if (!entry) {
              entry = { element: svgG, hits: [], systemId };
              noteByElement.set(svgG, entry);
              notes.push(entry);
            }
            entry.hits.push({ midi, name, timestampRealValue, staffId });
          }
        }
      }
    }
  }

  return notes;
}

/** Finds every note at the beat nearest a tap point -- across every staff, not just whichever
 * one is literally under the fingertip. Identifying a note is about "what's happening at this
 * beat" (the whole two-hand chord), not just the single notehead nearest the tap; callers that
 * want one hand only (e.g. a hand filter) should narrow the result by NoteHit.staffId
 * themselves, since this module has no notion of hand filtering.
 *
 * First looks for a note stack within `toleranceCss` CSS pixels of the tap (note heads render
 * far smaller than a comfortable touch target, so distance to the box, not exact containment,
 * is what makes tapping usable on a tablet). If that finds nothing -- most notably a tap in the
 * empty gap between a grand staff's two staves -- falls back to whichever note in whichever
 * system (line of music) is vertically closest to the tap and still within x tolerance. Either
 * way, the match is then expanded to every note at that same exact beat (see collectWholeBeat).
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
  if (best) return collectWholeBeat(notes, best);

  return findColumnSeed(notes, x, y, toleranceCss);
}

/** Notes at the exact same beat can still land a handful of pixels apart on screen (rounding
 * in each staff's own layout pass), so this equality check must tolerate float noise --
 * unlike telling genuinely different beats apart, which needs no tolerance at all: OSMD
 * assigns each beat its own exact timestamp regardless of rendering. */
const SAME_BEAT_EPSILON = 1e-6;

/** Every note sharing `seed`'s system and exact beat (OSMD timestamp), unioning their hits --
 * e.g. both hands' notes at once for a grand-staff chord. Matching on timestamp rather than
 * screen x avoids having to pick a pixel-distance threshold that's simultaneously wide enough
 * to bridge a chord's own accidentals/ledger-line spread and narrow enough not to also catch
 * a genuinely different, merely nearby, beat. Every hit within one TappableNote already shares
 * one timestamp (they come from the same staffEntry in buildNoteIndex), so seed.hits[0] stands
 * in for the whole stack. */
function collectWholeBeat(notes: TappableNote[], seed: TappableNote): NoteHit[] {
  const seedTimestamp = seed.hits[0]?.timestampRealValue ?? 0;
  const hits: NoteHit[] = [];
  for (const note of notes) {
    if (note.systemId !== seed.systemId) continue;
    const noteTimestamp = note.hits[0]?.timestampRealValue ?? 0;
    if (Math.abs(noteTimestamp - seedTimestamp) < SAME_BEAT_EPSILON) {
      hits.push(...note.hits);
    }
  }
  return hits;
}

/** Fallback for a tap that lands too far from any single note to match above -- most notably
 * the empty gap between a grand staff's two staves. Finds whichever note is horizontally
 * nearest the tap (within toleranceCss) in whichever system (line of music) is vertically
 * closest to the tap, then seeds a whole-beat collection from it rather than requiring a
 * precise vertical hit -- e.g. tapping between the staves selects the full two-hand chord for
 * that beat. Scoped to the closest system so a coincidentally similar x position on a
 * different line of music doesn't also match. */
function findColumnSeed(notes: TappableNote[], x: number, y: number, toleranceCss: number): NoteHit[] | undefined {
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

  let seed: TappableNote | undefined;
  let seedDistance = Infinity;
  for (const note of notes) {
    if (note.systemId !== closestSystemId) continue;
    const rect = note.element.getBoundingClientRect();
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    if (dx <= toleranceCss && dx < seedDistance) {
      seedDistance = dx;
      seed = note;
    }
  }
  return seed ? collectWholeBeat(notes, seed) : undefined;
}
