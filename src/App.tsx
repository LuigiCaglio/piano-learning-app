import { useEffect, useMemo, useRef, useState } from 'react';
import demoScore from './data/demo.musicxml?raw';
import { ScoreViewer, type ScoreViewerHandle } from './components/ScoreViewer/ScoreViewer';
import { PianoKeyboard } from './components/PianoKeyboard/PianoKeyboard';
import { TransportControls } from './components/TransportControls';
import { LoopSelector, type LoopRangeState } from './components/LoopSelector';
import { HandSelector, type HandFilter } from './components/HandSelector';
import { FileImporter } from './components/FileImporter';
import { PieceLibrary } from './components/PieceLibrary/PieceLibrary';
import { listPieces, touchPiece, type Piece } from './components/PieceLibrary/db';
import { usePlaybackEngine } from './playback/usePlaybackEngine';
import { midiToNoteName } from './lib/midi';
import {
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
  const [activeMidiNotes, setActiveMidiNotes] = useState<number[]>([]);
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
  const scoreViewerRef = useRef<ScoreViewerHandle>(null);

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
    playingMidiNotes,
    audioError,
    metronomeEnabled,
    play,
    pause,
    setTempoRatio,
    setMetronomeEnabled,
    engine,
  } = usePlaybackEngine(playableNotes, metronomeClicks);
  const displayedMidiNotes = isPlaying ? playingMidiNotes : activeMidiNotes;
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
  }, [timedNotes]);

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

  const handleDeleted = (id: string) => {
    setPieces((prev) => prev.filter((p) => p.id !== id));
    if (id === currentPieceId) {
      setCurrentPieceId(null);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Piano Learning</h1>
        <FileImporter onImported={handleImported} />
      </header>
      <main>
        <PieceLibrary
          pieces={pieces}
          currentPieceId={currentPieceId}
          onSelect={openPiece}
          onDeleted={handleDeleted}
        />
        {loadError && <div className="load-error">{loadError}</div>}
        <ScoreViewer
          ref={scoreViewerRef}
          source={source}
          onNoteTap={setActiveMidiNotes}
          onScoreReady={setTimedNotes}
          onMetronomeClicksReady={setMetronomeClicks}
          onLoadError={setLoadError}
        />
        <div className="note-readout">
          {displayedMidiNotes.length > 0
            ? displayedMidiNotes.map(midiToNoteName).join(', ')
            : 'Tap a note or chord above'}
        </div>
        <PianoKeyboard activeMidiNotes={displayedMidiNotes} />
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
          isReady={isReady}
          isPlaying={isPlaying}
          tempoRatio={tempoRatio}
          metronomeEnabled={metronomeEnabled}
          audioError={audioError}
          onPlay={play}
          onPause={pause}
          onTempoChange={setTempoRatio}
          onMetronomeChange={setMetronomeEnabled}
        />
      </main>
      <footer className="app-footer">
        Piano sound: Salamander Grand Piano by Alexander Holm, CC BY 3.0.
        <br />
        build {__COMMIT_HASH__}
      </footer>
    </div>
  );
}

export default App;
