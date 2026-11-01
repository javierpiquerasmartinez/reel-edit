# 03: Audio Waveform Visualization & Algorithmic Silence Region Removal

**What to build:** Decode the audio track of imported **Source Media** in the browser to render a synchronized audio waveform inside **Clips** on the **Timeline**, algorithmically detect **Silence Regions** based on configurable loudness threshold (`thresholdDb`), minimum duration (`minDurationMs`), and natural speech padding (`paddingMs`), preview the shaded **Silence Regions** and total time saved in real time, and cut all silent intervals across the **Timeline** in one reversible `removeSilences` **Edit Command**.

**Blocked by:** 01: Monorepo Scaffold, Source Media Import, 9:16 Player & Split/Ripple-Delete Clip Editing

**Status:** resolved

- [x] Importing **Source Media** extracts an audio amplitude envelope via `Web Audio API` and renders the corresponding waveform inside each **Clip** on the **Timeline** as it is split, trimmed, or zoomed.
- [x] Adjusting the `thresholdDb`, `minDurationMs`, and `paddingMs` controls in the Silences panel recalculates **Silence Regions** locally without AI API calls, visually shading the silent intervals on the **Timeline** waveform and displaying the number of cuts and seconds to be saved.
- [x] Executing `removeSilences` splits active **Clips** around each detected **Silence Region** (preserving `paddingMs` at speech boundaries so words are not clipped) and applies **Ripple Delete** to remove the silent intervals.
- [x] Undoing `removeSilences` restores the **Timeline** to its exact prior **Clip** state in a single `Undo` step.
- [x] Pure silence detection math (amplitude buffer → **Silence Regions** with padding) and the `removeSilences` command are verified by automated tests.
