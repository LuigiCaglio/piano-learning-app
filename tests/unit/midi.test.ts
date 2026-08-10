import { describe, it, expect } from 'vitest';
import { midiToNoteName } from '../../src/lib/midi.js';

describe('midiToNoteName', () => {
  it('converts middle C (60) to C4', () => {
    expect(midiToNoteName(60)).toBe('C4');
  });

  it('converts the lowest piano key (21) to A0', () => {
    expect(midiToNoteName(21)).toBe('A0');
  });

  it('converts the highest piano key (108) to C8', () => {
    expect(midiToNoteName(108)).toBe('C8');
  });

  it('names sharps with a # suffix', () => {
    expect(midiToNoteName(61)).toBe('C#4');
    expect(midiToNoteName(70)).toBe('A#4');
  });

  it('handles octave boundaries correctly around B/C', () => {
    expect(midiToNoteName(59)).toBe('B3');
    expect(midiToNoteName(60)).toBe('C4');
  });

  it('handles MIDI note 0 as C-1', () => {
    expect(midiToNoteName(0)).toBe('C-1');
  });
});
