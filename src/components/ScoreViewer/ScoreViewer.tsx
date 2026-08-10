import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { buildNoteIndex, findNoteHitAtPoint, type TappableNote } from './noteIndex';
import { extractMetronomeClicks, extractTimedNotes, type MetronomeClick, type TimedNote } from './extractTimedNotes';
import './ScoreViewer.css';

interface ScoreViewerProps {
  source: string | Blob;
  onNoteTap?: (midiNotes: number[]) => void;
  onScoreReady?: (timedNotes: TimedNote[]) => void;
  onMetronomeClicksReady?: (clicks: MetronomeClick[]) => void;
  onLoadError?: (message: string) => void;
}

export interface ScoreViewerHandle {
  /** Advances (or, for an earlier target, resets and fast-forwards) the OSMD cursor to the
   * given enrolled-timestamp real value, so it tracks playback position ("bouncing ball"). */
  advanceCursorTo: (targetRealValue: number) => void;
  /** Shows the score cursor. Only meant to be visible during active playback -- otherwise it
   * sits on the page looking like something is playing when nothing is. */
  showCursor: () => void;
  /** Hides the score cursor and resets it to the start, ready for the next playback. */
  hideCursor: () => void;
}

export const ScoreViewer = forwardRef<ScoreViewerHandle, ScoreViewerProps>(function ScoreViewer(
  { source, onNoteTap, onScoreReady, onMetronomeClicksReady, onLoadError },
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
      // The cursor only moves forward via next(); a target earlier than its current
      // position (e.g. a loop restarting) means we must reset and fast-forward again.
      if (cursor.iterator.CurrentEnrolledTimestamp.RealValue > targetRealValue) {
        cursor.reset();
      }
      let guard = 0;
      while (
        !cursor.iterator.EndReached &&
        cursor.iterator.CurrentEnrolledTimestamp.RealValue < targetRealValue &&
        guard++ < 10000
      ) {
        cursor.next();
      }
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
        onNoteTapRef.current?.(hits.map((hit) => hit.midi));
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
        // Cursor stays hidden until playback actually starts (see showCursor/hideCursor) --
        // otherwise it sits on the page looking like something is playing at all times.
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
  }, [source]);

  return <div ref={containerRef} className="score-viewer" />;
});
