# 02: Clip Framing (Cover/Contain), Punch-in Zoom & Opening Hook Reordering

**What to build:** Enable creators to control the visual framing and sequence order of **Clips** on the **Timeline**: switching between `cover` (auto-crop to fill `9:16`) and `contain` (fit inside `9:16` with backdrop fill), applying **Punch-in** zooms (`scale > 1.0` and X/Y offsets) to individual **Clips** to smooth over jump cuts or emphasize key statements, reordering **Clips** along the **Timeline**, and duplicating a high-impact segment to `0ms` **Timeline Time** as an opening **Hook**.

**Blocked by:** 01: Monorepo Scaffold, Source Media Import, 9:16 Player & Split/Ripple-Delete Clip Editing

**Status:** ready-for-agent

- [ ] Creators can switch a **Clip** (or all **Clips**) between `cover` and `contain` framing modes via `setClipTransform`, and the `9:16` canvas compositor renders both horizontal (`16:9`) and vertical (`9:16`) **Source Media** with the selected framing.
- [ ] Creators can apply a **Punch-in** zoom (`scale`, `offsetX`, `offsetY`) to one or more selected **Clips** via `setClipTransform`, with immediate visual feedback in the `9:16` canvas player.
- [ ] Creators can reorder **Clips** on the **Timeline** via `reorderClip`, automatically recalculating every **Clip**'s **Timeline Time** interval without gaps.
- [ ] Creators can promote a segment to the beginning of the Reel as an opening **Hook** (`duplicateClipAsHook`), inserting the duplicated **Clip** at `0ms` **Timeline Time** and shifting existing **Clips** forward.
- [ ] All transform, reorder, and **Hook** operations are reversible via `Undo`/`Redo` and covered by tests at the `EditorSession` and frame-compositor descriptor seams.
