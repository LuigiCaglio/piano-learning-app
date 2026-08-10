import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { buildNoteIndex, findNoteHitAtPoint, type NoteRegion } from './noteIndex';
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
  // TEMPORARY diagnostic (remove once the real-device tap-to-identify issue is root-caused):
  // surfaces what's actually happening on-screen so it can be read without device DevTools.
  const [debugInfo, setDebugInfo] = useState('waiting for score to load...');

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
    let noteRegions: NoteRegion[] = [];

    // pointerup, not click: Chromium's touch-to-click synthesis applies its own fixed "was
    // this a tap or a drag" movement threshold (~10px) independent of touch-action, and a
    // real finger tap routinely drifts further than that -- click was still swallowing taps
    // that had noticeable movement even with touch-action: none on the container. pointerup
    // has no such synthesis step; with native gesture-claiming disabled (touch-action: none
    // in ScoreViewer.css), it's the container's only touch interaction, so it reliably fires
    // for every touch regardless of drift.
    const handlePointerUp = (event: PointerEvent) => {
      const hits = findNoteHitAtPoint(noteRegions, event.clientX, event.clientY);
      setDebugInfo(
        `pointerup type=${event.pointerType} @ (${Math.round(event.clientX)}, ${Math.round(event.clientY)}) | ` +
          `regions=${noteRegions.length} | hit=${hits ? hits.map((h) => h.midi).join(',') : 'none'}`,
      );
      if (hits && hits.length > 0) {
        onNoteTapRef.current?.(hits.map((hit) => hit.midi));
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      setDebugInfo(`pointerdown type=${event.pointerType} @ (${Math.round(event.clientX)}, ${Math.round(event.clientY)})`);
    };
    const handlePointerCancel = (event: PointerEvent) => {
      setDebugInfo(`pointercancel type=${event.pointerType} -- browser claimed the gesture natively`);
    };
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerCancel);

    // Note regions are cached viewport-relative rects (getBoundingClientRect()), which go
    // stale whenever anything scrolls -- not just on OSMD's own autoResize re-renders (e.g.
    // tablet rotation), but on ordinary page scroll and on the score container's own
    // horizontal scroll (it's `overflow-x: auto` for wide scores). Without this, taps drift
    // out of alignment with the actual notes as soon as the page has scrolled at all.
    let rebuildTimeoutId: ReturnType<typeof setTimeout>;
    const scheduleRebuild = (delay: number) => {
      clearTimeout(rebuildTimeoutId);
      rebuildTimeoutId = setTimeout(() => {
        if (!cancelled) noteRegions = buildNoteIndex(osmd);
      }, delay);
    };
    const handleResize = () => scheduleRebuild(300);
    const handleScroll = () => scheduleRebuild(100);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, { passive: true });
    container.addEventListener('scroll', handleScroll, { passive: true });

    osmd
      .load(source)
      .then(() => {
        if (cancelled) return;
        osmd.render();
        noteRegions = buildNoteIndex(osmd);
        setDebugInfo(`score ready, ${noteRegions.length} tappable regions built -- tap a note`);
        // Cursor stays hidden until playback actually starts (see showCursor/hideCursor) --
        // otherwise it sits on the page looking like something is playing at all times.
        onScoreReadyRef.current?.(extractTimedNotes(osmd));
        onMetronomeClicksReadyRef.current?.(extractMetronomeClicks(osmd));
      })
      .catch((err: unknown) => {
        console.error('Failed to load/render score', err);
        setDebugInfo(`LOAD ERROR: ${err instanceof Error ? err.message : String(err)}`);
        if (!cancelled) onLoadErrorRef.current?.('Could not read this score. It may not be a valid MusicXML file.');
      });

    return () => {
      cancelled = true;
      clearTimeout(rebuildTimeoutId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerCancel);
      osmd.clear();
      container.innerHTML = '';
      osmdRef.current = null;
    };
  }, [source]);

  return (
    <>
      <div ref={containerRef} className="score-viewer" />
      <div className="score-viewer__debug">DEBUG: {debugInfo}</div>
    </>
  );
});
