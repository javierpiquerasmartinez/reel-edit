# Reel Edit

A web-based non-destructive video editor for short-form vertical content (Reels), where both human creators and AI agents edit the video through the same set of deterministic editing operations.

## Language

### Media & Timeline

**Source Media**:
The original, immutable video and audio recording imported by the creator at the start of a session.
_Avoid_: Raw file, original clip, input video, asset

**Timeline**:
The ordered, non-destructive sequence of clips and captions that defines the edited output video.
_Avoid_: Sequence, track list, cut list, project video

**Clip**:
A contiguous time range (`[sourceStartMs, sourceEndMs]`) referencing a slice of the Source Media placed on the Timeline, along with visual framing properties such as scale and offset.
_Avoid_: Segment, fragment, cut, piece, slice

**Source Time**:
A timestamp measured relative to the beginning of the immutable Source Media (`0ms` to source duration).
_Avoid_: Original time, raw timestamp, file time

**Timeline Time**:
A timestamp measured relative to the beginning of the edited Timeline after all Clip trims and Ripple Deletes are applied.
_Avoid_: Output time, playback time, sequence time

**Punch-in**:
A deliberate zoom-in (`scale > 1.0`) applied to a Clip to add visual emphasis or smooth over a jump cut between adjacent Clips.
_Avoid_: Jump zoom, auto-crop zoom, digital zoom

**Hook**:
A high-impact Clip positioned or duplicated at the beginning (`0ms` Timeline Time) of the Timeline to capture viewer attention in the opening seconds of a Reel.
_Avoid_: Intro teaser, cold open, preview clip

**Safe Area**:
The inner region of the 9:16 vertical frame that remains unobstructed by social platform UI overlays (buttons, progress bars, and descriptions on Instagram Reels, TikTok, and YouTube Shorts).
_Avoid_: Margin zone, title safe, UI overlay mask

**Ripple Delete**:
The removal of a Clip (or time range) that automatically shifts all subsequent Clips and Captions earlier in time so no blank gap remains on the Timeline.
_Avoid_: Gap close, auto-shift, magnetic delete

**Silence Region**:
A contiguous time interval in the Source Media whose audio amplitude stays below a configured loudness threshold for at least a minimum duration.
_Avoid_: Dead air, mute zone, pause

### Captions & Transcription

**Transcript**:
The full text recognised from the Source Media's speech, paired with start and end timestamps for every individual word (*Word Timing*).
_Avoid_: Subtitles file, speech text, SRT

**Word Timing**:
A single transcribed word and its exact `[startMs, endMs]` interval relative to the Source Media.
_Avoid_: Token timestamp, word cue

**Word Emphasis**:
A semantic marker on a Word Timing indicating that the word should be rendered with the active Caption Preset's accent styling (such as highlight color or scale boost) inside its Caption.
_Avoid_: Highlight tag, bold word, keyword flag

**Caption**:
A time-synchronised group of one or more words displayed on screen over the video during playback and export.
_Avoid_: Subtitle, text overlay, closed caption, title

**Caption Preset**:
A reusable visual and animation configuration applied to Captions, defining typography, colors, positioning, and word-level animation behavior.
_Avoid_: Subtitle theme, text template, style sheet

### Editing & AI

**Edit Command**:
An atomic, reversible operation that transforms the Timeline (such as splitting a Clip, removing Silence Regions, or applying a Caption Preset), invoked identically by manual user actions and AI tool calls.
_Avoid_: Mutation, action, AI function, edit event

**Batch Command**:
A composite Edit Command that groups multiple related Edit Commands (such as a multi-step AI editing turn) into a single reversible unit in the Undo/Redo history.
_Avoid_: Transaction, macro, command group

