# Visualisers

Each file in this folder is one visualiser: a class that extends `Visualiser` from `base.js` and draws one frame of audio onto a 2D canvas. The render loop in `src/renderer.js` handles everything else: capturing audio, running the FFT, sizing the canvas and scheduling frames.

## Adding a visualiser

1. Create `visualisers/my-visualiser.js`:

   ```js
   import { Visualiser, bandLevel, logBands } from './base.js';

   export class MyVisualiser extends Visualiser {
     static id = 'my-visualiser';    // unique; used to remember the user's choice
     static label = 'My visualiser'; // shown in the picker

     constructor(ctx, audio) {
       super(ctx, audio);
       this.bands = logBands(32, audio); // optional: 32 log-spaced frequency bands
     }

     draw({ frequencyData, waveformData, time, deltaTime }) {
       const { ctx, width, height } = this;
       this.clear();
       this.bands.forEach((band, i) => {
         const level = bandLevel(frequencyData, band); // 0–1
         ctx.fillStyle = `hsl(${i * 10}, 80%, 60%)`;
         ctx.fillRect(0, i * (height / 32), level * width, height / 32 - 2);
       });
     }
   }
   ```

2. Register it in `visualisers/index.js`:

   ```js
   import { MyVisualiser } from './my-visualiser.js';

   export const visualisers = [
     BarsVisualiser,
     RadialVisualiser,
     WaveformVisualiser,
     MyVisualiser,
   ];
   ```

That's all. It now shows up in the picker.

The site has no build step, so the browser can't list the files in this folder. That's why each visualiser has to be registered in `index.js`.

## API

### What you get

| Member | Description |
| --- | --- |
| `this.ctx` | The canvas's `CanvasRenderingContext2D` |
| `this.width`, `this.height` | Canvas size in **device pixels** |
| `this.dpr` | Device pixel ratio. Multiply CSS-pixel sizes (line widths, gaps) by it to keep them consistent on Retina screens. |
| `this.audio` | `{ sampleRate, fftSize, binCount }` |
| `this.clear()` | Clears the whole canvas |

### What you implement

| Method | When it's called | Required |
| --- | --- | --- |
| `draw(frame)` | Every animation frame | Yes |
| `constructor(ctx, audio)` | Once, when the visualiser is selected. Call `super(ctx, audio)` first. | No |
| `resize(width, height, dpr)` | Before the first `draw`, and whenever the canvas size changes. Call `super.resize(...)` first. | No |
| `destroy()` | When another visualiser is picked or capture stops | No |

`frame` contains:

| Field | Description |
| --- | --- |
| `frequencyData` | `Uint8Array` of `binCount` (1024) magnitudes, 0–255, from low to high frequency. Bins are linearly spaced: bin `i` covers roughly `i * sampleRate / fftSize` Hz. |
| `waveformData` | `Uint8Array` of `fftSize` (2048) samples, 0–255, where 128 is silence |
| `time` | Timestamp in milliseconds from `requestAnimationFrame` |
| `deltaTime` | Milliseconds since the previous frame, capped at 100. Use it to animate at the same speed on 60 Hz and 120 Hz displays. |

### Helpers in `base.js`

- `logBands(count, audio, minFreq = 30, maxFreq = 16000)` groups the FFT bins into `count` bands spaced logarithmically, which matches how we hear pitch. It returns `[startBin, endBin)` pairs.
- `bandLevel(frequencyData, band)` returns the peak level of one band, from 0 to 1.

### Rules of thumb

- Each `resize` and `draw` call is wrapped in `ctx.save()` / `ctx.restore()`, so you can change transforms, styles or `globalAlpha` freely without affecting the next frame or the next visualiser.
- You don't have to clear the canvas every frame. Painting a semi-transparent background instead leaves trails (see `waveform.js`, `particles.js` and `starfield.js`).
- Don't allocate large arrays in `draw`, because it runs 60–120 times a second. Precompute in the constructor or in `resize`. `particles.js` and `starfield.js` show how to keep many moving objects in typed arrays.
- Never connect anything to `audioContext.destination`. Visualisers only read the audio; the app playing it (Spotify, etc.) already sends it to the speakers.
