import { Visualiser } from './base.js';

const POINT_STEP = 2; // use every 2nd sample: 1024 points is plenty for a smooth ring
const SEAM_BLEND = 0.05; // fraction of the ring blended into the first sample so the ends meet
const TRAIL = 'rgba(11, 13, 18, 0.25)';

// The raw waveform wrapped around a circle, with a core that glows with loudness.
export class WaveformRingVisualiser extends Visualiser {
  static id = 'waveform-ring';
  static label = 'Waveform ring';

  resize(width, height, dpr) {
    super.resize(width, height, dpr);
    this.clear();
  }

  draw({ waveformData, time }) {
    const { ctx, width, height, dpr } = this;
    const size = Math.min(width, height);
    const cx = width / 2;
    const cy = height / 2;
    const radius = size * 0.28;
    const amplitude = size * 0.18;
    const hue = (time / 40) % 360;

    let sumSquares = 0;
    for (let i = 0; i < waveformData.length; i++) {
      const sample = (waveformData[i] - 128) / 128;
      sumSquares += sample * sample;
    }
    const loudness = Math.min(1, Math.sqrt(sumSquares / waveformData.length) * 2.5);

    ctx.fillStyle = TRAIL;
    ctx.fillRect(0, 0, width, height);

    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    core.addColorStop(0, `hsla(${hue}, 90%, 60%, ${0.1 + loudness * 0.5})`);
    core.addColorStop(1, `hsla(${hue}, 90%, 60%, 0)`);
    ctx.fillStyle = core;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    ctx.beginPath();
    const count = waveformData.length;
    for (let i = 0; i < count; i += POINT_STEP) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const progress = i / count;
      let sample = waveformData[i];
      if (progress > 1 - SEAM_BLEND) {
        const blend = (progress - (1 - SEAM_BLEND)) / SEAM_BLEND;
        sample += (waveformData[0] - sample) * blend;
      }
      const r = radius + ((sample - 128) / 128) * amplitude;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // A wide faint stroke under a thin bright one reads as a glow, and is far
    // cheaper than shadowBlur.
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `hsla(${hue}, 90%, 60%, 0.25)`;
    ctx.lineWidth = 8 * dpr;
    ctx.stroke();
    ctx.strokeStyle = `hsl(${hue}, 90%, 75%)`;
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
  }
}
