import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { buildNoteIndex, findNoteHitAtPoint, type NoteHit, type TappableNote } from './noteIndex';
import { extractMetronomeClicks, extractTimedNotes, type MetronomeClick, type TimedNote } from './extractTimedNotes';
import './ScoreViewer.css';

interface ScoreViewerProps {
  source: string | Blob;
  /** Render the whole piece as a single horizontal staff line (scrolls sideways) instead of
   * OSMD's normal paginated wrapping. Must be set before load(), so toggling this prop tears
   * down and reloads OSMD -- see the effect dependency array below. */
  singleLineView: boolean;
  /** Reports every note at the tapped beat, across all staves -- see findNoteHitAtPoint. A
   * caller that only wants one hand (e.g. a hand filter) should narrow this down itself via
   * NoteHit.staffId; this component has no notion of hand filtering. tapPoint is the raw
   * viewport coordinates of the tap itself (not the matched note's exact position), for a
   * caller that wants to anchor something -- e.g. a floating popup -- near where the user
   * actually touched. */
  onNoteTap?: (hits: NoteHit[], tapPoint: { x: number; y: number }) => void;
  onScoreReady?: (timedNotes: TimedNote[]) => void;
  onMetronomeClicksReady?: (clicks: MetronomeClick[]) => void;
  onLoadError?: (message: string) => void;
}

/** Steps the OSMD cursor forward until it reaches (or passes) targetRealValue, resetting and
 * fast-forwarding first if the target is earlier than the cursor's current position. Shared by
 * playback's advanceCursorTo and tap-to-identify's own cursor placement below, so tapping a
 * note moves the score cursor via literally the same mechanism playback already uses. Returns
 * whether the cursor actually moved, so callers can scroll it into view only when needed.
 *
 * Advances cursor.iterator directly rather than calling cursor.next() in the loop: next() also
 * repositions the cursor's DOM element on every single step, which is right for playback (one
 * step per animation frame) but was freezing the tab on tap-to-seek -- jumping into a real
 * imported piece (hundreds+ of notes, not the handful in the built-in demo) from the start
 * could mean thousands of synchronous, unbatched DOM updates for a single tap. The iterator
 * alone does no DOM work, so the loop here is pure bookkeeping; cursor.update() then syncs the
 * visual position once, at the final spot, instead of at every intermediate one.
 *
 * scrollBehavior defaults to smooth (a nice one-off glide for a deliberate tap), but playback's
 * follow-along passes 'auto': it calls this on every animation frame, and re-triggering a CSS
 * smooth-scroll that often means each new scroll interrupts the last one before it finishes,
 * which is what made the auto-scroll visibly lag behind the audio. An instant re-snap every
 * frame already looks smooth on its own, since it's happening ~60 times a second. */
function stepCursorTo(
  cursor: OpenSheetMusicDisplay['cursor'],
  targetRealValue: number,
  scrollBehavior: ScrollBehavior = 'smooth',
): boolean {
  let moved = false;
  if (cursor.iterator.CurrentEnrolledTimestamp.RealValue > targetRealValue) {
    cursor.reset();
    moved = true;
  }
  let guard = 0;
  while (
    !cursor.iterator.EndReached &&
    cursor.iterator.CurrentEnrolledTimestamp.RealValue < targetRealValue &&
    guard++ < 10000
  ) {
    cursor.iterator.moveToNext();
    moved = true;
  }
  if (moved) {
    cursor.update();
    // In single-line view the score can be much wider than the viewport, so keep the cursor
    // horizontally in view the same way it's always been vertically in view.
    cursor.cursorElement?.scrollIntoView({ behavior: scrollBehavior, inline: 'center', block: 'nearest' });
  }
  return moved;
}

export interface ScoreViewerHandle {
  /** Advances (or, for an earlier target, resets and fast-forwards) the OSMD cursor to the
   * given enrolled-timestamp real value, so it tracks playback position ("bouncing ball"). */
  advanceCursorTo: (targetRealValue: number) => void;
  /** Shows the score cursor. Used both to mark active playback and, internally to this
   * component, to mark a tapped note's position -- exposed here only for the playback case. */
  showCursor: () => void;
  /** Hides the score cursor and resets it to the start, ready for the next playback. */
  hideCursor: () => void;
}

export const ScoreViewer = forwardRef<ScoreViewerHandle, ScoreViewerProps>(function ScoreViewer(
  { source, singleLineView, onNoteTap, onScoreReady, onMetronomeClicksReady, onLoadError },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const onNoteTapRef = useRef(onNoteTap);
  onNoteTapRef.current = onNoteTap;
  const onScoreReadyRef = useRef(onScoreReady);
  onScoreReadyRef.current = onScoreReady;
  const onMetronomeClicksReadyRef = useRef(onMetronomeClicksReady);
  onMetronomeClicksReadyRef.current = onMetronomeClicksReady;
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  useImperativeHandle(ref, () => ({
    advanceCursorTo(targetRealValue: number) {
      const cursor = osmdRef.current?.cursor;
      if (!cursor || cursor.Hidden) return;
      stepCursorTo(cursor, targetRealValue, 'auto');
    },
    showCursor() {
      osmdRef.current?.cursor.show();
    },
    hideCursor() {
      const cursor = osmdRef.current?.cursor;
      if (!cursor) return;
      cursor.hide();
      cursor.reset();
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: 'svg',
      drawTitle: true,
      followCursor: true,
      renderSingleHorizontalStaffline: singleLineView,
    });
    osmdRef.current = osmd;

    let cancelled = false;
    // Which SVG element belongs to which note(s) -- stable across scroll/layout shifts, only
    // rebuilt when OSMD actually re-renders (autoResize) and replaces the SVG elements
    // themselves. Screen position is deliberately NOT stored here; see findNoteHitAtPoint.
    let tappableNotes: TappableNote[] = [];

    const handleTap = (clientX: number, clientY: number) => {
      const hits = findNoteHitAtPoint(tappableNotes, clientX, clientY);
      if (hits && hits.length > 0) {
        onNoteTapRef.current?.(hits, { x: clientX, y: clientY });
        // Mark the tapped note's position on the score itself, via the exact same cursor
        // mechanism playback uses -- previously a tap only updated the piano keyboard below
        // the score, with nothing showing where the tap actually landed on the staff.
        osmd.cursor.show();
        stepCursorTo(osmd.cursor, hits[0].timestampRealValue);
      }
    };
    // Both click AND pointerup drive the same hit-test, deliberately redundant:
    // - click is the exact event every other working control in this app uses (Play/Pause,
    //   checkboxes, the piece library) -- the one mechanism proven reliable on the user's real
    //   tablet, an older Android device where PointerEvent support (setPointerCapture,
    //   touch-action honoring) may simply be patchier than in the desktop Chromium this is
    //   tested against. But click alone has a real gap: Chromium's touch-to-click synthesis
    //   applies its own movement threshold, and a real finger tap that drifts past it gets
    //   cancelled -- confirmed via a CDP-simulated real touch sequence in this repo's tests.
    // - pointerup has no such synthesis step, so it still catches a tap click silently drops
    //   due to drift, on browsers where PointerEvent works as spec'd.
    // Firing both for the same tap just re-sets the same MIDI notes twice -- harmless.
    const handleClick = (event: MouseEvent) => handleTap(event.clientX, event.clientY);
    const handlePointerUp = (event: PointerEvent) => handleTap(event.clientX, event.clientY);
    // Explicit pointer capture on pointerdown gives the browser the strongest possible signal
    // that JS owns this gesture, independent of whether it correctly honors touch-action: none
    // for gesture-claiming -- belt-and-suspenders alongside the CSS.
    const handlePointerDown = (event: PointerEvent) => {
      container.setPointerCapture(event.pointerId);
    };
    container.addEventListener('click', handleClick);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointerdown', handlePointerDown);

    let resizeTimeoutId: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeoutId);
      resizeTimeoutId = setTimeout(() => {
        if (!cancelled) tappableNotes = buildNoteIndex(osmd);
      }, 300);
    };
    window.addEventListener('resize', handleResize);

    osmd
      .load(source)
      .then(() => {
        if (cancelled) return;
        osmd.render();
        tappableNotes = buildNoteIndex(osmd);
        // Cursor stays hidden until playback starts or a note is tapped (see showCursor/
        // hideCursor and handleTap above) -- otherwise it sits on the page looking like
        // something is happening when nothing is.
        onScoreReadyRef.current?.(extractTimedNotes(osmd));
        onMetronomeClicksReadyRef.current?.(extractMetronomeClicks(osmd));
      })
      .catch((err: unknown) => {
        console.error('Failed to load/render score', err);
        if (!cancelled) onLoadErrorRef.current?.('Could not read this score. It may not be a valid MusicXML file.');
      });

    return () => {
      cancelled = true;
      clearTimeout(resizeTimeoutId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('click', handleClick);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointerdown', handlePointerDown);
      osmd.clear();
      container.innerHTML = '';
      osmdRef.current = null;
    };
  }, [source, singleLineView]);

  return <div ref={containerRef} className="score-viewer" />;
});
