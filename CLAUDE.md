# Sound Visualiser

Static, build-free web app: captures system audio via `getDisplayMedia()`, runs an FFT with an `AnalyserNode`, and draws it on a canvas. See `README.md` for the layout and `visualisers/README.md` for the visualiser API.

## Workflow

- After committing and pushing work to your session branch, always merge it into `main` and push `main` too (`git push origin HEAD:main` when it fast-forwards; otherwise merge `origin/main` in first).
- Don't open pull requests.
- Pushes to `main` deploy to GitHub Pages (https://takecare.github.io/browseraudioinput/) via `.github/workflows/pages.yml`. When you add a new top-level folder the site needs, add it to the `cp` line in that workflow.

## Testing

There's no test suite. Serve with `python3 -m http.server` and drive it in Chromium via Playwright. Headless Chromium can't capture real system audio, so stub `navigator.mediaDevices.getDisplayMedia` with a `MediaStream` built from oscillators (via `createMediaStreamDestination()`) plus a canvas `captureStream()` video track.
