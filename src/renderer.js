// Flow 4: the render loop. It owns the canvas and the animation frame, and
// delegates the actual drawing to whichever visualiser is selected.

const MAX_DELTA_TIME = 100; // ms

// Keeps the canvas backing store matched to its on-screen size so drawings
// stay crisp on Retina displays and after window resizes.
function fitCanvasToDisplay(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * dpr);
  const height = Math.round(canvas.clientHeight * dpr);
  const changed = canvas.width !== width || canvas.height !== height;
  if (changed) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, dpr, changed };
}

/**
 * Starts drawing with `VisualiserClass`. Returns a controller to swap the
 * visualiser while running, or stop the loop and clear the canvas.
 *
 * @param {CanvasRenderingContext2D} canvasCtx
 * @param {() => { frequencyData: Uint8Array, waveformData: Uint8Array }} getFrameData
 * @param {{ sampleRate: number, fftSize: number, binCount: number }} audio
 * @param {typeof import('../visualisers/base.js').Visualiser} VisualiserClass
 */
export function startRenderLoop(canvasCtx, getFrameData, audio, VisualiserClass) {
  const { canvas } = canvasCtx;
  let visualiser = null;
  let needsResize = true;
  let frameId = null;
  let lastTime = null;

  function setVisualiser(NextClass) {
    visualiser?.destroy();
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    visualiser = new NextClass(canvasCtx, audio);
    needsResize = true;
  }

  function draw(time) {
    frameId = requestAnimationFrame(draw); // ties rendering to the display's refresh rate

    const { width, height, dpr, changed } = fitCanvasToDisplay(canvas);
    if (changed || needsResize) {
      withSavedState(() => visualiser.resize(width, height, dpr));
      needsResize = false;
    }

    // Capped so animations don't jump after the tab was hidden (rAF pauses then).
    const deltaTime = lastTime === null ? 0 : Math.min(time - lastTime, MAX_DELTA_TIME);
    lastTime = time;
    const { frequencyData, waveformData } = getFrameData(); // fresh FFT data, read once per frame

    withSavedState(() => visualiser.draw({ frequencyData, waveformData, time, deltaTime }));
  }

  // Keeps canvas state (transforms, styles, compositing) from leaking out of a visualiser.
  function withSavedState(fn) {
    canvasCtx.save();
    try {
      fn();
    } finally {
      canvasCtx.restore();
    }
  }

  setVisualiser(VisualiserClass);
  frameId = requestAnimationFrame(draw);

  return {
    setVisualiser,
    stop() {
      cancelAnimationFrame(frameId);
      visualiser?.destroy();
      visualiser = null;
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
