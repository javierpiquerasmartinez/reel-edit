# 07: Hardware-Accelerated WebCodecs MP4 Export & Local Session Persistence

**What to build:** Enable creators to export their edited `9:16` Reel—complete with all **Clip** cuts, **Punch-in** transforms, and burned-in animated **Captions**—to a downloadable `.mp4` file (H.264 video + AAC audio) encoded via `WebCodecs` inside a background Web Worker at `1080x1920 @ 30fps`, `1080x1920 @ 60fps`, or `720x1280 @ 30fps` with live progress reporting. Persist the editing session automatically in `IndexedDB` and allow exporting/importing a portable `.reeledit.json` project file.

**Blocked by:** 05: Animated Caption Presets, Curated Fonts & Word Emphasis Styling

**Status:** ready-for-agent

- [ ] Clicking *"Export Reel"* opens an export modal offering `1080x1920 @ 30fps` (default), `1080x1920 @ 60fps`, and `720x1280 @ 30fps` presets.
- [ ] The exporter runs inside a Web Worker using `WebCodecs` (`VideoEncoder` H.264 + `AudioEncoder` AAC + TypeScript MP4 muxer) and renders each frame through the exact same `renderFrame` compositor used by the `9:16` preview canvas so burned-in **Captions**, fonts, animations, and **Punch-in** transforms match the live player pixel-for-pixel.
- [ ] The export modal displays real-time progress (percentage, rendered frames, elapsed time, and cancel button) and triggers a browser file download of the finished `.mp4` upon completion.
- [ ] Session state (**Timeline**, **Clips**, **Transcript**, **Caption Preset** configuration) auto-saves to browser `IndexedDB` on every **Edit Command** so refreshing the page restores the session (prompting to re-link the local **Source Media** file if needed).
- [ ] Creators can export the current session as a `.reeledit.json` file and import it back into the editor to restore all **Clips**, **Transcript** edits, and **Caption** styles, verified by round-trip serialization tests at the `EditorSession` seam.
