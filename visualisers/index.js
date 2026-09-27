// Registry of available visualisers, in the order they appear in the picker.
// The first one is the default. To add your own, see visualisers/README.md.

import { BarsVisualiser } from './bars.js';
import { RadialVisualiser } from './radial.js';
import { WaveformVisualiser } from './waveform.js';

export const visualisers = [
  BarsVisualiser,
  RadialVisualiser,
  WaveformVisualiser,
];
