import twinkleTwinkleLittleStar from './twinkleTwinkleLittleStar.musicxml?raw';
import odeToJoy from './odeToJoy.musicxml?raw';
import furElise from './furElise.musicxml?raw';

export interface SamplePiece {
  /** Stable, deterministic (not random) so re-selecting the same sample updates the existing
   * library entry instead of piling up duplicates -- see App.tsx's handleSampleSelect. */
  id: string;
  title: string;
  composer: string;
  xml: string;
}

/** A small bundled library of short, public-domain pieces, hand-transcribed (not pulled from
 * any third-party site) so there's something recognizable to practice with beyond the demo
 * scale exercise, without the copyright/ToS problems of scraping a site like musescore.com. */
export const SAMPLE_PIECES: SamplePiece[] = [
  {
    id: 'sample-twinkle-twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    composer: 'Traditional',
    xml: twinkleTwinkleLittleStar,
  },
  {
    id: 'sample-ode-to-joy',
    title: 'Ode to Joy (theme)',
    composer: 'Beethoven',
    xml: odeToJoy,
  },
  {
    id: 'sample-fur-elise',
    title: 'Fur Elise (opening, simplified)',
    composer: 'Beethoven',
    xml: furElise,
  },
];
