# Reel Edit MVP Specification

Status: ready-for-agent

## Problem Statement

Short-form vertical video creators (Reels, TikTok, YouTube Shorts) spend a disproportionate amount of time performing repetitive mechanical editing tasks on raw talking-head recordings: scrubbing through audio waveforms to cut out dead air and mistakes, splitting and rearranging segments to create an engaging opening, transcribing speech, grouping words into dynamic synchronized on-screen text, styling and animating those words with custom fonts and highlights, and applying subtle zoom shifts to mask jump cuts.

Existing web tools either lock creators into subscription cloud platforms that require uploading multi-hundred-megabyte recordings to remote servers before editing can even begin, or offer opaque "AI video generators" that produce black-box outputs the creator cannot fine-tune or undo step by step. Creators need a fast, zero-upload, session-based web editor where they can edit manually with precision AND plug in their own AI provider keys (BYOK) so an AI copilot can perform those exact same human editing operations deterministically and reversibly.

## Solution

**Reel Edit** is a client-first, non-destructive web video editor designed specifically for vertical Reels (`9:16`), architected as a modular monorepo with zero backend or database required in the MVP.

A creator imports a **Source Media** file directly in the browser and immediately previews it on a unified `9:16` WYSIWYG canvas player alongside a multi-track **Timeline** with audio waveform visualization and **Silence Region** highlighting. Every editing operation—whether triggered by the creator through the UI or by the AI copilot via tool calling—is executed through a shared, deterministic catalog of reversible **Edit Commands** (and **Batch Commands**).

This architecture ensures strict parity between manual and AI editing:
- **Non-destructive Timeline with Ripple Delete**: Cutting, trimming, removing **Silence Regions**, deleting spoken phrases from the **Transcript**, or duplicating a **Hook** at the start of the video operates on **Clips** referencing **Source Time** while automatically closing gaps in **Timeline Time**.
- **Source-Anchored Captions**: **Word Timings** in the **Transcript** stay anchored to **Source Time** and project dynamically onto active **Clips** in **Timeline Time**, so cutting video before or after transcription never desynchronizes speech from on-screen **Captions**.
- **Rich Animated Captions**: Creators and the AI can apply customizable **Caption Presets** (flat blocks, karaoke/Hormozi active-word highlight, word-by-word pop) with curated Reel fonts, custom colors, **Safe Area** guides, and per-word **Word Emphasis**.
- **Hybrid Transcription & BYOK AI Copilot**: Creators can bring their own API key (OpenAI, Anthropic, Google Gemini) stored locally in the browser to command an AI copilot in natural language or via 1-click actions, while transcription works via cloud Whisper (when an OpenAI key is present) or free in-browser local Whisper (WebGPU/Wasm).
- **Hardware-Accelerated Export & Local Session Safety**: The edited Reel is rendered frame-by-frame with burned-in **Captions** and encoded to `.mp4` directly in the browser using `WebCodecs` inside a Web Worker, while session state persists locally in browser storage and can be exported/imported as a portable project file.

## User Stories

1. As a content creator, I want to import a video file from my computer into the editor without waiting for a cloud upload, so that I can start editing large recordings immediately.
2. As a content creator, I want the imported video to be treated as immutable **Source Media** placed as an initial **Clip** on the **Timeline**, so that my original recording is never destructively altered.
3. As a content creator, I want to preview my video in a `9:16` vertical player with play, pause, scrubbing, and frame-accurate time display in **Timeline Time**, so that I can see exactly how my Reel will look and flow.
4. As a content creator, I want to toggle a social platform **Safe Area** overlay on the `9:16` player, so that I don't place **Captions** or key visual elements where Instagram Reels, TikTok, or YouTube Shorts UI buttons and descriptions will cover them.
5. As a content creator, I want to switch the framing of my **Clips** between `cover` (auto-crop to fill `9:16`) and `contain` (fit inside `9:16` with background fill), so that both vertical mobile videos and horizontal camera recordings look intentional in vertical format.
6. As a content creator, I want to see the audio waveform rendered along the **Clips** on the **Timeline**, so that I can visually identify speech peaks and pauses when making manual cuts.
7. As a content creator, I want to zoom in and out of the **Timeline** horizontally and drag the playhead smoothly, so that I can make both macro arrangements and millisecond-accurate cuts.
8. As a content creator, I want to split a **Clip** at the current playhead position using a UI button or keyboard shortcut (`S`), so that I can isolate sections of my recording.
9. As a content creator, I want to delete one or more selected **Clips** using a UI button or keyboard shortcut (`Delete`/`Backspace`) and have **Ripple Delete** automatically shift subsequent **Clips** earlier in **Timeline Time**, so that deleting mistakes never leaves black gaps in my Reel.
10. As a content creator, I want to trim the start or end handles of any **Clip** on the **Timeline** with automatic ripple adjustment, so that I can tighten the pacing of individual cuts.
11. As a content creator, I want to reorder **Clips** on the **Timeline** or duplicate a high-impact segment to `0ms` **Timeline Time** as an opening **Hook**, so that I can grab viewer attention in the first seconds of the Reel.
12. As a content creator, I want to apply a **Punch-in** zoom (`scale > 1.0`) and X/Y offset to specific **Clips**, so that I can mask jump cuts between adjacent **Clips** or visually emphasize important statements.
13. As a content creator, I want the editor to analyze the audio of my **Source Media** locally and visually shade detected **Silence Regions** on the waveform, so that I can see where dead air occurs without spending AI tokens.
14. As a content creator, I want to adjust silence detection parameters (loudness threshold in dB, minimum silence duration in ms, and natural speech padding in ms) and preview how many Cuts and seconds will be saved before applying, so that I can remove dead air without clipping the beginnings or ends of words.
15. As a content creator, I want to remove all detected **Silence Regions** across my **Timeline** in one action that splits and ripple-deletes the silent intervals while preserving speech padding, so that a raw recording becomes a fast-paced Reel in seconds.
16. As a content creator, I want to transcribe my video's speech into a **Transcript** with exact **Word Timings** in **Source Time** using either my OpenAI API key (`whisper-1`) or the built-in local browser Whisper model (WebGPU/Wasm), so that I can generate **Captions** and edit by text even without a paid speech-to-text API key.
17. As a content creator, I want the editor to automatically extract and downsample a lightweight mono `16kHz` audio stream in the browser prior to transcription, so that even a multi-hundred-megabyte `4K` **Source Media** file transcribes quickly and never exceeds cloud API file size limits.
18. As a content creator, I want to view the full **Transcript** in an interactive script panel where clicking any word jumps the playhead to that word's corresponding **Timeline Time**, so that I can navigate my video by reading rather than scrubbing.
19. As a content creator, I want to select a range of words or sentences in the **Transcript** panel and delete them to automatically cut and **Ripple Delete** the underlying video interval on the **Timeline**, so that I can remove false takes and filler sentences simply by editing text.
20. As a content creator, I want to edit the spelled text of any transcribed word in the **Transcript** without altering its **Word Timing**, so that I can fix typos, brand names, or slang in my **Captions**.
21. As a content creator, I want to toggle **Word Emphasis** on specific words in the **Transcript**, so that key punchwords render with accent color or scale emphasis inside their **Caption**.
22. As a content creator, I want **Word Timings** to remain anchored to **Source Time** and project dynamically into **Captions** across active **Clips**, so that cutting, trimming, or removing **Silence Regions** either before or after transcription never desynchronizes my **Captions** from the speaker's voice.
23. As a content creator, I want active words to be automatically grouped into short, readable **Captions** based on configurable maximum words per block (e.g., 1 to 6 words), natural pause thresholds, punctuation boundaries, and **Clip** boundaries, so that **Captions** always match the fast rhythm of a Reel.
24. As a content creator, I want to choose from built-in **Caption Presets**—including flat static blocks, karaoke/Hormozi active-word highlight (color/box change on the spoken word), and word-by-word pop animations—so that my Reel gets engaging subtitles in one click.
25. As a content creator, I want to customize my **Caption** styling by selecting from a curated catalog of preloaded Reel fonts, adjusting font size, primary text color, active word color, emphasis color, stroke/outline, shadow, background pill/box, uppercase toggle, and vertical `positionY`, so that the **Captions** match my personal brand.
26. As a content creator, I want the `9:16` player to render video frames and animated **Captions** through the exact same canvas composition logic used during final export, so that what I preview in real time is pixel-for-pixel identical to the downloaded MP4 (true WYSIWYG).
27. As a content creator, I want to enter my own API key (BYOK) for OpenAI, Anthropic, or Google Gemini and have it stored only in my browser's local/session storage without ever passing through a third-party backend server, so that my credentials remain private.
28. As a content creator, I want to instruct the AI copilot in natural language via a chat panel (e.g., *"Remove silences, cut the first false take where I repeat my intro, add a punch-in zoom on the second clip, and style captions in yellow Hormozi preset while emphasizing the most impactful words"*), so that complex multi-step edits can be automated conversationally.
29. As a content creator, I want quick 1-click AI action chips in the copilot panel for common workflows (such as cleaning up silences + styling captions, highlighting punchwords across the script, or extracting an opening **Hook**), so that I don't have to type prompts for standard Reel edits.
30. As a content creator, I want the AI copilot to execute its edits exclusively by invoking the exact same deterministic **Edit Commands** available to me in the UI, grouped into a single atomic **Batch Command** per AI turn, so that the AI never hallucinates invalid state or generates synthetic video.
31. As a content creator, I want to see a clear summary of which **Edit Commands** the AI copilot executed in each turn and be able to undo (`Cmd/Ctrl+Z`) or redo (`Cmd/Ctrl+Shift+Z`) the entire AI turn or any manual edit with a single click, so that I always stay in full control of the edit.
32. As a content creator, I want my current session state (**Timeline**, **Clips**, **Transcript**, **Caption Preset** settings, and undo history) to auto-save in browser storage (`IndexedDB`) and be exportable/importable as a lightweight `.reeledit.json` project file, so that I never lose my work if I refresh the tab or want to resume later with the same **Source Media** file.
33. As a content creator, I want to export my finished Reel to an `.mp4` file (H.264 video + AAC audio) with burned-in animated **Captions** using hardware-accelerated `WebCodecs` in a background Web Worker, choosing between `1080x1920 @ 30fps`, `1080x1920 @ 60fps`, or `720x1280 @ 30fps` with a live progress indicator, so that I can download a platform-ready Reel quickly without freezing my browser.

## Implementation Decisions

### 1. Monorepo Architecture & Boundaries (ADR-0001)
- The repository will be organized as a `pnpm` workspaces + `Turborepo` monorepo using strict TypeScript, separated into four distinct boundaries:
  - **`editor-core` package**: Pure, framework-agnostic domain model containing the `Timeline` state machine, **Source Time** ↔ **Timeline Time** projection math, dynamic **Caption** grouping engine, `Zod`-validated **Edit Command** schemas and reducers, **Batch Command** transaction handling, `Undo/Redo` stack, and `.reeledit.json` serialization.
  - **`media-engine` package**: Browser media processing primitives including `Web Audio API` waveform peak extraction, algorithmic **Silence Region** detection, `OfflineAudioContext` `16kHz` mono audio extraction for STT, hybrid transcription adapters (OpenAI `whisper-1` and in-browser Whisper WebGPU/Wasm Worker), the unified 2D `<canvas>` frame compositor (video frame + **Clip** transforms + animated **Captions** + **Safe Area** guide), and the `WebCodecs` + MP4 muxer Web Worker exporter behind an abstract `VideoExporter` interface.
  - **`ai-agent` package**: Multi-provider BYOK orchestration (OpenAI, Anthropic, Google Gemini) running directly from the browser (`dangerouslyAllowBrowser` / direct CORS headers), system prompt engineering specialized in short-form Reel editing, context serializer (providing the LLM with the current **Timeline** summary, **Clips**, **Silence Regions**, and **Transcript** with **Word Timings**), and tool-call dispatcher that maps the 9 **Edit Command** `Zod` schemas directly into LLM tools and wraps multi-tool responses into a single **Batch Command**.
  - **`web` application**: `React 19` + `Vite` + `Tailwind CSS` single-page workspace binding the 4-zone editor UI to `editor-core`, `media-engine`, and `ai-agent`, plus `IndexedDB` session persistence.

### 2. Non-Destructive Timeline & Source-Anchored Projection (ADR-0003)
- **Source Media** is immutable. A **Timeline** contains an ordered list of **Clips**, each defined by `{ id, sourceStartMs, sourceEndMs, transform: { scale, offsetX, offsetY, fitMode } }`.
- Every **Clip**'s position in **Timeline Time** (`[timelineStartMs, timelineEndMs]`) is derived deterministically from the cumulative durations of preceding **Clips** (enforcing **Ripple Delete** by construction so no blank gaps can exist).
- **Transcript** data consists of an ordered array of **Word Timings** `{ id, text, sourceStartMs, sourceEndMs, confidence?, emphasis: boolean }` anchored strictly in **Source Time**.
- Active **Captions** are computed via a pure projection from `(clips, transcriptWords, captionGroupingConfig)`:
  - For each **Clip** on the **Timeline**, the projection selects all **Word Timings** overlapping `[clip.sourceStartMs, clip.sourceEndMs]`, maps their timestamps into the **Clip**'s **Timeline Time** window, and partitions them into **Captions** wherever the word count reaches `maxWordsPerCaption`, the gap between consecutive words exceeds `pauseBreakMs`, a terminal punctuation mark is reached, or a **Clip** boundary ends.
  - Consequently, cutting, trimming, reordering, or ripple-deleting **Clips** at any point before or after transcription automatically hides cut words, preserves lip-sync across all remaining **Clips**, and restores cut words upon `Undo`.

### 3. Unified Deterministic Edit Command Catalog (ADR-0002)
- All mutations to the **Timeline**, **Transcript**, and **Caption** styling must go through the `EditorSession.dispatch(command)` bus. Both manual UI controls and the AI copilot use the exact same 9 atomic **Edit Commands** (plus `BatchCommand` for grouping):
  1. `splitClip({ timelineTimeMs })`: Splits the **Clip** spanning `timelineTimeMs` into two adjacent **Clips** at the corresponding **Source Time**.
  2. `deleteClips({ clipIds })`: Removes the specified **Clips** from the **Timeline** with automatic **Ripple Delete** (rejecting deletion if it would leave zero **Clips**).
  3. `trimClip({ clipId, sourceStartMs?, sourceEndMs? })`: Clamps a **Clip**'s **Source Time** bounds within `[0, sourceDurationMs]` and shifts downstream **Clips** in **Timeline Time**.
  4. `reorderClip({ clipId, targetIndex })` & `duplicateClipAsHook({ sourceStartMs, sourceEndMs })`: Moves an existing **Clip** to a new index or inserts a new **Hook** **Clip** at index `0` (`0ms` **Timeline Time**).
  5. `setClipTransform({ clipIds, scale?, offsetX?, offsetY?, fitMode? })`: Updates framing (`cover` / `contain`) or applies a **Punch-in** zoom and pan offset to one or more **Clips**.
  6. `removeSilences({ thresholdDb, minDurationMs, paddingMs })`: Computes **Silence Regions** from the audio amplitude envelope, subtracts `paddingMs` at speech boundaries so words are not clipped, and splits/removes silent intervals across active **Clips**.
  7. `deleteWordRange({ startWordId, endWordId })`: Looks up the `[sourceStartMs, sourceEndMs]` span from the first to the last specified **Word Timing** and carves that **Source Time** interval out of any overlapping **Clips** with **Ripple Delete**.
  8. `updateWords({ updates: Array<{ wordId, text?, emphasis? }> })`: Updates the displayed text or **Word Emphasis** flag of specific **Word Timings** without altering their timestamps.
  9. `updateCaptionStyle({ presetId?, styleOverrides?, grouping? })`: Applies a **Caption Preset** (`flat`, `hormozi-highlight`, `word-pop`, `neon-box`, `clean-minimal`) and/or overrides typography (`fontFamily`, `fontSize`, `uppercase`), colors (`primaryColor`, `activeWordColor`, `emphasisColor`, `strokeColor`, `strokeWidth`, `backgroundColor`), vertical position (`positionY`), animation mode, or grouping (`maxWordsPerCaption`, `pauseBreakMs`).
- Every command execution stores an immutable snapshot or inverse patch on the history stack so `undo()` and `redo()` restore exact state in $O(1)$ steps. When the AI copilot executes multiple tool calls in a single turn, they are dispatched as a single `BatchCommand` so one `undo()` reverts the entire AI turn.

### 4. WYSIWYG Canvas Compositor & Caption Animations
- Both the live `9:16` player and the background MP4 exporter invoke the same pure frame rendering routine `renderFrame(ctx, frameState, timelineTimeMs)`.
- For a given `timelineTimeMs`, the compositor:
  1. Resolves the active **Clip** and its corresponding `sourceTimeMs`.
  2. Draws the video frame onto the `9:16` canvas applying `fitMode` (`cover` crop or `contain` with darkened/blurred backdrop) and the **Clip**'s **Punch-in** transform (`scale`, `offsetX`, `offsetY`).
  3. Resolves the active **Caption** and the currently spoken **Word Timing** at `timelineTimeMs`, then renders the styled text using preloaded fonts (`Montserrat`, `Anton`, `Inter`, `Bebas Neue`, `Poppins`, `Bangers`) with word-level layout measurement:
     - **Static / Flat**: Renders the **Caption** block with uniform styling (plus **Word Emphasis** accent color on emphasized words).
     - **Karaoke / Hormozi Highlight**: Renders the **Caption** block and highlights the currently active word (via active color, scale boost, or rounded background pill) while styling words marked with **Word Emphasis**.
     - **Word-by-Word Pop**: Animates each word or short group with an eased spring/pop scale curve determined purely by elapsed milliseconds since `word.timelineStartMs` (ensuring deterministic rendering during non-real-time export).

### 5. Audio Processing, Hybrid Transcription & WebCodecs Export (ADR-0004, ADR-0005)
- **Waveform & Silence Detection**: Upon importing **Source Media**, the audio track is decoded into an `AudioBuffer` to compute a downsampled RMS/peak envelope for the **Timeline** waveform and instantaneous **Silence Region** previews whenever the creator drags the `thresholdDb`, `minDurationMs`, or `paddingMs` sliders.
- **Hybrid Transcription**: Before invoking STT, `OfflineAudioContext` renders a `16kHz` mono PCM WAV/audio payload. If the user selects OpenAI Whisper, this lightweight payload is sent to `whisper-1` with `timestamp_granularities: ["word"]`. If the user selects Local Browser Whisper (or has no OpenAI key), a Web Worker running `@huggingface/transformers` Whisper produces **Word Timings** locally.
- **WebCodecs Export**: Final export runs inside a dedicated Web Worker (or offscreen pipeline) using `WebCodecs` (`VideoEncoder` configured for H.264 `avc1` + `AudioEncoder` for AAC `mp4a` muxed via a TypeScript MP4 muxer) stepping deterministically through `0ms .. timelineDurationMs` at the chosen frame rate (`30fps` or `60fps`) and slicing/concatenating the corresponding audio ranges from the **Clips**.

## Testing Decisions

### Philosophy: Test External Behavior at the Highest Seam
- Tests must verify observable behavior and outputs given public inputs—never internal helper details, private data structures, or UI component implementation details.
- Because both the human UI and the AI copilot interact with the editor exclusively by dispatching **Edit Commands** and reading the projected **Timeline** state, the primary testing seam is the **`EditorSession` Command Bus + Timeline Projection API** in `editor-core`, supplemented by pure input/output tests at the `media-engine` silence-detection/frame-layout seam and the `ai-agent` tool-dispatch seam.

### Modules & Seams to Test
1. **`editor-core` (`EditorSession` Command Bus & Projection Seam)**:
   - Splitting, trimming, deleting, reordering **Clips**, and duplicating a **Hook** at `0ms`, verifying that **Ripple Delete** always keeps **Timeline Time** contiguous with zero gaps.
   - Anchoring **Word Timings** in **Source Time** and verifying that projecting **Captions** into **Timeline Time** stays accurately synchronized regardless of whether cuts, trims, or `removeSilences` occur before or after loading a **Transcript**.
   - Deleting video via text (`deleteWordRange`), updating word text and **Word Emphasis** (`updateWords`), and re-grouping/re-styling **Captions** (`updateCaptionStyle`).
   - Executing multi-step AI turns via `BatchCommand` and verifying that a single `undo()` reverts the entire batch and `redo()` re-applies it identically.
   - Round-trip serialization and deserialization of `.reeledit.json` project state.
2. **`media-engine` (Silence Detection & Frame Layout Descriptor Seam)**:
   - Given a synthetic PCM amplitude buffer with known silent and spoken intervals, verify that `detectSilenceRegions({ thresholdDb, minDurationMs, paddingMs })` returns the exact expected **Silence Regions** respecting minimum duration and speech padding.
   - Given a **Timeline** state and a `timelineTimeMs`, verify that the compositor layout descriptor computes the exact active **Clip** `sourceTimeMs`, transform matrix, active **Caption** lines, active word index, and animation progress factor `[0..1]`.
3. **`ai-agent` (AI Tool-Call to Batch Command Seam)**:
   - Given a mocked LLM response containing a sequence of tool calls (e.g., `removeSilences`, `deleteWordRange`, `updateWords`, `updateCaptionStyle`), verify that the agent orchestrator validates arguments against the `Zod` command schemas and applies them to `EditorSession` as a single reversible `BatchCommand`.

## Out of Scope

- **Backend server, cloud storage, or database persistence**: The MVP runs 100% in the browser within a single user session (persisted locally via `IndexedDB` and `.reeledit.json` export/import).
- **User accounts, authentication, or billing**: Users provide their own AI API keys (BYOK) stored locally in their browser.
- **AI generative video or synthetic voice**: The AI strictly invokes deterministic **Edit Commands** on the user's real **Source Media**; it does not generate synthetic video clips, AI avatars, or cloned voices.
- **Multi-track B-roll video overlays, background music tracks, or keyframe curve editors**: The MVP focuses on single-source vertical Reel editing (primary video/audio track + animated **Captions** track + **Punch-in** transforms).
- **Direct social media publishing**: The user downloads the final `.mp4` locally rather than publishing directly to Instagram/TikTok APIs.

## Further Notes

- Relevant ADRs governing this specification:
  - `docs/adr/0001-client-first-media-engine-in-monorepo.md`
  - `docs/adr/0002-deterministic-command-bus-for-human-and-ai-parity.md`
  - `docs/adr/0003-source-anchored-word-timings.md`
  - `docs/adr/0004-webcodecs-worker-export-and-client-audio-downsampling.md`
  - `docs/adr/0005-hybrid-cloud-and-browser-whisper-transcription.md`
- Canonical domain vocabulary is maintained in `GLOSSARY.md`.
