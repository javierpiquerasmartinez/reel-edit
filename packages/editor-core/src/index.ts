import { z } from "zod";

export interface SourceMedia {
  readonly id: string;
  readonly fileName: string;
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
}

export const ClipFitModeSchema = z.enum(["cover", "contain"]);
export type ClipFitMode = z.infer<typeof ClipFitModeSchema>;

export interface ClipTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly fitMode: ClipFitMode;
}

export const DEFAULT_CLIP_TRANSFORM: ClipTransform = Object.freeze({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  fitMode: "cover",
});

export interface Clip {
  readonly id: string;
  readonly sourceStartMs: number;
  readonly sourceEndMs: number;
  readonly timelineStartMs: number;
  readonly timelineEndMs: number;
  readonly durationMs: number;
  readonly transform: ClipTransform;
}

export interface WordTiming {
  readonly id: string;
  readonly text: string;
  readonly sourceStartMs: number;
  readonly sourceEndMs: number;
  readonly confidence?: number;
  readonly emphasis: boolean;
}

export interface WordTimingInput {
  readonly id?: string;
  readonly text: string;
  readonly sourceStartMs: number;
  readonly sourceEndMs: number;
  readonly confidence?: number;
  readonly emphasis?: boolean;
}

export interface Transcript {
  readonly words: readonly WordTiming[];
}

export interface CaptionWord {
  readonly wordId: string;
  readonly clipId: string;
  readonly text: string;
  readonly sourceStartMs: number;
  readonly sourceEndMs: number;
  readonly timelineStartMs: number;
  readonly timelineEndMs: number;
  readonly emphasis: boolean;
  readonly confidence?: number;
}

export interface Caption {
  readonly id: string;
  readonly clipId: string;
  readonly text: string;
  readonly sourceStartMs: number;
  readonly sourceEndMs: number;
  readonly timelineStartMs: number;
  readonly timelineEndMs: number;
  readonly words: readonly CaptionWord[];
}

export const CaptionGroupingConfigSchema = z.object({
  maxWordsPerCaption: z.number().int().min(1).max(6),
  pauseBreakMs: z.number().finite().min(0),
});

export type CaptionGroupingConfig = z.infer<typeof CaptionGroupingConfigSchema>;

export const DEFAULT_CAPTION_GROUPING: CaptionGroupingConfig = Object.freeze({
  maxWordsPerCaption: 4,
  pauseBreakMs: 400,
});

export const REEL_FONT_CATALOG = [
  "Montserrat",
  "Anton",
  "Inter",
  "Bebas Neue",
  "Poppins",
  "Bangers",
] as const;

export const ReelFontFamilySchema = z.enum(REEL_FONT_CATALOG);
export type ReelFontFamily = z.infer<typeof ReelFontFamilySchema>;

export const CaptionPresetIdSchema = z.enum([
  "flat",
  "hormozi-highlight",
  "word-pop",
  "neon-box",
  "clean-minimal",
]);
export type CaptionPresetId = z.infer<typeof CaptionPresetIdSchema>;

export const CaptionAnimationModeSchema = z.enum([
  "flat",
  "hormozi-highlight",
  "word-pop",
]);
export type CaptionAnimationMode = z.infer<typeof CaptionAnimationModeSchema>;

export const CaptionBackgroundModeSchema = z.enum(["none", "pill", "box"]);
export type CaptionBackgroundMode = z.infer<typeof CaptionBackgroundModeSchema>;

export interface CaptionStyle {
  readonly presetId: CaptionPresetId;
  readonly animationMode: CaptionAnimationMode;
  readonly fontFamily: ReelFontFamily;
  readonly fontSize: number;
  readonly uppercase: boolean;
  readonly primaryColor: string;
  readonly activeWordColor: string;
  readonly emphasisColor: string;
  readonly strokeColor: string;
  readonly strokeWidth: number;
  readonly shadow: boolean;
  readonly backgroundMode: CaptionBackgroundMode;
  readonly backgroundColor: string;
  readonly positionY: number;
}

export interface CaptionPresetDescriptor {
  readonly id: CaptionPresetId;
  readonly name: string;
  readonly description: string;
  readonly style: CaptionStyle;
}

export const CAPTION_PRESETS: Readonly<Record<CaptionPresetId, CaptionPresetDescriptor>> =
  Object.freeze({
    flat: {
      id: "flat",
      name: "Flat Static",
      description: "Static readable block with emphasis color support",
      style: Object.freeze({
        presetId: "flat",
        animationMode: "flat",
        fontFamily: "Inter",
        fontSize: 58,
        uppercase: false,
        primaryColor: "#ffffff",
        activeWordColor: "#ffffff",
        emphasisColor: "#38bdf8",
        strokeColor: "#09090b",
        strokeWidth: 4,
        shadow: true,
        backgroundMode: "pill",
        backgroundColor: "rgba(9, 9, 11, 0.82)",
        positionY: 0.72,
      }),
    },
    "hormozi-highlight": {
      id: "hormozi-highlight",
      name: "Hormozi Active-Word Highlight",
      description: "Bold uppercase with active spoken word highlight and pill",
      style: Object.freeze({
        presetId: "hormozi-highlight",
        animationMode: "hormozi-highlight",
        fontFamily: "Montserrat",
        fontSize: 68,
        uppercase: true,
        primaryColor: "#ffffff",
        activeWordColor: "#facc15",
        emphasisColor: "#22c55e",
        strokeColor: "#000000",
        strokeWidth: 8,
        shadow: true,
        backgroundMode: "pill",
        backgroundColor: "rgba(9, 9, 11, 0.78)",
        positionY: 0.72,
      }),
    },
    "word-pop": {
      id: "word-pop",
      name: "Word-by-Word Pop",
      description: "Spring-scaled entry pop animation as each word is spoken",
      style: Object.freeze({
        presetId: "word-pop",
        animationMode: "word-pop",
        fontFamily: "Anton",
        fontSize: 72,
        uppercase: true,
        primaryColor: "#ffffff",
        activeWordColor: "#38bdf8",
        emphasisColor: "#f43f5e",
        strokeColor: "#09090b",
        strokeWidth: 6,
        shadow: true,
        backgroundMode: "none",
        backgroundColor: "rgba(9, 9, 11, 0.0)",
        positionY: 0.7,
      }),
    },
    "neon-box": {
      id: "neon-box",
      name: "Neon Box",
      description: "High-contrast active word box with neon accent styling",
      style: Object.freeze({
        presetId: "neon-box",
        animationMode: "hormozi-highlight",
        fontFamily: "Bebas Neue",
        fontSize: 70,
        uppercase: true,
        primaryColor: "#f8fafc",
        activeWordColor: "#09090b",
        emphasisColor: "#e879f9",
        strokeColor: "#09090b",
        strokeWidth: 4,
        shadow: true,
        backgroundMode: "box",
        backgroundColor: "#a855f7",
        positionY: 0.74,
      }),
    },
    "clean-minimal": {
      id: "clean-minimal",
      name: "Clean Minimal",
      description: "Subtle modern lower-third pill for clean creator Reels",
      style: Object.freeze({
        presetId: "clean-minimal",
        animationMode: "flat",
        fontFamily: "Poppins",
        fontSize: 52,
        uppercase: false,
        primaryColor: "#f4f4f5",
        activeWordColor: "#ffffff",
        emphasisColor: "#fde047",
        strokeColor: "#18181b",
        strokeWidth: 2,
        shadow: false,
        backgroundMode: "pill",
        backgroundColor: "rgba(24, 24, 27, 0.65)",
        positionY: 0.78,
      }),
    },
  });

export const DEFAULT_CAPTION_STYLE: CaptionStyle = CAPTION_PRESETS.flat.style;

export const CaptionStyleOverridesSchema = z.object({
  animationMode: CaptionAnimationModeSchema.optional(),
  fontFamily: ReelFontFamilySchema.optional(),
  fontSize: z.number().finite().min(16).max(160).optional(),
  uppercase: z.boolean().optional(),
  primaryColor: z.string().min(1).optional(),
  activeWordColor: z.string().min(1).optional(),
  emphasisColor: z.string().min(1).optional(),
  strokeColor: z.string().min(1).optional(),
  strokeWidth: z.number().finite().min(0).max(32).optional(),
  shadow: z.boolean().optional(),
  backgroundMode: CaptionBackgroundModeSchema.optional(),
  backgroundColor: z.string().min(1).optional(),
  positionY: z.number().finite().min(0.05).max(0.95).optional(),
});

export type CaptionStyleOverrides = z.infer<typeof CaptionStyleOverridesSchema>;

export const CaptionGroupingPatchSchema = z.object({
  maxWordsPerCaption: z.number().int().min(1).max(6).optional(),
  pauseBreakMs: z.number().finite().min(0).optional(),
});

export type CaptionGroupingPatch = z.infer<typeof CaptionGroupingPatchSchema>;

export interface ProjectedTranscriptWord {
  readonly id: string;
  readonly text: string;
  readonly sourceStartMs: number;
  readonly sourceEndMs: number;
  readonly emphasis: boolean;
  readonly confidence?: number;
  readonly isActive: boolean;
  readonly clipId: string | null;
  readonly timelineStartMs: number | null;
  readonly timelineEndMs: number | null;
  readonly occurrences: readonly CaptionWord[];
}

export interface Timeline {
  readonly clips: readonly Clip[];
  readonly captions: readonly Caption[];
  readonly durationMs: number;
}

export interface AudioEnvelope {
  readonly bucketDurationMs: number;
  readonly durationMs: number;
  readonly peaks: readonly number[];
}

export const SilenceDetectionConfigSchema = z.object({
  thresholdDb: z.number().finite(),
  minDurationMs: z.number().finite().positive(),
  paddingMs: z.number().finite().min(0),
});

export type SilenceDetectionConfig = z.infer<
  typeof SilenceDetectionConfigSchema
>;

export const DEFAULT_SILENCE_CONFIG: SilenceDetectionConfig = Object.freeze({
  thresholdDb: -35,
  minDurationMs: 500,
  paddingMs: 120,
});

export interface SilenceRegion {
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}

export function cloneAudioEnvelope(envelope: AudioEnvelope): AudioEnvelope {
  return {
    bucketDurationMs: envelope.bucketDurationMs,
    durationMs: envelope.durationMs,
    peaks: [...envelope.peaks],
  };
}

export function getAudioEnvelopeBucketRange(
  envelope: AudioEnvelope,
  index: number,
): { readonly startMs: number; readonly endMs: number } {
  const startMs = Math.min(
    envelope.durationMs,
    index * envelope.bucketDurationMs,
  );
  const endMs = Math.min(
    envelope.durationMs,
    (index + 1) * envelope.bucketDurationMs,
  );
  return { startMs, endMs };
}

export function computeSilenceRegionsFromEnvelope(
  envelope: AudioEnvelope,
  config: SilenceDetectionConfig,
): SilenceRegion[] {
  if (
    envelope.bucketDurationMs <= 0 ||
    envelope.durationMs <= 0 ||
    envelope.peaks.length === 0
  ) {
    return [];
  }

  const thresholdLinear = Math.pow(10, config.thresholdDb / 20);
  const minDurationMs = Math.max(1, config.minDurationMs);
  const paddingMs = Math.max(0, config.paddingMs);

  const rawSilences: Array<{ startMs: number; endMs: number }> = [];
  let currentSilenceStartMs: number | null = null;

  for (let i = 0; i < envelope.peaks.length; i++) {
    const peak = Math.max(0, envelope.peaks[i]!);
    const { startMs: bucketStartMs, endMs: bucketEndMs } =
      getAudioEnvelopeBucketRange(envelope, i);
    if (bucketEndMs <= bucketStartMs) {
      continue;
    }

    const isSilent = peak < thresholdLinear;
    if (isSilent) {
      if (currentSilenceStartMs === null) {
        currentSilenceStartMs = bucketStartMs;
      }
    } else if (currentSilenceStartMs !== null) {
      rawSilences.push({
        startMs: currentSilenceStartMs,
        endMs: bucketStartMs,
      });
      currentSilenceStartMs = null;
    }
  }

  if (currentSilenceStartMs !== null) {
    rawSilences.push({
      startMs: currentSilenceStartMs,
      endMs: envelope.durationMs,
    });
  }

  const regions: SilenceRegion[] = [];
  for (const raw of rawSilences) {
    const rawDurationMs = raw.endMs - raw.startMs;
    if (rawDurationMs < minDurationMs) {
      continue;
    }

    const paddedStartMs =
      raw.startMs > 0 ? raw.startMs + paddingMs : raw.startMs;
    const paddedEndMs =
      raw.endMs < envelope.durationMs ? raw.endMs - paddingMs : raw.endMs;

    if (paddedEndMs > paddedStartMs) {
      regions.push({
        startMs: Math.round(paddedStartMs),
        endMs: Math.round(paddedEndMs),
        durationMs: Math.round(paddedEndMs - paddedStartMs),
      });
    }
  }

  return regions;
}

export interface EditorState {
  readonly sourceMedia: SourceMedia;
  readonly audioEnvelope?: AudioEnvelope | null;
  readonly transcript: Transcript;
  readonly projectedTranscriptWords: readonly ProjectedTranscriptWord[];
  readonly captionStyle: CaptionStyle;
  readonly captionGrouping: CaptionGroupingConfig;
  readonly timeline: Timeline;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export const SplitClipCommandSchema = z.object({
  type: z.literal("splitClip"),
  timelineTimeMs: z.number().finite(),
});

export const DeleteClipsCommandSchema = z.object({
  type: z.literal("deleteClips"),
  clipIds: z.array(z.string().min(1)).min(1),
});

export const TrimClipCommandSchema = z.object({
  type: z.literal("trimClip"),
  clipId: z.string().min(1),
  sourceStartMs: z.number().finite().optional(),
  sourceEndMs: z.number().finite().optional(),
});

export const SetClipTransformCommandSchema = z.object({
  type: z.literal("setClipTransform"),
  clipIds: z.array(z.string().min(1)).min(1),
  scale: z.number().finite().positive().optional(),
  offsetX: z.number().finite().optional(),
  offsetY: z.number().finite().optional(),
  fitMode: ClipFitModeSchema.optional(),
});

export const ReorderClipCommandSchema = z.object({
  type: z.literal("reorderClip"),
  clipId: z.string().min(1),
  targetIndex: z.number().int().min(0),
});

export const DuplicateClipAsHookCommandSchema = z.object({
  type: z.literal("duplicateClipAsHook"),
  sourceStartMs: z.number().finite(),
  sourceEndMs: z.number().finite(),
});

export const RemoveSilencesCommandSchema = SilenceDetectionConfigSchema.extend({
  type: z.literal("removeSilences"),
});

export const DeleteWordRangeCommandSchema = z.object({
  type: z.literal("deleteWordRange"),
  startWordId: z.string().min(1),
  endWordId: z.string().min(1),
});

export const WordUpdateSchema = z.object({
  wordId: z.string().min(1),
  text: z.string().optional(),
  emphasis: z.boolean().optional(),
});

export const UpdateWordsCommandSchema = z.object({
  type: z.literal("updateWords"),
  updates: z.array(WordUpdateSchema).min(1),
});

export const UpdateCaptionStyleCommandSchema = z.object({
  type: z.literal("updateCaptionStyle"),
  presetId: CaptionPresetIdSchema.optional(),
  styleOverrides: CaptionStyleOverridesSchema.optional(),
  grouping: CaptionGroupingPatchSchema.optional(),
});

export const EditCommandSchema = z.discriminatedUnion("type", [
  SplitClipCommandSchema,
  DeleteClipsCommandSchema,
  TrimClipCommandSchema,
  SetClipTransformCommandSchema,
  ReorderClipCommandSchema,
  DuplicateClipAsHookCommandSchema,
  RemoveSilencesCommandSchema,
  DeleteWordRangeCommandSchema,
  UpdateWordsCommandSchema,
  UpdateCaptionStyleCommandSchema,
]);

export type SplitClipCommand = z.infer<typeof SplitClipCommandSchema>;
export type DeleteClipsCommand = z.infer<typeof DeleteClipsCommandSchema>;
export type TrimClipCommand = z.infer<typeof TrimClipCommandSchema>;
export type SetClipTransformCommand = z.infer<typeof SetClipTransformCommandSchema>;
export type ReorderClipCommand = z.infer<typeof ReorderClipCommandSchema>;
export type DuplicateClipAsHookCommand = z.infer<
  typeof DuplicateClipAsHookCommandSchema
>;
export type RemoveSilencesCommand = z.infer<typeof RemoveSilencesCommandSchema>;
export type DeleteWordRangeCommand = z.infer<typeof DeleteWordRangeCommandSchema>;
export type WordUpdate = z.infer<typeof WordUpdateSchema>;
export type UpdateWordsCommand = z.infer<typeof UpdateWordsCommandSchema>;
export type UpdateCaptionStyleCommand = z.infer<
  typeof UpdateCaptionStyleCommandSchema
>;
export type EditCommand = z.infer<typeof EditCommandSchema>;

export interface DispatchResult {
  readonly applied: boolean;
  readonly reason?: string;
}

interface SourceClipRange {
  readonly id: string;
  readonly sourceStartMs: number;
  readonly sourceEndMs: number;
  readonly transform: ClipTransform;
}

interface HistorySnapshot {
  readonly clips: readonly SourceClipRange[];
  readonly transcriptWords: readonly WordTiming[];
  readonly captionStyle: CaptionStyle;
  readonly captionGrouping: CaptionGroupingConfig;
  readonly nextClipCounter: number;
}

function clampSourceRange(
  sourceStartMs: number,
  sourceEndMs: number,
  durationMs: number,
): { readonly startMs: number; readonly endMs: number } {
  return {
    startMs: Math.max(0, Math.min(durationMs, sourceStartMs)),
    endMs: Math.max(0, Math.min(durationMs, sourceEndMs)),
  };
}

export function normalizeWordTimings(
  input: readonly WordTimingInput[] | Transcript,
  sourceDurationMs?: number,
): WordTiming[] {
  const rawWords = "words" in input ? input.words : input;
  const maxDuration =
    typeof sourceDurationMs === "number" && sourceDurationMs > 0
      ? sourceDurationMs
      : Number.POSITIVE_INFINITY;

  const normalized: WordTiming[] = [];
  for (let i = 0; i < rawWords.length; i++) {
    const item = rawWords[i]!;
    const trimmedText = item.text.trim();
    if (!trimmedText) {
      continue;
    }
    const startMs = Math.max(
      0,
      Math.min(maxDuration, Math.round(item.sourceStartMs)),
    );
    const endMs = Math.max(
      startMs + 1,
      Math.min(maxDuration, Math.round(item.sourceEndMs)),
    );
    const word: WordTiming = {
      id: item.id && item.id.trim().length > 0 ? item.id.trim() : `word-${i + 1}`,
      text: trimmedText,
      sourceStartMs: startMs,
      sourceEndMs: endMs,
      emphasis: Boolean(item.emphasis),
      ...(typeof item.confidence === "number"
        ? { confidence: item.confidence }
        : {}),
    };
    normalized.push(word);
  }

  return normalized.sort((a, b) => a.sourceStartMs - b.sourceStartMs);
}

function cloneWordTimings(words: readonly WordTiming[]): WordTiming[] {
  return words.map((w) => ({ ...w }));
}

const TERMINAL_PUNCTUATION_REGEX = /[.!?]["')\]]*$/;

function projectWordOntoClip(
  word: WordTiming,
  clip: Clip,
): CaptionWord | null {
  if (
    word.sourceEndMs <= clip.sourceStartMs ||
    word.sourceStartMs >= clip.sourceEndMs
  ) {
    return null;
  }

  const clampedSourceStartMs = Math.max(
    clip.sourceStartMs,
    word.sourceStartMs,
  );
  const clampedSourceEndMs = Math.min(clip.sourceEndMs, word.sourceEndMs);
  if (clampedSourceEndMs <= clampedSourceStartMs) {
    return null;
  }

  return {
    wordId: word.id,
    clipId: clip.id,
    text: word.text,
    sourceStartMs: clampedSourceStartMs,
    sourceEndMs: clampedSourceEndMs,
    timelineStartMs:
      clip.timelineStartMs + (clampedSourceStartMs - clip.sourceStartMs),
    timelineEndMs:
      clip.timelineStartMs + (clampedSourceEndMs - clip.sourceStartMs),
    emphasis: word.emphasis,
    ...(typeof word.confidence === "number"
      ? { confidence: word.confidence }
      : {}),
  };
}

function carveSourceIntervalsFromClips(
  clips: readonly SourceClipRange[],
  intervalsToCut: ReadonlyArray<{
    readonly startMs: number;
    readonly endMs: number;
  }>,
  allocateClipId: () => string,
): { readonly changed: boolean; readonly nextClips: SourceClipRange[] } {
  let changed = false;
  const nextClips: SourceClipRange[] = [];

  for (const clip of clips) {
    let clipRanges: Array<{ startMs: number; endMs: number }> = [
      { startMs: clip.sourceStartMs, endMs: clip.sourceEndMs },
    ];

    for (const cut of intervalsToCut) {
      clipRanges = clipRanges.flatMap((range) => {
        if (cut.endMs <= range.startMs || cut.startMs >= range.endMs) {
          return [range];
        }
        const kept: Array<{ startMs: number; endMs: number }> = [];
        if (cut.startMs > range.startMs) {
          kept.push({ startMs: range.startMs, endMs: cut.startMs });
        }
        if (cut.endMs < range.endMs) {
          kept.push({ startMs: cut.endMs, endMs: range.endMs });
        }
        return kept;
      });
    }

    if (
      clipRanges.length !== 1 ||
      clipRanges[0]!.startMs !== clip.sourceStartMs ||
      clipRanges[0]!.endMs !== clip.sourceEndMs
    ) {
      changed = true;
    }

    clipRanges.forEach((range, rangeIndex) => {
      nextClips.push({
        id: rangeIndex === 0 ? clip.id : allocateClipId(),
        sourceStartMs: range.startMs,
        sourceEndMs: range.endMs,
        transform: { ...clip.transform },
      });
    });
  }

  return { changed, nextClips };
}

export function projectCaptions(
  clips: readonly Clip[],
  transcriptWords: readonly WordTiming[],
  grouping: CaptionGroupingConfig = DEFAULT_CAPTION_GROUPING,
): Caption[] {
  if (clips.length === 0 || transcriptWords.length === 0) {
    return [];
  }

  const maxWords = Math.max(1, Math.floor(grouping.maxWordsPerCaption));
  const pauseBreakMs = Math.max(0, grouping.pauseBreakMs);
  const captions: Caption[] = [];
  let captionCounter = 1;

  for (const clip of clips) {
    const overlappingWords: CaptionWord[] = [];
    for (const word of transcriptWords) {
      const projected = projectWordOntoClip(word, clip);
      if (projected) {
        overlappingWords.push(projected);
      }
    }

    if (overlappingWords.length === 0) {
      continue;
    }

    let currentGroup: CaptionWord[] = [];
    const flushGroup = () => {
      if (currentGroup.length === 0) {
        return;
      }
      const first = currentGroup[0]!;
      const last = currentGroup[currentGroup.length - 1]!;
      captions.push({
        id: `caption-${captionCounter++}`,
        clipId: clip.id,
        text: currentGroup.map((w) => w.text).join(" "),
        sourceStartMs: first.sourceStartMs,
        sourceEndMs: last.sourceEndMs,
        timelineStartMs: first.timelineStartMs,
        timelineEndMs: last.timelineEndMs,
        words: currentGroup,
      });
      currentGroup = [];
    };

    for (const word of overlappingWords) {
      if (currentGroup.length > 0) {
        const prev = currentGroup[currentGroup.length - 1]!;
        const gapMs = word.sourceStartMs - prev.sourceEndMs;
        const reachedMaxWords = currentGroup.length >= maxWords;
        const exceededPause = gapMs > pauseBreakMs;
        const prevEndedSentence = TERMINAL_PUNCTUATION_REGEX.test(prev.text);

        if (reachedMaxWords || exceededPause || prevEndedSentence) {
          flushGroup();
        }
      }
      currentGroup.push(word);
    }

    flushGroup();
  }

  return captions;
}

export function projectTranscriptWords(
  clips: readonly Clip[],
  transcriptWords: readonly WordTiming[],
): ProjectedTranscriptWord[] {
  return transcriptWords.map((word) => {
    const occurrences: CaptionWord[] = [];
    for (const clip of clips) {
      const projected = projectWordOntoClip(word, clip);
      if (projected) {
        occurrences.push(projected);
      }
    }

    // Prefer the canonical (last) occurrence when a segment was duplicated as an opening Hook at 0ms,
    // while retaining all occurrences so callers can inspect every timeline placement.
    const primary =
      occurrences.length > 0 ? occurrences[occurrences.length - 1]! : null;

    return {
      id: word.id,
      text: word.text,
      sourceStartMs: word.sourceStartMs,
      sourceEndMs: word.sourceEndMs,
      emphasis: word.emphasis,
      ...(typeof word.confidence === "number"
        ? { confidence: word.confidence }
        : {}),
      isActive: primary !== null,
      clipId: primary ? primary.clipId : null,
      timelineStartMs: primary ? primary.timelineStartMs : null,
      timelineEndMs: primary ? primary.timelineEndMs : null,
      occurrences,
    };
  });
}

function projectTimeline(
  sourceClips: readonly SourceClipRange[],
  transcriptWords: readonly WordTiming[] = [],
  grouping: CaptionGroupingConfig = DEFAULT_CAPTION_GROUPING,
): Timeline {
  let cursorMs = 0;
  const clips: Clip[] = sourceClips.map((sourceClip) => {
    const durationMs = sourceClip.sourceEndMs - sourceClip.sourceStartMs;
    const timelineStartMs = cursorMs;
    const timelineEndMs = cursorMs + durationMs;
    cursorMs = timelineEndMs;
    return {
      id: sourceClip.id,
      sourceStartMs: sourceClip.sourceStartMs,
      sourceEndMs: sourceClip.sourceEndMs,
      timelineStartMs,
      timelineEndMs,
      durationMs,
      transform: { ...sourceClip.transform },
    };
  });
  const captions = projectCaptions(clips, transcriptWords, grouping);
  return {
    clips,
    captions,
    durationMs: cursorMs,
  };
}

export interface EditorSessionOptions {
  readonly audioEnvelope?: AudioEnvelope;
  readonly transcript?: readonly WordTimingInput[] | Transcript;
}

export class EditorSession {
  private readonly sourceMedia: SourceMedia;
  private audioEnvelope: AudioEnvelope | null;
  private transcriptWords: readonly WordTiming[];
  private captionStyle: CaptionStyle = { ...DEFAULT_CAPTION_STYLE };
  private captionGrouping: CaptionGroupingConfig = {
    ...DEFAULT_CAPTION_GROUPING,
  };
  private clips: readonly SourceClipRange[];
  private nextClipCounter = 2;
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];
  private listeners = new Set<() => void>();

  private constructor(
    sourceMedia: SourceMedia,
    options: EditorSessionOptions = {},
  ) {
    if (sourceMedia.durationMs <= 0) {
      throw new Error("Source Media durationMs must be greater than 0");
    }
    this.sourceMedia = Object.freeze({ ...sourceMedia });
    this.audioEnvelope = options.audioEnvelope
      ? cloneAudioEnvelope(options.audioEnvelope)
      : null;
    this.transcriptWords = options.transcript
      ? normalizeWordTimings(options.transcript, sourceMedia.durationMs)
      : [];
    this.clips = [
      {
        id: "clip-1",
        sourceStartMs: 0,
        sourceEndMs: sourceMedia.durationMs,
        transform: { ...DEFAULT_CLIP_TRANSFORM },
      },
    ];
  }

  static fromSourceMedia(
    sourceMedia: SourceMedia,
    options: EditorSessionOptions = {},
  ): EditorSession {
    return new EditorSession(sourceMedia, options);
  }

  setAudioEnvelope(audioEnvelope: AudioEnvelope): void {
    this.audioEnvelope = cloneAudioEnvelope(audioEnvelope);
    this.notify();
  }

  setTranscript(transcript: readonly WordTimingInput[] | Transcript): void {
    const normalized = normalizeWordTimings(
      transcript,
      this.sourceMedia.durationMs,
    );
    this.transcriptWords = normalized;
    this.undoStack = this.undoStack.map((snap) =>
      snap.transcriptWords.length === 0
        ? { ...snap, transcriptWords: cloneWordTimings(normalized) }
        : snap,
    );
    this.redoStack = this.redoStack.map((snap) =>
      snap.transcriptWords.length === 0
        ? { ...snap, transcriptWords: cloneWordTimings(normalized) }
        : snap,
    );
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private createSnapshot(): HistorySnapshot {
    return {
      clips: this.clips.map((c) => ({
        ...c,
        transform: { ...c.transform },
      })),
      transcriptWords: cloneWordTimings(this.transcriptWords),
      captionStyle: { ...this.captionStyle },
      captionGrouping: { ...this.captionGrouping },
      nextClipCounter: this.nextClipCounter,
    };
  }

  private commitState(
    snapshotBefore: HistorySnapshot,
    updates: {
      readonly clips?: readonly SourceClipRange[];
      readonly transcriptWords?: readonly WordTiming[];
      readonly captionStyle?: CaptionStyle;
      readonly captionGrouping?: CaptionGroupingConfig;
    },
  ): DispatchResult {
    this.undoStack.push(snapshotBefore);
    this.redoStack = [];
    if (updates.clips) {
      this.clips = updates.clips;
    }
    if (updates.transcriptWords) {
      this.transcriptWords = updates.transcriptWords;
    }
    if (updates.captionStyle) {
      this.captionStyle = updates.captionStyle;
    }
    if (updates.captionGrouping) {
      this.captionGrouping = updates.captionGrouping;
    }
    this.notify();
    return { applied: true };
  }

  private commitClips(
    snapshotBefore: HistorySnapshot,
    nextClips: readonly SourceClipRange[],
  ): DispatchResult {
    return this.commitState(snapshotBefore, { clips: nextClips });
  }

  getState(): EditorState {
    const timeline = projectTimeline(
      this.clips,
      this.transcriptWords,
      this.captionGrouping,
    );
    const words = cloneWordTimings(this.transcriptWords);
    return {
      sourceMedia: this.sourceMedia,
      audioEnvelope: this.audioEnvelope,
      transcript: { words },
      projectedTranscriptWords: projectTranscriptWords(timeline.clips, words),
      captionStyle: { ...this.captionStyle },
      captionGrouping: { ...this.captionGrouping },
      timeline,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    };
  }

  dispatch(command: EditCommand): DispatchResult {
    const parsed = EditCommandSchema.parse(command);
    const snapshotBefore = this.createSnapshot();

    if (parsed.type === "splitClip") {
      const projected = projectTimeline(this.clips);
      const targetIndex = projected.clips.findIndex(
        (c) =>
          parsed.timelineTimeMs > c.timelineStartMs &&
          parsed.timelineTimeMs < c.timelineEndMs,
      );
      if (targetIndex === -1) {
        return {
          applied: false,
          reason: "Playhead is not strictly inside any Clip",
        };
      }

      const target = projected.clips[targetIndex]!;
      const offsetInClipMs = parsed.timelineTimeMs - target.timelineStartMs;
      const splitSourceMs = target.sourceStartMs + offsetInClipMs;

      const firstHalf: SourceClipRange = {
        id: target.id,
        sourceStartMs: target.sourceStartMs,
        sourceEndMs: splitSourceMs,
        transform: { ...target.transform },
      };
      const secondHalf: SourceClipRange = {
        id: `clip-${this.nextClipCounter++}`,
        sourceStartMs: splitSourceMs,
        sourceEndMs: target.sourceEndMs,
        transform: { ...target.transform },
      };

      const nextClips = [...this.clips];
      nextClips.splice(targetIndex, 1, firstHalf, secondHalf);
      return this.commitClips(snapshotBefore, nextClips);
    }

    if (parsed.type === "deleteClips") {
      const toDelete = new Set(parsed.clipIds);
      const remaining = this.clips.filter((c) => !toDelete.has(c.id));
      if (remaining.length === this.clips.length) {
        return {
          applied: false,
          reason: "No matching Clips found to delete",
        };
      }
      if (remaining.length === 0) {
        return {
          applied: false,
          reason: "Cannot delete the last remaining Clip on the Timeline",
        };
      }

      return this.commitClips(snapshotBefore, remaining);
    }

    if (parsed.type === "setClipTransform") {
      const targetIds = new Set(parsed.clipIds);
      let matchedCount = 0;
      let changedCount = 0;

      const nextClips = this.clips.map((clip) => {
        if (!targetIds.has(clip.id)) {
          return clip;
        }
        matchedCount++;
        const nextTransform: ClipTransform = {
          scale: parsed.scale ?? clip.transform.scale,
          offsetX: parsed.offsetX ?? clip.transform.offsetX,
          offsetY: parsed.offsetY ?? clip.transform.offsetY,
          fitMode: parsed.fitMode ?? clip.transform.fitMode,
        };
        if (
          nextTransform.scale !== clip.transform.scale ||
          nextTransform.offsetX !== clip.transform.offsetX ||
          nextTransform.offsetY !== clip.transform.offsetY ||
          nextTransform.fitMode !== clip.transform.fitMode
        ) {
          changedCount++;
        }
        return {
          ...clip,
          transform: nextTransform,
        };
      });

      if (matchedCount === 0) {
        return {
          applied: false,
          reason: "No matching Clips found to transform",
        };
      }
      if (changedCount === 0) {
        return {
          applied: false,
          reason: "Clip transform values unchanged",
        };
      }

      return this.commitClips(snapshotBefore, nextClips);
    }

    if (parsed.type === "reorderClip") {
      const fromIndex = this.clips.findIndex((c) => c.id === parsed.clipId);
      if (fromIndex === -1) {
        return {
          applied: false,
          reason: `Clip ${parsed.clipId} not found`,
        };
      }
      if (parsed.targetIndex < 0 || parsed.targetIndex >= this.clips.length) {
        return {
          applied: false,
          reason: "Target index is out of Timeline bounds",
        };
      }
      if (parsed.targetIndex === fromIndex) {
        return {
          applied: false,
          reason: "Clip is already at the target index",
        };
      }

      const nextClips = [...this.clips];
      const [moved] = nextClips.splice(fromIndex, 1);
      nextClips.splice(parsed.targetIndex, 0, moved!);
      return this.commitClips(snapshotBefore, nextClips);
    }

    if (parsed.type === "duplicateClipAsHook") {
      const { startMs: clampedStart, endMs: clampedEnd } = clampSourceRange(
        parsed.sourceStartMs,
        parsed.sourceEndMs,
        this.sourceMedia.durationMs,
      );

      if (clampedStart >= clampedEnd) {
        return {
          applied: false,
          reason: "Hook sourceStartMs must be strictly less than sourceEndMs",
        };
      }

      const donorClip =
        this.clips.find(
          (c) =>
            clampedStart >= c.sourceStartMs && clampedEnd <= c.sourceEndMs,
        ) ??
        this.clips.find(
          (c) =>
            clampedStart < c.sourceEndMs && clampedEnd > c.sourceStartMs,
        );

      const hookClip: SourceClipRange = {
        id: `clip-${this.nextClipCounter++}`,
        sourceStartMs: clampedStart,
        sourceEndMs: clampedEnd,
        transform: donorClip
          ? { ...donorClip.transform }
          : { ...DEFAULT_CLIP_TRANSFORM },
      };

      const nextClips = [hookClip, ...this.clips];
      return this.commitClips(snapshotBefore, nextClips);
    }

    if (parsed.type === "removeSilences") {
      if (!this.audioEnvelope) {
        return {
          applied: false,
          reason: "No audio amplitude envelope available for Source Media",
        };
      }

      const silenceRegions = computeSilenceRegionsFromEnvelope(
        this.audioEnvelope,
        parsed,
      );

      if (silenceRegions.length === 0) {
        return {
          applied: false,
          reason: "No Silence Regions detected with current settings",
        };
      }

      const { changed, nextClips } = carveSourceIntervalsFromClips(
        this.clips,
        silenceRegions,
        () => `clip-${this.nextClipCounter++}`,
      );

      if (!changed) {
        return {
          applied: false,
          reason: "No Silence Regions overlap active Clips",
        };
      }

      if (nextClips.length === 0) {
        return {
          applied: false,
          reason: "Cannot remove all Clips from the Timeline",
        };
      }

      return this.commitClips(snapshotBefore, nextClips);
    }

    if (parsed.type === "deleteWordRange") {
      if (this.transcriptWords.length === 0) {
        return {
          applied: false,
          reason: "No Transcript available to delete words from",
        };
      }

      const startIndex = this.transcriptWords.findIndex(
        (w) => w.id === parsed.startWordId,
      );
      const endIndex = this.transcriptWords.findIndex(
        (w) => w.id === parsed.endWordId,
      );
      if (startIndex === -1 || endIndex === -1) {
        return {
          applied: false,
          reason: "Specified Word Timing ID not found in Transcript",
        };
      }

      const fromIndex = Math.min(startIndex, endIndex);
      const toIndex = Math.max(startIndex, endIndex);
      const cutStartMs = this.transcriptWords[fromIndex]!.sourceStartMs;
      const cutEndMs = this.transcriptWords[toIndex]!.sourceEndMs;

      if (cutEndMs <= cutStartMs) {
        return {
          applied: false,
          reason: "Invalid Word Timing interval",
        };
      }

      const { changed, nextClips } = carveSourceIntervalsFromClips(
        this.clips,
        [{ startMs: cutStartMs, endMs: cutEndMs }],
        () => `clip-${this.nextClipCounter++}`,
      );

      if (!changed) {
        return {
          applied: false,
          reason: "Selected word range is already cut from the Timeline",
        };
      }

      if (nextClips.length === 0) {
        return {
          applied: false,
          reason: "Cannot delete all remaining video from the Timeline",
        };
      }

      return this.commitClips(snapshotBefore, nextClips);
    }

    if (parsed.type === "updateWords") {
      if (this.transcriptWords.length === 0) {
        return {
          applied: false,
          reason: "No Transcript available to update",
        };
      }

      const updatesById = new Map<string, WordUpdate>();
      for (const u of parsed.updates) {
        updatesById.set(u.wordId, u);
      }

      let matchedCount = 0;
      let changedCount = 0;

      const nextWords = this.transcriptWords.map((word) => {
        const update = updatesById.get(word.id);
        if (!update) {
          return word;
        }
        matchedCount++;

        const nextText =
          typeof update.text === "string" ? update.text.trim() : word.text;
        if (nextText.length === 0) {
          return word;
        }
        const nextEmphasis =
          typeof update.emphasis === "boolean"
            ? update.emphasis
            : word.emphasis;

        if (nextText !== word.text || nextEmphasis !== word.emphasis) {
          changedCount++;
        }

        return {
          ...word,
          text: nextText,
          emphasis: nextEmphasis,
        };
      });

      if (matchedCount === 0) {
        return {
          applied: false,
          reason: "No matching Word Timings found to update",
        };
      }

      if (changedCount === 0) {
        return {
          applied: false,
          reason: "Word Timing values unchanged",
        };
      }

      return this.commitState(snapshotBefore, { transcriptWords: nextWords });
    }

    if (parsed.type === "updateCaptionStyle") {
      const baseStyle: CaptionStyle = parsed.presetId
        ? { ...CAPTION_PRESETS[parsed.presetId].style }
        : { ...this.captionStyle };

      const overrides = parsed.styleOverrides;
      const nextStyle: CaptionStyle = {
        presetId: baseStyle.presetId,
        animationMode: overrides?.animationMode ?? baseStyle.animationMode,
        fontFamily: overrides?.fontFamily ?? baseStyle.fontFamily,
        fontSize: overrides?.fontSize ?? baseStyle.fontSize,
        uppercase: overrides?.uppercase ?? baseStyle.uppercase,
        primaryColor: overrides?.primaryColor ?? baseStyle.primaryColor,
        activeWordColor: overrides?.activeWordColor ?? baseStyle.activeWordColor,
        emphasisColor: overrides?.emphasisColor ?? baseStyle.emphasisColor,
        strokeColor: overrides?.strokeColor ?? baseStyle.strokeColor,
        strokeWidth: overrides?.strokeWidth ?? baseStyle.strokeWidth,
        shadow: overrides?.shadow ?? baseStyle.shadow,
        backgroundMode: overrides?.backgroundMode ?? baseStyle.backgroundMode,
        backgroundColor: overrides?.backgroundColor ?? baseStyle.backgroundColor,
        positionY: overrides?.positionY ?? baseStyle.positionY,
      };

      const nextGrouping: CaptionGroupingConfig = {
        maxWordsPerCaption:
          parsed.grouping?.maxWordsPerCaption ??
          this.captionGrouping.maxWordsPerCaption,
        pauseBreakMs:
          parsed.grouping?.pauseBreakMs ?? this.captionGrouping.pauseBreakMs,
      };

      const styleChanged =
        nextStyle.presetId !== this.captionStyle.presetId ||
        nextStyle.animationMode !== this.captionStyle.animationMode ||
        nextStyle.fontFamily !== this.captionStyle.fontFamily ||
        nextStyle.fontSize !== this.captionStyle.fontSize ||
        nextStyle.uppercase !== this.captionStyle.uppercase ||
        nextStyle.primaryColor !== this.captionStyle.primaryColor ||
        nextStyle.activeWordColor !== this.captionStyle.activeWordColor ||
        nextStyle.emphasisColor !== this.captionStyle.emphasisColor ||
        nextStyle.strokeColor !== this.captionStyle.strokeColor ||
        nextStyle.strokeWidth !== this.captionStyle.strokeWidth ||
        nextStyle.shadow !== this.captionStyle.shadow ||
        nextStyle.backgroundMode !== this.captionStyle.backgroundMode ||
        nextStyle.backgroundColor !== this.captionStyle.backgroundColor ||
        nextStyle.positionY !== this.captionStyle.positionY;

      const groupingChanged =
        nextGrouping.maxWordsPerCaption !==
          this.captionGrouping.maxWordsPerCaption ||
        nextGrouping.pauseBreakMs !== this.captionGrouping.pauseBreakMs;

      if (!styleChanged && !groupingChanged) {
        return {
          applied: false,
          reason: "Caption style and grouping values unchanged",
        };
      }

      return this.commitState(snapshotBefore, {
        captionStyle: nextStyle,
        captionGrouping: nextGrouping,
      });
    }

    const clipIndex = this.clips.findIndex((c) => c.id === parsed.clipId);
    if (clipIndex === -1) {
      return {
        applied: false,
        reason: `Clip ${parsed.clipId} not found`,
      };
    }

    const target = this.clips[clipIndex]!;
    const { startMs: clampedStart, endMs: clampedEnd } = clampSourceRange(
      parsed.sourceStartMs ?? target.sourceStartMs,
      parsed.sourceEndMs ?? target.sourceEndMs,
      this.sourceMedia.durationMs,
    );

    if (clampedStart >= clampedEnd) {
      return {
        applied: false,
        reason: "Trimmed sourceStartMs must be strictly less than sourceEndMs",
      };
    }

    if (
      clampedStart === target.sourceStartMs &&
      clampedEnd === target.sourceEndMs
    ) {
      return {
        applied: false,
        reason: "Trim values unchanged",
      };
    }

    const nextClips = [...this.clips];
    nextClips[clipIndex] = {
      id: target.id,
      sourceStartMs: clampedStart,
      sourceEndMs: clampedEnd,
      transform: { ...target.transform },
    };
    return this.commitClips(snapshotBefore, nextClips);
  }

  undo(): boolean {
    const previous = this.undoStack.pop();
    if (!previous) {
      return false;
    }
    this.redoStack.push(this.createSnapshot());
    this.clips = previous.clips;
    this.transcriptWords = previous.transcriptWords;
    this.captionStyle = { ...previous.captionStyle };
    this.captionGrouping = { ...previous.captionGrouping };
    this.nextClipCounter = previous.nextClipCounter;
    this.notify();
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) {
      return false;
    }
    this.undoStack.push(this.createSnapshot());
    this.clips = next.clips;
    this.transcriptWords = next.transcriptWords;
    this.captionStyle = { ...next.captionStyle };
    this.captionGrouping = { ...next.captionGrouping };
    this.nextClipCounter = next.nextClipCounter;
    this.notify();
    return true;
  }
}
