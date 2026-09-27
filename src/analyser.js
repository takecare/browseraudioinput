// Flow 3: AnalyserNode setup + per-frame reads.

export function setUpAnalyser(audioContext, source) {
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048; // must be a power of 2; higher = more frequency detail, more CPU
  analyser.smoothingTimeConstant = 0.8; // 0–1, higher = smoother but laggier visuals

  source.connect(analyser);
  // Deliberately NOT connecting analyser -> audioContext.destination:
  // we only want to read the signal, never play it back through this
  // context (the source app is already playing it through the real output).

  const frequencyData = new Uint8Array(analyser.frequencyBinCount); // fftSize / 2
  const waveformData = new Uint8Array(analyser.fftSize);

  return { analyser, frequencyData, waveformData, sampleRate: audioContext.sampleRate };
}

export function readFrame({ analyser, frequencyData, waveformData }) {
  analyser.getByteFrequencyData(frequencyData); // magnitude per frequency bin, 0–255
  analyser.getByteTimeDomainData(waveformData); // raw waveform, 0–255 (128 = silence)
  return { frequencyData, waveformData };
}
