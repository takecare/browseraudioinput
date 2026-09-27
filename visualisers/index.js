// Registry of available visualisers, in the order they appear in the picker.
// The first one is the default. To add your own, see visualisers/README.md.

import { AntiGravVisualiser } from './anti-grav.js';
import { BarsVisualiser } from './bars.js';
import { LedVisualiser } from './led.js';
import { ParticlesVisualiser } from './particles.js';
import { RadialVisualiser } from './radial.js';
import { SpectrogramVisualiser } from './spectrogram.js';
import { StarfieldVisualiser } from './starfield.js';
import { WaveformRingVisualiser } from './waveform-ring.js';
import { WaveformVisualiser } from './waveform.js';

export const visualisers = [
  BarsVisualiser,
  LedVisualiser,
  RadialVisualiser,
  SpectrogramVisualiser,
  ParticlesVisualiser,
  StarfieldVisualiser,
  WaveformRingVisualiser,
  WaveformVisualiser,
  AntiGravVisualiser,
];
