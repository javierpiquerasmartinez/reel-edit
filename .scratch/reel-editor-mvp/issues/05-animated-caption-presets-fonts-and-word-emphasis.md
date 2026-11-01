# 05: Animated Caption Presets, Curated Fonts & Word Emphasis Styling

**What to build:** Deliver the full WYSIWYG **Caption** styling and animation engine on the `9:16` canvas compositor along with the Captions inspector panel: preloaded Reel fonts, built-in **Caption Presets** (*Flat Static*, *Hormozi Active-Word Highlight*, *Word-by-Word Pop*, *Neon Box*, *Clean Minimal*), customizable typography/color/layout overrides (`updateCaptionStyle`), configurable word grouping (`maxWordsPerCaption`, `pauseBreakMs`), and per-word **Word Emphasis** highlighting (`updateWords`).

**Blocked by:** 04: Hybrid Speech Transcription, Source-Anchored Captions & Text-Based Video Editing

**Status:** ready-for-agent

- [ ] A curated catalog of Reel fonts (`Montserrat`, `Anton`, `Inter`, `Bebas Neue`, `Poppins`, `Bangers`) is preloaded via the browser Font loading API and selectable in the Captions panel.
- [ ] Creators can apply any built-in **Caption Preset** or customize individual style properties via `updateCaptionStyle`: font family, font size, uppercase toggle, primary color, active word color, emphasis color, stroke color/width, shadow, background box/pill, and vertical `positionY`.
- [ ] The `9:16` canvas compositor deterministically renders all three animation behaviors based on `timelineTimeMs`: static block (**Flat**), active-word color/pill/scale highlight as each word is spoken (**Hormozi Highlight**), and spring-scaled entry animation (**Word-by-Word Pop**).
- [ ] Adjusting `maxWordsPerCaption` (1–6 words) and `pauseBreakMs` dynamically re-groups active **Word Timings** into **Captions** while respecting punctuation and **Clip** boundaries.
- [ ] Toggling **Word Emphasis** (`emphasis: true`) on any word via `updateWords` renders that word with the active preset's emphasis styling inside its **Caption**.
- [ ] **Caption** blocks appear on the **Timeline** caption track and all style/grouping changes support `Undo`/`Redo`, verified by automated tests on `EditorSession` and the compositor layout descriptor.
