# 04: Hybrid Speech Transcription, Source-Anchored Captions & Text-Based Video Editing

**What to build:** Enable speech-to-text transcription that extracts a lightweight `16kHz` mono audio track in the browser and produces a **Transcript** with word-level timestamps (**Word Timings** anchored in **Source Time**) using either OpenAI's `whisper-1` API (when an OpenAI key is provided) or a free in-browser local Whisper model (WebGPU/Wasm Web Worker). Project active **Word Timings** dynamically into on-screen **Captions** in **Timeline Time**, and provide an interactive **Transcript** panel where creators can click words to seek, edit word text (`updateWords`), and select/delete spoken phrases (`deleteWordRange`) to automatically cut and **Ripple Delete** the underlying video.

**Blocked by:** 01: Monorepo Scaffold, Source Media Import, 9:16 Player & Split/Ripple-Delete Clip Editing

**Status:** resolved

- [x] Prior to transcription, the media engine downsamples the **Source Media** audio track to `16kHz` mono in the browser so large video files produce compact audio payloads.
- [x] Creators can generate a **Transcript** with **Word Timings** in **Source Time** using either their OpenAI API key (`whisper-1`) or the built-in local browser Whisper worker without any API key.
- [x] Active **Captions** are projected dynamically from **Source Time** **Word Timings** across the current **Clips** on the **Timeline**, ensuring that splitting, trimming, or ripple-deleting **Clips** either before or after transcription never desynchronizes **Captions** from speech.
- [x] Clicking any word in the interactive **Transcript** panel seeks the `9:16` player playhead to that word's corresponding **Timeline Time**, and words belonging to cut **Source Time** intervals appear visually struck-through/inactive.
- [x] Selecting a range of words in the **Transcript** panel and deleting them dispatches `deleteWordRange({ startWordId, endWordId })`, cutting the corresponding **Source Time** span from overlapping **Clips** with **Ripple Delete**.
- [x] Editing the text of any word in the **Transcript** dispatches `updateWords` and immediately updates the rendered **Caption** on the `9:16` canvas without altering **Word Timings**.
- [x] Automated tests at the `EditorSession` seam verify **Source Time** → **Timeline Time** **Caption** projection across cuts made both before and after transcription, as well as `deleteWordRange` and `updateWords` with `Undo`/`Redo`.
