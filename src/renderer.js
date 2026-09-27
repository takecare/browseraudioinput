// Flow 4: Canvas 2D render loop.

const BAR_COUNT = 96;
const MIN_FREQ = 30; // Hz
const MAX_FREQ = 16000; // Hz
const BAR_GAP = 2; // CSS pixels

// Maps each bar to a range of FFT bins, spaced logarithmically so bass,
// mids and treble get a fair share of the width (linear spacing would give
// almost all bars to frequencies above 5 kHz).
function computeBarRanges(binCount, sampleRate) {
  const binWidth = sampleRate / 2 / binCount;
  const ranges = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const lowFreq = MIN_FREQ * (MAX_FREQ / MIN_FREQ) ** (i / BAR_COUNT);
    const highFreq = MIN_FREQ * (MAX_FREQ / MIN_FREQ) ** ((i + 1) / BAR_COUNT);
    const start = Math.min(binCount - 1, Math.floor(lowFreq / binWidth));
    const end = Math.min(binCount, Math.max(start + 1, Math.ceil(highFreq / binWidth)));
    ranges.push([start, end]);
  }
  return ranges;
}

// Keeps the canvas backing store matched to its on-screen size so bars
// stay crisp on Retina displays and after window resizes.
function fitCanvasToDisplay(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * dpr);
  const height = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return dpr;
}

// Starts drawing; returns a function that stops the loop and clears the canvas.
export function startRenderLoop(canvasCtx, getFrameData, { sampleRate }) {
  const { canvas } = canvasCtx;
  let barRanges = null;
  let frameId = null;

  function draw() {
    frameId = requestAnimationFrame(draw); // ties rendering to the display's refresh rate

    const dpr = fitCanvasToDisplay(canvas);
    const { width, height } = canvas;
    const { frequencyData } = getFrameData(); // fresh FFT data, read once per frame
    barRanges ??= computeBarRanges(frequencyData.length, sampleRate);

    canvasCtx.clearRect(0, 0, width, height);

    const slotWidth = width / BAR_COUNT;
    const barWidth = Math.max(1, slotWidth - BAR_GAP * dpr);

    barRanges.forEach(([start, end], i) => {
      let peak = 0;
      for (let bin = start; bin < end; bin++) {
        if (frequencyData[bin] > peak) peak = frequencyData[bin];
      }
      const level = peak / 255;
      const barHeight = level * height;

      canvasCtx.fillStyle = `hsl(${220 + (i / BAR_COUNT) * 120}, 80%, ${45 + level * 25}%)`;
      canvasCtx.fillRect(i * slotWidth, height - barHeight, barWidth, barHeight);
    });
  }

  draw();

  return function stop() {
    cancelAnimationFrame(frameId);
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
