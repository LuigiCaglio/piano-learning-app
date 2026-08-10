import { useEffect, useRef, useState } from 'react';
import { PlaybackEngine } from './PlaybackEngine';
import type { MetronomeClick, TimedNote } from '../components/ScoreViewer/extractTimedNotes';

export function usePlaybackEngine(timedNotes: TimedNote[], metronomeClicks: MetronomeClick[] = []) {
  const engineRef = useRef<PlaybackEngine | null>(null);
  const notesRef = useRef(timedNotes);
  notesRef.current = timedNotes;
  const clicksRef = useRef(metronomeClicks);
  clicksRef.current = metronomeClicks;
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [tempoRatio, setTempoRatioState] = useState(1);
  const [playingMidiNotes, setPlayingMidiNotes] = useState<number[]>([]);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [metronomeEnabled, setMetronomeEnabledState] = useState(false);

  // Created and disposed within the same effect (rather than lazily in render) so that
  // React StrictMode's dev-only mount->cleanup->remount cycle rebuilds a fresh, usable
  // engine instead of leaving engineRef pointing at an already-disposed one.
  useEffect(() => {
    const engine = new PlaybackEngine({
      onNoteOn: (midi) =>
        setPlayingMidiNotes((prev) => (prev.includes(midi) ? prev : [...prev, midi])),
      onNoteOff: (midi) => setPlayingMidiNotes((prev) => prev.filter((m) => m !== midi)),
      onPlaybackEnd: () => setIsPlaying(false),
    });
    engineRef.current = engine;
    engine.setNotes(notesRef.current);
    engine.setMetronomeClicks(clicksRef.current);

    let cancelled = false;
    engine.ready
      .then(() => {
        if (!cancelled) setIsReady(true);
      })
      .catch(() => {
        if (!cancelled) setAudioError('Piano sound unavailable -- needs an internet connection at least once.');
      });

    return () => {
      cancelled = true;
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setNotes(timedNotes);
  }, [timedNotes]);

  useEffect(() => {
    engineRef.current?.setMetronomeClicks(metronomeClicks);
  }, [metronomeClicks]);

  const play = () => {
    engineRef.current?.play().then(() => setIsPlaying(true));
  };

  const pause = () => {
    engineRef.current?.pause();
    setIsPlaying(false);
  };

  const setTempoRatio = (ratio: number) => {
    engineRef.current?.setTempoRatio(ratio);
    setTempoRatioState(ratio);
  };

  const setMetronomeEnabled = (enabled: boolean) => {
    engineRef.current?.setMetronomeEnabled(enabled);
    setMetronomeEnabledState(enabled);
  };

  return {
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
    engine: engineRef.current,
  };
}
