# Sound Visualiser

A single-page web app that captures your Mac's system audio (e.g. Spotify) through the browser's screen-share picker, runs it through an FFT, and draws a live spectrum. Everything runs in the browser: no backend and no build step.

## Running it

Serve the folder over `http://localhost`. Don't open `index.html` directly (`file://`), because the ES modules and `getDisplayMedia()` both need a real origin.

```sh
python3 -m http.server 8000
# or: npx serve .
```

Then open http://localhost:8000 in Chrome, click **Share your audio**, pick a window or screen, and tick **Share system audio** in the picker.

To stop, use the browser's own **Stop sharing** control. The app goes back to the **Share your audio** button.

## Requirements

- Chrome 141+ (Brave and Edge should work too, but haven't been tested yet)
- macOS 14.2+
- Safari and Firefox can't capture system audio, so the app shows a message instead.

## Layout

| File | Role |
| --- | --- |
| `index.html` | Canvas, the "Share your audio" prompt, and the script entry point |
| `style.css` | Minimal layout and styling |
| `src/capture.js` | Permission check, `getDisplayMedia()`, and the audio track lifecycle |
| `src/analyser.js` | `AnalyserNode` setup (FFT size 2048) and per-frame reads |
| `src/renderer.js` | Canvas 2D bar visualiser with log-spaced frequency bars |
| `src/main.js` | Connects the modules and owns app state (prompt, running, ended, and re-prompt) |
