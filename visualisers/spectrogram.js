import { Visualiser, bandLevel, logBands } from './base.js';

const ROWS = 160;
const SCROLL_SPEED = 120; // CSS pixels per second
const BACKGROUND = '#0b0d12';

// 256 colours from near-black blue through purple and orange to pale yellow.
function buildPalette() {
  const palette = [];
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    palette.push(`hsl(${(250 + t * 160) % 360}, 90%, ${4 + t * 58}%)`);
  }
  return palette;
}

// Scrolling waterfall: time runs right to left, pitch runs bottom (bass) to
// top (treble), and brightness is loudness.
export class SpectrogramVisualiser extends Visualiser {
  static id = 'spectrogram';
  static label = 'Spectrogram';

  constructor(ctx, audio) {
    super(ctx, audio);
    this.bands = logBands(ROWS, audio);
    this.palette = buildPalette();
    this.scrollDebt = 0; // fractional pixels owed to the scroll
  }

  resize(width, height, dpr) {
    super.resize(width, height, dpr);
    this.ctx.fillStyle = BACKGROUND;
    this.ctx.fillRect(0, 0, width, height);
  }

  draw({ frequencyData, deltaTime }) {
    const { ctx, width, height, dpr } = this;

    // Scroll by elapsed time, not per frame, so speed is the same at 60 Hz and 120 Hz.
    this.scrollDebt += (deltaTime / 1000) * SCROLL_SPEED * dpr;
    const shift = Math.min(width, Math.floor(this.scrollDebt));
    if (shift === 0) return;
    this.scrollDebt -= shift;

    // Move everything already drawn left, then paint the newest column on the right.
    ctx.drawImage(ctx.canvas, shift, 0, width - shift, height, 0, 0, width - shift, height);

    const x = width - shift;
    for (let row = 0; row < ROWS; row++) {
      const level = bandLevel(frequencyData, this.bands[row]);
      const y0 = Math.round(height - ((row + 1) / ROWS) * height);
      const y1 = Math.round(height - (row / ROWS) * height);
      ctx.fillStyle = this.palette[Math.round(level * 255)];
      ctx.fillRect(x, y0, shift, y1 - y0);
    }
  }
}
