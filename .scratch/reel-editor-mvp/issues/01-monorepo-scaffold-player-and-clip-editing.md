# 01: Monorepo Scaffold, Source Media Import, 9:16 Player & Split/Ripple-Delete Clip Editing

**What to build:** Establish the foundational monorepo workspace (`editor-core`, `media-engine`, `ai-agent`, and `web`) and deliver the first end-to-end editing workflow: a creator can import a local **Source Media** video file into the browser, preview it in a `9:16` vertical WYSIWYG canvas player synchronized with **Timeline Time**, view the **Clip** track on the **Timeline**, toggle a social platform **Safe Area** overlay, split **Clips** at the playhead (`splitClip`), trim **Clip** boundaries (`trimClip`), delete **Clips** with automatic **Ripple Delete** (`deleteClips`), and step backward/forward through edits with `Undo` and `Redo`.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Monorepo builds, typechecks, and runs automated tests across the domain, media, agent, and web packages.
- [x] Importing a local video file registers it as immutable **Source Media** and initializes the **Timeline** with a single full-duration **Clip** spanning `[0ms, sourceDurationMs]` in **Source Time**.
- [x] The `9:16` vertical canvas player plays, pauses, and scrubs smoothly in **Timeline Time**, accurately transitioning across adjacent **Clips** without black flashes or gaps.
- [x] Toggling the **Safe Area** guide overlays non-intrusive boundaries showing where Instagram Reels, TikTok, and YouTube Shorts UI elements sit on a `9:16` frame.
- [x] Dispatching `splitClip` (via UI button or `S` shortcut) divides the active **Clip** at the current playhead into two contiguous **Clips** referencing the exact **Source Time** split point.
- [x] Dispatching `deleteClips` (via UI button or `Delete`/`Backspace` shortcut) removes the selected **Clips** and applies **Ripple Delete** so all subsequent **Clips** shift earlier in **Timeline Time** with zero blank gaps (and prevents deleting the last remaining **Clip**).
- [x] Dispatching `trimClip` (via **Timeline** trim handles) adjusts a **Clip**'s `sourceStartMs` or `sourceEndMs` within valid **Source Media** bounds and ripple-shifts downstream **Clips**.
- [x] Every edit operation goes through the deterministic `EditorSession` command bus and supports multi-step `Undo` (`Cmd/Ctrl+Z`) and `Redo` (`Cmd/Ctrl+Shift+Z`), verified by automated tests at the `EditorSession` seam.
