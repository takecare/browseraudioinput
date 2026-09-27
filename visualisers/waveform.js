import { Visualiser } from './base.js';

const BACKGROUND = 'rgba(11, 13, 18, 0.3)'; // partially clears each frame, leaving short trails

// Oscilloscope: the raw waveform as a glowing line.
export class WaveformVisualiser extends Visualiser {
  static id = 'waveform';
  static label = 'Oscilloscope';

  resize(width, height, dpr) {
    super.resize(width, height, dpr);
    this.clear();
  }

  draw({ waveformData }) {
    const { ctx, width, height, dpr } = this;

    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = '#7fd4ff';
    ctx.shadowColor = '#5b8cff';
    ctx.shadowBlur = 12 * dpr;

    ctx.beginPath();
    const step = width / (waveformData.length - 1);
    for (let i = 0; i < waveformData.length; i++) {
      const y = (waveformData[i] / 255) * height;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * step, y);
    }
    ctx.stroke();
  }
}
