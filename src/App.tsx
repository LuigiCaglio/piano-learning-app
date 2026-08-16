import { useEffect, useMemo, useRef, useState } from 'react';
import demoScore from './data/demo.musicxml?raw';
import { ScoreViewer, type ScoreViewerHandle } from './components/ScoreViewer/ScoreViewer';
import type { NoteHit } from './components/ScoreViewer/noteIndex';
import { PianoKeyboard } from './components/PianoKeyboard/PianoKeyboard';
import { NotePopup } from './components/NotePopup/NotePopup';
import { SettingsPanel } from './components/SettingsPanel/SettingsPanel';
import { useSettings } from './settings/useSettings';
import { TransportControls } from './components/TransportControls';
import { LoopSelector, type LoopRangeState } from './components/LoopSelector';
import { HandSelector, type HandFilter } from './components/HandSelector';
import { PageSelector } from './components/PageSelector';
import { FileImporter } from './components/FileImporter';
import { PieceLibrary } from './components/PieceLibrary/PieceLibrary';
import { listPieces, savePiece, stringToPiece, touchPiece, type Piece } from './components/PieceLibrary/db';
import { SampleLibrary } from './components/SampleLibrary/SampleLibrary';
import { SAMPLE_PIECES, type SamplePiece } from './data/samples';
import { usePlaybackEngine } from './playback/usePlaybackEngine';
import type { DisplayNote } from './lib/midi';
import {
  findTimeAtTimestamp,
  findTimestampAtTime,
  getMeasureRange,
  measureRangeToSeconds,
  type MetronomeClick,
  type TimedNote,
} from './components/ScoreViewer/extractTimedNotes';
import './App.css';

const STAFF_ID_RIGHT_HAND = 1;
const STAFF_ID_LEFT_HAND = 2;

function App() {
  const [activeNotes, setActiveNotes] = useState<DisplayNote[]>([]);
  const [timedNotes, setTimedNotes] = useState<TimedNote[]>([]);
  const [metronomeClicks, setMetronomeClicks] = useState<MetronomeClick[]>([]);
  const [loopRange, setLoopRange] = useState<LoopRangeState>({
    startMeasure: 1,
    endMeasure: 1,
    enabled: false,
  });
  const [handFilter, setHandFilter] = useState<HandFilter>('both');
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [currentPieceId, setCurrentPieceId] = useState<string | null>(null);
  const [source, setSource] = useState<string | Blob>(demoScore);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Default to the scrolling single-line layout: a multi-system score otherwise renders taller
  // than the viewport, pushing the piano keyboard below the fold. Kept as a toggle (not the only
  // option) since a full multi-line view is still useful for getting a sense of the whole piece.
  const [singleLineView, setSingleLineView] = useState(true);
  // Where to float the note-preview keyboard popup (full-score view only -- see handleNoteTap
  // and the render below); null when nothing's been tapped yet or the popup's been closed.
  const [notePopup, setNotePopup] = useState<{ x: number; y: number } | null>(null);
  const [playNoteOnTap, setPlayNoteOnTap] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Tempo/metronome/hand/loop controls start collapsed: the practice bar that holds them is
  // fixed to the bottom of the viewport specifically so Play/Pause and the keyboard are always
  // reachable without scrolling, even on a short landscape viewport -- but showing every control
  // all the time would eat too much of that same limited height, defeating the point.
  const [controlsExpanded, setControlsExpanded] = useState(false);
  // Full-score-only jump-to-page navigation (see ScoreViewer.scrollToPage/PageSelector);
  // reported by ScoreViewer since it's the one that knows the score's actual system layout.
  const [pageCount, setPageCount] = useState(1);
  const { settings, updateSettings } = useSettings();
  const scoreViewerRef = useRef<ScoreViewerHandle>(null);
  const practiceBarRef = useRef<HTMLDivElement>(null);
  const [practiceBarHeight, setPracticeBarHeight] = useState(0);

  // The practice bar's height varies (collapsed vs expanded, and with content like the hand
  // selector only appearing for multi-staff pieces) -- measure it live so the scrollable content
  // above it always reserves exactly enough space, rather than guessing a fixed constant that's
  // wrong in one state or the other.
  useEffect(() => {
    const el = practiceBarRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setPracticeBarHeight(entries[0].contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Playback only hears/schedules the selected hand's notes; everything else (the score
  // itself, the loop range, the follow-along cursor) still reflects the full piece.
  const playableNotes = useMemo(() => {
    if (handFilter === 'both') return timedNotes;
    const targetStaff = handFilter === 'right' ? STAFF_ID_RIGHT_HAND : STAFF_ID_LEFT_HAND;
    return timedNotes.filter((n) => n.staffId === targetStaff);
  }, [timedNotes, handFilter]);
  const hasMultipleStaves = useMemo(() => new Set(timedNotes.map((n) => n.staffId)).size > 1, [timedNotes]);

  const {
    isReady,
    isPlaying,
    tempoRatio,
    playingNotes,
    audioError,
    metronomeEnabled,
    play,
    pause,
    previewNotes,
    setTempoRatio,
    setMetronomeEnabled,
    engine,
  } = usePlaybackEngine(playableNotes, metronomeClicks);
  const displayedNotes = isPlaying ? playingNotes : activeNotes;
  const measureRange = getMeasureRange(timedNotes);

  useEffect(() => {
    listPieces().then(setPieces);
  }, []);

  // Reset the loop range and hand filter to sensible defaults whenever a new score loads.
  useEffect(() => {
    const range = getMeasureRange(timedNotes);
    if (range) {
      setLoopRange({ startMeasure: range.min, endMeasure: range.max, enabled: false });
    }
    setHandFilter('both');
    setNotePopup(null);
  }, [timedNotes]);

  // The popup is full-score-only (see handleNoteTap); close a stale one left open from before
  // switching to scroll view, rather than have it linger there uselessly.
  useEffect(() => {
    if (singleLineView) setNotePopup(null);
  }, [singleLineView]);

  useEffect(() => {
    if (!engine) return;
    if (!loopRange.enabled) {
      engine.setLoop(null);
      return;
    }
    const range = measureRangeToSeconds(timedNotes, loopRange.startMeasure, loopRange.endMeasure);
    engine.setLoop(range);
  }, [engine, timedNotes, loopRange]);

  // The score cursor ("bouncing ball") should only be visible while actually playing --
  // otherwise it sits on the page looking like something is playing when nothing is.
  useEffect(() => {
    if (isPlaying) {
      scoreViewerRef.current?.showCursor();
    } else {
      scoreViewerRef.current?.hideCursor();
    }
  }, [isPlaying]);

  // Follow-along cursor: while playing, repeatedly nudge the OSMD cursor to the note
  // position matching the playback engine's current time. Uses the full (unfiltered) note
  // list so the cursor keeps tracking real score position even when a hand is muted.
  useEffect(() => {
    if (!isPlaying || !engine) return;
    let rafId: number;
    const tick = () => {
      const target = findTimestampAtTime(timedNotes, engine.currentTime());
      if (target !== null) {
        scoreViewerRef.current?.advanceCursorTo(target);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, engine, timedNotes]);

  const openPiece = (piece: Piece) => {
    pause(); // switching scores mid-playback would otherwise keep the old piece sounding
    setLoadError(null);
    setCurrentPieceId(piece.id);
    setSource(piece.fileBlob);
    touchPiece(piece.id).then(() => listPieces()).then(setPieces);
  };

  const handleImported = (piece: Piece) => {
    setPieces((prev) => [piece, ...prev]);
    openPiece(piece);
  };

  // Sample pieces use a stable (not random) id, so re-selecting one that's already in the
  // library just reopens that entry instead of piling up duplicates.
  const handleSampleSelect = async (sample: SamplePiece) => {
    const existing = pieces.find((p) => p.id === sample.id);
    if (existing) {
      openPiece(existing);
      return;
    }
    const piece = stringToPiece(sample.id, sample.title, sample.composer, sample.xml);
    await savePiece(piece);
    setPieces((prev) => [piece, ...prev]);
    openPiece(piece);
  };

  const handleDeleted = (id: string) => {
    setPieces((prev) => prev.filter((p) => p.id !== id));
    if (id === currentPieceId) {
      setCurrentPieceId(null);
    }
  };

  // Tapping a note reports the whole beat across every staff (see ScoreViewer/noteIndex.ts);
  // narrow that down to one hand here, same as playableNotes below, when a hand filter is
  // active. Also seeks playback there, so pressing Play next starts from the tapped position
  // instead of always the beginning -- uses timedNotes (the full, hand-unfiltered list) for
  // that lookup since the seek target is a point in time, independent of which hand is
  // currently audible.
  const handleNoteTap = (hits: NoteHit[], tapPoint: { x: number; y: number }) => {
    const targetStaff = handFilter === 'right' ? STAFF_ID_RIGHT_HAND : handFilter === 'left' ? STAFF_ID_LEFT_HAND : null;
    const filtered = targetStaff === null ? hits : hits.filter((hit) => hit.staffId === targetStaff);
    const notes = filtered.map((hit) => ({ midi: hit.midi, name: hit.name }));
    setActiveNotes(notes);
    const time = findTimeAtTimestamp(timedNotes, hits[0].timestampRealValue);
    if (time !== null) engine?.seek(time);
    // The popup is only useful in full-score view -- in scroll view the fixed keyboard below
    // is already always on screen, so a floating copy would just be redundant.
    if (!singleLineView) setNotePopup(tapPoint);
    // Skip during active playback: the piece is already sounding, so an extra, out-of-time copy
    // of the tapped note would layer confusingly on top of it (PlaybackEngine.previewNotes also
    // guards this itself, but checking here avoids even attempting it).
    if (playNoteOnTap && !isPlaying && isReady) previewNotes(notes.map((n) => n.midi));
  };

  return (
    <div className="app" style={{ '--practice-bar-height': `${practiceBarHeight}px` } as React.CSSProperties}>
      <header className="app-header">
        <h1>Piano Learning</h1>
        <div className="app-header__actions">
          <SampleLibrary samples={SAMPLE_PIECES} onSelect={handleSampleSelect} />
          <FileImporter onImported={handleImported} />
          <button
            type="button"
            className="app-header__settings-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </header>
      <main>
        <PieceLibrary
          pieces={pieces}
          currentPieceId={currentPieceId}
          onSelect={openPiece}
          onDeleted={handleDeleted}
        />
        {loadError && <div className="load-error">{loadError}</div>}
        <div className="score-view-toggle" role="radiogroup" aria-label="Score layout">
          <button
            type="button"
            className={
              singleLineView ? 'score-view-toggle__option score-view-toggle__option--active' : 'score-view-toggle__option'
            }
            aria-pressed={singleLineView}
            onClick={() => setSingleLineView(true)}
          >
            Scroll (one line)
          </button>
          <button
            type="button"
            className={
              singleLineView ? 'score-view-toggle__option' : 'score-view-toggle__option score-view-toggle__option--active'
            }
            aria-pressed={!singleLineView}
            onClick={() => setSingleLineView(false)}
          >
            Full score
          </button>
        </div>
        <ScoreViewer
          ref={scoreViewerRef}
          source={source}
          singleLineView={singleLineView}
          darkMode={settings.theme === 'dark'}
          cursorColor={settings.scoreHighlightColor}
          onNoteTap={handleNoteTap}
          onScoreReady={setTimedNotes}
          onMetronomeClicksReady={setMetronomeClicks}
          onLoadError={setLoadError}
          onPageCountReady={setPageCount}
        />
        {!singleLineView && notePopup && (
          <NotePopup
            x={notePopup.x}
            y={notePopup.y}
            activeNotes={displayedNotes}
            showNoteNames={settings.showNoteNames}
            highlightColor={settings.keyHighlightColor}
            onClose={() => setNotePopup(null)}
          />
        )}
      </main>
      <div className="practice-bar" ref={practiceBarRef}>
        <button
          type="button"
          className="practice-bar__handle"
          onClick={() => setControlsExpanded((v) => !v)}
          aria-expanded={controlsExpanded}
        >
          {controlsExpanded ? '⌄ Hide controls' : '⌃ Tempo, metronome, hands, loop'}
        </button>
        {controlsExpanded && (
          <div className="practice-bar__extra">
            <label className="tap-sound-toggle">
              <input type="checkbox" checked={playNoteOnTap} onChange={(e) => setPlayNoteOnTap(e.target.checked)} />
              Play sound on tap
            </label>
            {!singleLineView && pageCount > 1 && (
              <PageSelector pageCount={pageCount} onJump={(pageIndex) => scoreViewerRef.current?.scrollToPage(pageIndex)} />
            )}
            {hasMultipleStaves && <HandSelector value={handFilter} onChange={setHandFilter} />}
            {measureRange && (
              <LoopSelector
                minMeasure={measureRange.min}
                maxMeasure={measureRange.max}
                value={loopRange}
                onChange={setLoopRange}
              />
            )}
            <TransportControls
              tempoRatio={tempoRatio}
              metronomeEnabled={metronomeEnabled}
              audioError={audioError}
              onTempoChange={setTempoRatio}
              onMetronomeChange={setMetronomeEnabled}
            />
          </div>
        )}
        <div className="practice-bar__essentials">
          <button
            type="button"
            className="transport-controls__play-pause"
            disabled={!isReady}
            onClick={isPlaying ? pause : play}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <div className="note-readout">
            {displayedNotes.length > 0
              ? displayedNotes.map((n) => n.name).join(', ')
              : 'Tap a note or chord above'}
          </div>
        </div>
        <PianoKeyboard
          activeNotes={displayedNotes}
          showNoteNames={settings.showNoteNames}
          highlightColor={settings.keyHighlightColor}
        />
      </div>
      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
      />
      <footer className="app-footer">
        Piano sound: Salamander Grand Piano by Alexander Holm, CC BY 3.0.
        <br />
        build {__COMMIT_HASH__}
      </footer>
    </div>
  );
}

export default App;
