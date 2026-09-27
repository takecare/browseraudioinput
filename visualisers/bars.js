import { Visualiser, bandLevel, logBands } from './base.js';

const BAR_COUNT = 96;
const BAR_GAP = 2; // CSS pixels

// Classic spectrum: log-spaced frequency bands as vertical bars.
export class BarsVisualiser extends Visualiser {
  static id = 'bars';
  static label = 'Spectrum bars';

  constructor(ctx, audio) {
    super(ctx, audio);
    this.bands = logBands(BAR_COUNT, audio);
  }

  draw({ frequencyData }) {
    const { ctx, width, height, dpr } = this;
    this.clear();

    const slotWidth = width / BAR_COUNT;
    const barWidth = Math.max(1, slotWidth - BAR_GAP * dpr);

    this.bands.forEach((band, i) => {
      const level = bandLevel(frequencyData, band);
      const barHeight = level * height;
      ctx.fillStyle = `hsl(${220 + (i / BAR_COUNT) * 120}, 80%, ${45 + level * 25}%)`;
      ctx.fillRect(i * slotWidth, height - barHeight, barWidth, barHeight);
    });
  }
}
