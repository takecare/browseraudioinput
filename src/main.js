// Wires capture -> analyser -> renderer together and owns app state.

import {
  NoAudioTrackError,
  UnsupportedBrowserError,
  createAudioSource,
  getActiveStream,
  isCaptureSupported,
  isLikelyChromium,
  requestSystemAudio,
} from './capture.js';
import { readFrame, setUpAnalyser } from './analyser.js';
import { setUpPicker } from './picker.js';
import { startRenderLoop } from './renderer.js';
import { visualisers } from '../visualisers/index.js';

const canvas = document.getElementById('visualiser');
const canvasCtx = canvas.getContext('2d');
const promptEl = document.getElementById('prompt');
const shareButton = document.getElementById('share-button');
const statusEl = document.getElementById('status');
const toolbarEl = document.getElementById('toolbar');
const pickerEl = document.getElementById('visualiser-picker');

const UNSUPPORTED_MESSAGE =
  'This browser can’t capture system audio. Please use Chrome (141+) or Brave on macOS 14.2 or later.';
const TOOLBAR_IDLE_MS = 2500;

// The running pipeline, or null when we're showing the "Share your audio" prompt.
let session = null;
let selectedVisualiser = null;

function showPrompt(message = '') {
  promptEl.hidden = false;
  shareButton.disabled = false;
  shareButton.textContent = message ? 'Try again' : 'Share your audio';
  statusEl.textContent = message;
}

function hidePrompt() {
  promptEl.hidden = true;
  statusEl.textContent = '';
}

function startVisualising(stream) {
  const { audioContext, source } = createAudioSource(stream, onAudioStreamEnded);
  const analyserState = setUpAnalyser(audioContext, source);
  const renderer = startRenderLoop(
    canvasCtx,
    () => readFrame(analyserState),
    analyserState.audio,
    selectedVisualiser,
  );

  session = { audioContext, renderer };
  hidePrompt();
}

function teardown() {
  if (!session) return;
  session.renderer.stop();
  session.audioContext.close();
  session = null;
}

// The user clicked "Stop sharing" in the browser's own UI, or the shared
// window closed: go back to the prompt without a page reload.
function onAudioStreamEnded() {
  teardown();
  showPrompt();
}

function onVisualiserPicked(VisualiserClass) {
  selectedVisualiser = VisualiserClass;
  session?.renderer.setVisualiser(VisualiserClass);
}

async function onShareClicked() {
  shareButton.disabled = true;
  statusEl.textContent = '';

  try {
    const stream = await requestSystemAudio();
    startVisualising(stream);
  } catch (error) {
    console.warn('[main] capture failed:', error);
    showPrompt(describeCaptureError(error));
  }
}

function describeCaptureError(error) {
  if (error instanceof UnsupportedBrowserError) return UNSUPPORTED_MESSAGE;
  if (error instanceof NoAudioTrackError) {
    return isLikelyChromium()
      ? 'No audio came through. Pick a window or screen and make sure “Share system audio” is ticked.'
      : UNSUPPORTED_MESSAGE;
  }
  if (error.name === 'NotAllowedError') {
    return 'Sharing was cancelled or blocked.';
  }
  if (error.name === 'NotSupportedError' || error.name === 'TypeError') {
    return UNSUPPORTED_MESSAGE;
  }
  return `Couldn’t start capture: ${error.message}`;
}

// Fades the toolbar out while visualising and the mouse is idle, so the
// visualiser gets the whole screen. Any mouse movement or focus brings it back.
function setUpToolbarAutoHide() {
  let idleTimer = null;
  const wake = () => {
    toolbarEl.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (session && !toolbarEl.contains(document.activeElement)) toolbarEl.classList.add('idle');
    }, TOOLBAR_IDLE_MS);
  };
  window.addEventListener('pointermove', wake);
  toolbarEl.addEventListener('focusin', wake);
  toolbarEl.addEventListener('focusout', wake);
  wake();
}

function init() {
  selectedVisualiser = setUpPicker(pickerEl, visualisers, onVisualiserPicked);
  setUpToolbarAutoHide();
  shareButton.addEventListener('click', onShareClicked);

  if (!isCaptureSupported()) {
    showPrompt(UNSUPPORTED_MESSAGE);
    shareButton.disabled = true;
    return;
  }

  // Flow 1: if we already hold live audio (same page load), skip the prompt.
  const activeStream = getActiveStream();
  if (activeStream) {
    startVisualising(activeStream);
    return;
  }

  showPrompt();
  if (!isLikelyChromium()) {
    statusEl.textContent =
      'Heads up: system audio capture only works in Chrome (141+) or Brave on macOS 14.2+.';
  }
}

init();
