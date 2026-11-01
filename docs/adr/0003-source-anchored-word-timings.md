# Source-anchored word timings with dynamic timeline projection

Word Timings in the Transcript are always stored in Source Time (`sourceStartMs`, `sourceEndMs` relative to the immutable Source Media) rather than Timeline Time, and active Captions are projected dynamically across the current Clips on the Timeline. This guarantees that splitting, trimming, reordering, or ripple-deleting Clips—whether performed before or after transcription—never desynchronizes speech from Captions and automatically hides or restores words when Clips are cut or undone.
