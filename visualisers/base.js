// Base class every visualiser extends. See visualisers/README.md.
//
// Lifecycle (driven by src/renderer.js):
//   constructor(ctx, audio)   once, when the visualiser is selected
//   resize(width, height, dpr) before the first draw and whenever the canvas size changes
//   draw(frame)               once per animation frame
//   destroy()                 when another visualiser is picked or capture stops
//
// The renderer wraps every draw() in ctx.save()/ctx.restore(), so canvas state
// (transforms, fillStyle, globalAlpha...) never leaks between visualisers.
export class Visualiser {
  // Unique, URL-safe identifier. Also used to remember the user's choice.
  static id = '';
  // Name shown in the picker.
  static label = '';

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ sampleRate: number, fftSize: number, binCount: number }} audio
   */
  constructor(ctx, audio) {
    this.ctx = ctx;
    this.audio = audio;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
  }

  // Sizes are in device pixels (the canvas backing store). Multiply CSS-pixel
  // measurements such as line widths by `dpr` to keep them consistent on Retina.
  resize(width, height, dpr) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  /**
   * @param {{
   *   frequencyData: Uint8Array, // binCount magnitudes, 0–255, low → high frequency
   *   waveformData: Uint8Array,  // fftSize samples, 0–255, 128 = silence
   *   time: number,              // ms timestamp from requestAnimationFrame
   *   deltaTime: number,         // ms since the previous frame
   * }} frame
   */
  draw(frame) {
    throw new Error(`${this.constructor.name} must implement draw(frame)`);
  }

  destroy() {}

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}

// Groups FFT bins into `count` bands spaced logarithmically between minFreq
// and maxFreq, so bass, mids and treble get a fair share. Returns
// [startBin, endBin) pairs; use with bandLevel() below.
export function logBands(count, { sampleRate, binCount }, minFreq = 30, maxFreq = 16000) {
  const binWidth = sampleRate / 2 / binCount;
  const bands = [];
  for (let i = 0; i < count; i++) {
    const lowFreq = minFreq * (maxFreq / minFreq) ** (i / count);
    const highFreq = minFreq * (maxFreq / minFreq) ** ((i + 1) / count);
    const start = Math.min(binCount - 1, Math.floor(lowFreq / binWidth));
    const end = Math.min(binCount, Math.max(start + 1, Math.ceil(highFreq / binWidth)));
    bands.push([start, end]);
  }
  return bands;
}

// Peak level of a band, normalised to 0–1.
export function bandLevel(frequencyData, [start, end]) {
  let peak = 0;
  for (let bin = start; bin < end; bin++) {
    if (frequencyData[bin] > peak) peak = frequencyData[bin];
  }
  return peak / 255;
}
