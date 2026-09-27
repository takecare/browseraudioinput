// Flow 4: the render loop. It owns the canvas and the animation frame, and
// delegates the actual drawing to whichever visualiser is selected.

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
      visualiser.resize(width, height, dpr);
      needsResize = false;
    }

    const deltaTime = lastTime === null ? 0 : time - lastTime;
    lastTime = time;
    const { frequencyData, waveformData } = getFrameData(); // fresh FFT data, read once per frame

    canvasCtx.save();
    try {
      visualiser.draw({ frequencyData, waveformData, time, deltaTime });
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
