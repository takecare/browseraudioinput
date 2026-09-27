// Flow 1 + 2: permission check, getDisplayMedia, MediaStreamSource.

export class UnsupportedBrowserError extends Error {}
export class NoAudioTrackError extends Error {}

// The stream we're capturing from, if any. Kept at module level so a
// soft in-app re-initialisation within the same page load can reuse it
// instead of prompting again.
let currentStream = null;

export function isCaptureSupported() {
  return Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
}

// Safari and Firefox expose getDisplayMedia but can't capture system audio,
// so this is a hint for the UI rather than a hard block.
export function isLikelyChromium() {
  const brands = navigator.userAgentData?.brands ?? [];
  return brands.some(({ brand }) => brand === 'Chromium');
}

export function getActiveStream() {
  const hasLiveAudio = currentStream
    ?.getAudioTracks()
    .some(track => track.readyState === 'live');
  return hasLiveAudio ? currentStream : null;
}

// Must be called from a user gesture (e.g. a click), or the browser rejects it.
export async function requestSystemAudio() {
  if (!isCaptureSupported()) {
    throw new UnsupportedBrowserError('This browser can’t capture screen or system audio.');
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true, // required even though we only want audio — Chrome rejects audio-only display capture
    audio: true,
    systemAudio: 'include', // hints Chrome to offer system/window audio in the picker
  });

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    stream.getTracks().forEach(track => track.stop());
    throw new NoAudioTrackError(
      'No audio track — the “Share audio” box wasn’t ticked, or this browser doesn’t support system audio capture.',
    );
  }

  console.log('[capture] audio track settings:', audioTracks[0].getSettings());

  // We don't need the video track at all — stop it immediately so the
  // OS-level "you are sharing your screen" indicator disappears as fast as
  // possible and we're not holding an unused capture open.
  stream.getVideoTracks().forEach(track => track.stop());

  currentStream = stream;
  return stream;
}

// Wraps a stream in an AudioContext source. `onEnded` fires when the user
// stops sharing from the browser's own UI or the shared window closes.
export function createAudioSource(stream, onEnded) {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);

  const [audioTrack] = stream.getAudioTracks();
  audioTrack.addEventListener('ended', () => {
    if (currentStream === stream) currentStream = null;
    onEnded();
  }, { once: true });

  return { audioContext, source };
}

export function stopCapture() {
  currentStream?.getTracks().forEach(track => track.stop());
  currentStream = null;
}
