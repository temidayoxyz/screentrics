# Screentrics

Screentrics captures a screen, a window, or an area on your desktop, then lets you crop it, mark it up, and style it. Motion mode plays zooms and captions over the still and can export a short video.

Captures stay on this computer. The app does not upload them.

## Requirements

- Node.js 20 or newer
- Rust and Cargo
- WebView2 on Windows, or the system webview on macOS and Linux

## Run

```bash
npm install
npm run tauri dev
```

## Capture

- **Area** takes a region of the primary display. Drag, release to capture, Esc to cancel.
- **Window** lists open windows and captures the one you choose.
- **Screen** captures a display. Screentrics hides itself first so it is not in the shot.

## Edit

**Static** is the still editor. Crop the shot, then draw a rectangle, ellipse, line, arrow, text, or freehand mark. The inspector sets padding, wallpaper, border, shadow, zoom, position, and rotation. Export writes a PNG.

**Motion** plays that still on a timeline. Select a clip, split it at the playhead, or add text, an image, or a zoom. Export writes a WebM.

## Shortcuts

In the static editor:

| Key | Action |
| --- | --- |
| V | Select |
| R | Rectangle |
| O | Ellipse |
| L | Line |
| A | Arrow |
| T | Text |
| P | Pen |
| Delete | Remove the selected mark |
| Ctrl+Z | Undo a mark |

In motion, Space plays and pauses.

## Build

```bash
npm run tauri build
```

## Stack

The shell is Tauri 2. Capture is Rust, using [xcap](https://github.com/nashaofu/xcap). The editor is React.

## License

[MIT](LICENSE)
