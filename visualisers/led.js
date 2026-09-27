import { Visualiser, bandLevel, logBands } from './base.js';

const COLUMNS = 32;
const SEGMENTS = 24;
const GAP = 3; // CSS pixels
const PADDING = 0.08; // fraction of the canvas left empty around the display
const PEAK_HOLD = 0.6; // seconds a peak marker hangs before falling
const PEAK_FALL = 0.9; // levels per second

function segmentHue(segment) {
  const position = segment / SEGMENTS;
  if (position < 0.6) return 130; // green
  if (position < 0.85) return 48; // amber
  return 0; // red
}

// Retro hi-fi LED spectrum: segmented columns with falling peak markers.
export class LedVisualiser extends Visualiser {
  static id = 'led';
  static label = 'LED spectrum';

  constructor(ctx, audio) {
    super(ctx, audio);
    this.bands = logBands(COLUMNS, audio);
    this.peaks = new Float32Array(COLUMNS);
    this.peakAges = new Float32Array(COLUMNS);
    this.litColours = [];
    this.dimColours = [];
    for (let s = 0; s < SEGMENTS; s++) {
      this.litColours.push(`hsl(${segmentHue(s)}, 90%, 55%)`);
      this.dimColours.push(`hsl(${segmentHue(s)}, 40%, 12%)`);
    }
  }

  draw({ frequencyData, deltaTime }) {
    const { ctx, width, height, dpr, peaks, peakAges } = this;
    const dt = deltaTime / 1000;
    this.clear();

    const gap = GAP * dpr;
    const left = width * PADDING;
    const top = height * PADDING;
    const areaWidth = width - left * 2;
    const areaHeight = height - top * 2;
    const columnWidth = (areaWidth - gap * (COLUMNS - 1)) / COLUMNS;
    const segmentHeight = (areaHeight - gap * (SEGMENTS - 1)) / SEGMENTS;
    const bottom = top + areaHeight;

    for (let col = 0; col < COLUMNS; col++) {
      const level = bandLevel(frequencyData, this.bands[col]);

      if (level >= peaks[col]) {
        peaks[col] = level;
        peakAges[col] = 0;
      } else {
        peakAges[col] += dt;
        if (peakAges[col] > PEAK_HOLD) peaks[col] = Math.max(0, peaks[col] - PEAK_FALL * dt);
      }

      const x = left + col * (columnWidth + gap);
      const lit = Math.round(level * SEGMENTS);
      const peakSegment = Math.min(SEGMENTS - 1, Math.floor(peaks[col] * SEGMENTS));

      for (let s = 0; s < SEGMENTS; s++) {
        const y = bottom - (s + 1) * segmentHeight - s * gap;
        if (s < lit) ctx.fillStyle = this.litColours[s];
        else if (s === peakSegment && peaks[col] > 0.02) ctx.fillStyle = '#f4f6ff';
        else ctx.fillStyle = this.dimColours[s];
        ctx.fillRect(x, y, columnWidth, segmentHeight);
      }
    }
  }
}
