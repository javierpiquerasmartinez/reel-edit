import {
  DEFAULT_CAPTION_STYLE,
  DEFAULT_CLIP_TRANSFORM,
  REEL_FONT_CATALOG,
  computeSilenceRegionsFromEnvelope,
  getAudioEnvelopeBucketRange,
  type AudioEnvelope,
  type Caption,
  type CaptionAnimationMode,
  type CaptionStyle,
  type CaptionWord,
  type Clip,
  type ClipTransform,
  type EditorState,
  type ReelFontFamily,
  type SilenceDetectionConfig,
  type SilenceRegion,
  type Timeline,
} from "@reel-edit/editor-core";

export * from "./transcription.js";

export interface ReelFontDescriptor {
  readonly family: ReelFontFamily;
  readonly weight: string;
  readonly category: "sans-serif" | "display";
  readonly cssStack: string;
}

export const CURATED_REEL_FONTS: readonly ReelFontDescriptor[] = Object.freeze([
  {
    family: "Montserrat",
    weight: "800",
    category: "sans-serif",
    cssStack: '"Montserrat", Inter, system-ui, sans-serif',
  },
  {
    family: "Anton",
    weight: "400",
    category: "display",
    cssStack: '"Anton", Impact, system-ui, sans-serif',
  },
  {
    family: "Inter",
    weight: "800",
    category: "sans-serif",
    cssStack: '"Inter", system-ui, sans-serif',
  },
  {
    family: "Bebas Neue",
    weight: "400",
    category: "display",
    cssStack: '"Bebas Neue", Impact, system-ui, sans-serif',
  },
  {
    family: "Poppins",
    weight: "800",
    category: "sans-serif",
    cssStack: '"Poppins", Inter, system-ui, sans-serif',
  },
  {
    family: "Bangers",
    weight: "400",
    category: "display",
    cssStack: '"Bangers", Impact, cursive, sans-serif',
  },
]);

export interface FontFaceSetLike {
  load(font: string, text?: string): Promise<unknown>;
}

export interface PreloadReelFontsOptions {
  readonly fontFaceSet?: FontFaceSetLike | null;
}

export interface PreloadReelFontsResult {
  readonly loadedFamilies: readonly ReelFontFamily[];
  readonly status: "loaded" | "fallback";
}

export async function preloadReelFonts(
  options: PreloadReelFontsOptions = {},
): Promise<PreloadReelFontsResult> {
  const defaultFontFaceSet =
    typeof document !== "undefined" &&
    document.fonts &&
    typeof document.fonts.load === "function"
      ? (document.fonts as unknown as FontFaceSetLike)
      : null;
  const fontFaceSet =
    options.fontFaceSet !== undefined ? options.fontFaceSet : defaultFontFaceSet;

  if (!fontFaceSet || typeof fontFaceSet.load !== "function") {
    return {
      loadedFamilies: [...REEL_FONT_CATALOG],
      status: "fallback",
    };
  }

  let allSucceeded = true;
  for (const descriptor of CURATED_REEL_FONTS) {
    try {
      await fontFaceSet.load(
        `${descriptor.weight} 48px "${descriptor.family}"`,
        "Reel Edit",
      );
    } catch {
      allSucceeded = false;
    }
  }

  return {
    loadedFamilies: [...REEL_FONT_CATALOG],
    status: allSucceeded ? "loaded" : "fallback",
  };
}

export interface PcmAudioInput {
  readonly samples: Float32Array | readonly number[];
  readonly sampleRateHz: number;
  readonly bucketDurationMs?: number;
}

export interface DecodedAudioBufferLike {
  readonly duration: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export interface DecodeAudioEnvelopeOptions {
  readonly bucketDurationMs?: number;
  readonly audioContextFactory?: () => {
    decodeAudioData(data: ArrayBuffer): Promise<DecodedAudioBufferLike>;
    close?: () => Promise<void> | void;
  };
}

export interface ClipSilenceInterval {
  readonly sourceStartMs: number;
  readonly sourceEndMs: number;
  readonly offsetStartMs: number;
  readonly offsetEndMs: number;
  readonly startRatio: number;
  readonly endRatio: number;
  readonly durationMs: number;
}

export interface SilencePreviewSummary {
  readonly silenceRegions: readonly SilenceRegion[];
  readonly clipSilences: Readonly<Record<string, readonly ClipSilenceInterval[]>>;
  readonly cutCount: number;
  readonly savedDurationMs: number;
}

export interface WaveformBarDescriptor {
  readonly index: number;
  readonly sourceStartMs: number;
  readonly sourceEndMs: number;
  readonly durationMs: number;
  readonly peak: number;
  readonly isSilent: boolean;
}

export function extractAudioEnvelopeFromSamples(
  samples: Float32Array | readonly number[],
  sampleRateHz: number,
  bucketDurationMs = 50,
): AudioEnvelope {
  const safeSampleRate = Math.max(1, sampleRateHz);
  const safeBucketMs = Math.max(1, bucketDurationMs);
  const durationMs = Math.max(
    0,
    Math.round((samples.length / safeSampleRate) * 1000),
  );
  if (samples.length === 0 || durationMs === 0) {
    return {
      bucketDurationMs: safeBucketMs,
      durationMs: 0,
      peaks: [],
    };
  }

  const samplesPerBucket = Math.max(
    1,
    Math.round((safeSampleRate * safeBucketMs) / 1000),
  );
  const bucketCount = Math.max(1, Math.ceil(samples.length / samplesPerBucket));
  const peaks: number[] = [];

  for (let b = 0; b < bucketCount; b++) {
    const startIdx = b * samplesPerBucket;
    const endIdx = Math.min(samples.length, startIdx + samplesPerBucket);
    let maxPeak = 0;
    for (let i = startIdx; i < endIdx; i++) {
      const absVal = Math.abs(samples[i]!);
      if (absVal > maxPeak) {
        maxPeak = absVal;
      }
    }
    peaks.push(Math.min(1, maxPeak));
  }

  return {
    bucketDurationMs: safeBucketMs,
    durationMs,
    peaks,
  };
}

export function extractAudioEnvelopeFromAudioBuffer(
  audioBuffer: DecodedAudioBufferLike,
  bucketDurationMs = 50,
): AudioEnvelope {
  const channelCount = Math.max(0, audioBuffer.numberOfChannels);
  if (channelCount === 0) {
    return {
      bucketDurationMs,
      durationMs: Math.max(0, Math.round(audioBuffer.duration * 1000)),
      peaks: [],
    };
  }

  const primary = audioBuffer.getChannelData(0);
  if (channelCount === 1) {
    return extractAudioEnvelopeFromSamples(
      primary,
      audioBuffer.sampleRate,
      bucketDurationMs,
    );
  }

  const combined = new Float32Array(primary.length);
  for (let ch = 0; ch < channelCount; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    const len = Math.min(combined.length, channelData.length);
    for (let i = 0; i < len; i++) {
      const absVal = Math.abs(channelData[i]!);
      if (absVal > combined[i]!) {
        combined[i] = absVal;
      }
    }
  }

  return extractAudioEnvelopeFromSamples(
    combined,
    audioBuffer.sampleRate,
    bucketDurationMs,
  );
}

function getDefaultBrowserAudioContextFactory():
  | DecodeAudioEnvelopeOptions["audioContextFactory"]
  | null {
  if (typeof globalThis === "undefined") {
    return null;
  }
  const win = globalThis as unknown as {
    AudioContext?: new () => {
      decodeAudioData(data: ArrayBuffer): Promise<DecodedAudioBufferLike>;
      close?: () => Promise<void> | void;
    };
    webkitAudioContext?: new () => {
      decodeAudioData(data: ArrayBuffer): Promise<DecodedAudioBufferLike>;
      close?: () => Promise<void> | void;
    };
  };
  const Ctor = win.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  return () => new Ctor();
}

export async function decodeSourceMediaAudioEnvelope(
  source: Blob | ArrayBuffer,
  options: DecodeAudioEnvelopeOptions = {},
): Promise<AudioEnvelope> {
  const bucketDurationMs = options.bucketDurationMs ?? 100;
  const factory =
    options.audioContextFactory ?? getDefaultBrowserAudioContextFactory();

  if (!factory) {
    return {
      bucketDurationMs,
      durationMs: 0,
      peaks: [],
    };
  }

  let ctx: ReturnType<NonNullable<typeof factory>> | null = null;
  try {
    const arrayBuffer =
      source instanceof ArrayBuffer
        ? source
        : typeof source.arrayBuffer === "function"
          ? await source.arrayBuffer()
          : await new Promise<ArrayBuffer>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve(
                  reader.result instanceof ArrayBuffer
                    ? reader.result
                    : new ArrayBuffer(0),
                );
              reader.onerror = () =>
                reject(reader.error ?? new Error("Failed to read Blob"));
              reader.readAsArrayBuffer(source);
            });
    ctx = factory();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return extractAudioEnvelopeFromAudioBuffer(audioBuffer, bucketDurationMs);
  } catch {
    return {
      bucketDurationMs,
      durationMs: 0,
      peaks: [],
    };
  } finally {
    try {
      await ctx?.close?.();
    } catch {
      // Ignore AudioContext close errors
    }
  }
}

export function detectSilenceRegions(
  input: AudioEnvelope | PcmAudioInput,
  config: SilenceDetectionConfig,
): SilenceRegion[] {
  const envelope: AudioEnvelope =
    "peaks" in input
      ? input
      : extractAudioEnvelopeFromSamples(
          input.samples,
          input.sampleRateHz,
          input.bucketDurationMs ?? 50,
        );
  return computeSilenceRegionsFromEnvelope(envelope, config);
}

export function projectSilencePreview(
  timeline: Timeline,
  envelope: AudioEnvelope | null | undefined,
  config: SilenceDetectionConfig,
): SilencePreviewSummary {
  if (!envelope) {
    return {
      silenceRegions: [],
      clipSilences: {},
      cutCount: 0,
      savedDurationMs: 0,
    };
  }

  const silenceRegions = computeSilenceRegionsFromEnvelope(envelope, config);
  const clipSilences: Record<string, ClipSilenceInterval[]> = {};
  let cutCount = 0;
  let savedDurationMs = 0;

  for (const clip of timeline.clips) {
    const intervals: ClipSilenceInterval[] = [];
    const safeClipDuration = Math.max(1, clip.durationMs);

    for (const region of silenceRegions) {
      const overlapStartMs = Math.max(clip.sourceStartMs, region.startMs);
      const overlapEndMs = Math.min(clip.sourceEndMs, region.endMs);
      if (overlapEndMs > overlapStartMs) {
        const offsetStartMs = overlapStartMs - clip.sourceStartMs;
        const offsetEndMs = overlapEndMs - clip.sourceStartMs;
        const durationMs = overlapEndMs - overlapStartMs;
        intervals.push({
          sourceStartMs: overlapStartMs,
          sourceEndMs: overlapEndMs,
          offsetStartMs,
          offsetEndMs,
          startRatio: offsetStartMs / safeClipDuration,
          endRatio: offsetEndMs / safeClipDuration,
          durationMs,
        });
        cutCount++;
        savedDurationMs += durationMs;
      }
    }

    clipSilences[clip.id] = intervals;
  }

  return {
    silenceRegions,
    clipSilences,
    cutCount,
    savedDurationMs,
  };
}

export function sliceClipWaveform(
  envelope: AudioEnvelope,
  clip: Pick<Clip, "sourceStartMs" | "sourceEndMs" | "durationMs">,
  silenceRegions: readonly SilenceRegion[] = [],
  maxBars?: number,
): WaveformBarDescriptor[] {
  if (envelope.bucketDurationMs <= 0 || envelope.peaks.length === 0) {
    return [];
  }

  const bars: WaveformBarDescriptor[] = [];
  for (let i = 0; i < envelope.peaks.length; i++) {
    const { startMs: bucketStartMs, endMs: bucketEndMs } =
      getAudioEnvelopeBucketRange(envelope, i);
    if (bucketEndMs <= clip.sourceStartMs || bucketStartMs >= clip.sourceEndMs) {
      continue;
    }

    const clampedStartMs = Math.max(clip.sourceStartMs, bucketStartMs);
    const clampedEndMs = Math.min(clip.sourceEndMs, bucketEndMs);
    const durationMs = clampedEndMs - clampedStartMs;
    if (durationMs <= 0) {
      continue;
    }
    const midpointMs = (clampedStartMs + clampedEndMs) / 2;
    const isSilent = silenceRegions.some(
      (region) => midpointMs >= region.startMs && midpointMs <= region.endMs,
    );

    bars.push({
      index: i,
      sourceStartMs: clampedStartMs,
      sourceEndMs: clampedEndMs,
      durationMs,
      peak: envelope.peaks[i]!,
      isSilent,
    });
  }

  if (!maxBars || maxBars <= 0 || bars.length <= maxBars) {
    return bars;
  }

  const downsampled: WaveformBarDescriptor[] = [];
  for (let b = 0; b < maxBars; b++) {
    const startIdx = Math.floor((b * bars.length) / maxBars);
    const endIdx = Math.max(
      startIdx + 1,
      Math.floor(((b + 1) * bars.length) / maxBars),
    );
    const group = bars.slice(startIdx, endIdx);
    const first = group[0];
    const last = group[group.length - 1];
    if (!first || !last) {
      continue;
    }
    let maxPeak = 0;
    let silentDurationMs = 0;
    let totalDurationMs = 0;
    for (const item of group) {
      if (item.peak > maxPeak) {
        maxPeak = item.peak;
      }
      totalDurationMs += item.durationMs;
      if (item.isSilent) {
        silentDurationMs += item.durationMs;
      }
    }
    downsampled.push({
      index: first.index,
      sourceStartMs: first.sourceStartMs,
      sourceEndMs: last.sourceEndMs,
      durationMs: totalDurationMs,
      peak: maxPeak,
      isSilent: silentDurationMs > totalDurationMs / 2,
    });
  }

  return downsampled;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SafeAreaZone {
  readonly id: "top-header" | "right-actions" | "bottom-details";
  readonly label: string;
  readonly rect: Rect;
}

export interface SafeAreaOverlay {
  readonly safeRect: Rect;
  readonly zones: readonly SafeAreaZone[];
}

export interface FrameLayoutOptions {
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly showSafeArea?: boolean;
}

export interface CaptionWordLayoutDescriptor {
  readonly word: CaptionWord;
  readonly wordId: string;
  readonly text: string;
  readonly displayText: string;
  readonly isActive: boolean;
  readonly isSpoken: boolean;
  readonly emphasis: boolean;
  readonly animationProgress: number;
  readonly scale: number;
  readonly fillColor: string;
  readonly highlightPill: boolean;
  readonly highlightPillColor: string | null;
}

export interface ActiveCaptionDescriptor {
  readonly caption: Caption;
  readonly text: string;
  readonly displayText: string;
  readonly style: CaptionStyle;
  readonly animationMode: CaptionAnimationMode;
  readonly animationProgress: number;
  readonly activeWordIndex: number;
  readonly activeWord: CaptionWord | null;
  readonly words: readonly CaptionWord[];
  readonly wordLayouts: readonly CaptionWordLayoutDescriptor[];
  readonly centerX: number;
  readonly baselineY: number;
}

export interface FrameLayoutDescriptor {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly timelineTimeMs: number;
  readonly activeClip: Clip;
  readonly sourceTimeMs: number;
  readonly transform: ClipTransform;
  readonly drawRect: Rect;
  readonly backdropRect: Rect | null;
  readonly safeArea: SafeAreaOverlay | null;
  readonly activeCaption: ActiveCaptionDescriptor | null;
}

function computeTransformedDrawRect(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  transform: ClipTransform,
): Rect {
  const safeSrcW = sourceWidth > 0 ? sourceWidth : canvasWidth;
  const safeSrcH = sourceHeight > 0 ? sourceHeight : canvasHeight;
  const baseScale =
    transform.fitMode === "contain"
      ? Math.min(canvasWidth / safeSrcW, canvasHeight / safeSrcH)
      : Math.max(canvasWidth / safeSrcW, canvasHeight / safeSrcH);
  const effectiveScale = baseScale * transform.scale;
  const width = Math.round(safeSrcW * effectiveScale);
  const height = Math.round(safeSrcH * effectiveScale);
  const x = Math.round((canvasWidth - width) / 2 + transform.offsetX);
  const y = Math.round((canvasHeight - height) / 2 + transform.offsetY);
  return { x, y, width, height };
}

function computeCoverDrawRect(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): Rect {
  return computeTransformedDrawRect(
    sourceWidth,
    sourceHeight,
    canvasWidth,
    canvasHeight,
    DEFAULT_CLIP_TRANSFORM,
  );
}

function computeSafeAreaOverlay(
  canvasWidth: number,
  canvasHeight: number,
): SafeAreaOverlay {
  const scaleX = canvasWidth / 1080;
  const scaleY = canvasHeight / 1920;

  const safeRect: Rect = {
    x: Math.round(64 * scaleX),
    y: Math.round(220 * scaleY),
    width: Math.round(840 * scaleX),
    height: Math.round(1280 * scaleY),
  };

  const zones: SafeAreaZone[] = [
    {
      id: "top-header",
      label: "Reels / TikTok / Shorts Header & Status",
      rect: {
        x: 0,
        y: 0,
        width: canvasWidth,
        height: Math.round(220 * scaleY),
      },
    },
    {
      id: "right-actions",
      label: "Like / Comment / Share / Audio Rail",
      rect: {
        x: Math.round(904 * scaleX),
        y: Math.round(220 * scaleY),
        width: canvasWidth - Math.round(904 * scaleX),
        height: Math.round(1280 * scaleY),
      },
    },
    {
      id: "bottom-details",
      label: "Creator Handle, Caption & Scrubber",
      rect: {
        x: 0,
        y: Math.round(1500 * scaleY),
        width: canvasWidth,
        height: canvasHeight - Math.round(1500 * scaleY),
      },
    },
  ];

  return { safeRect, zones };
}

const WORD_POP_ENTRY_WINDOW_MS = 160;

function computeSpringPopScale(progress: number, emphasis: boolean): number {
  const clamped = Math.max(0, Math.min(1, progress));
  const rawSpring =
    1 + 0.28 * Math.sin(clamped * Math.PI) - 0.35 * Math.pow(1 - clamped, 2);
  const emphasisFactor = emphasis ? 1.08 : 1;
  return Number((rawSpring * emphasisFactor).toFixed(4));
}

function getReelFontCssStack(fontFamily: ReelFontFamily): string {
  const found = CURATED_REEL_FONTS.find((f) => f.family === fontFamily);
  return found ? found.cssStack : `"${fontFamily}", Inter, system-ui, sans-serif`;
}

function getReelFontWeight(fontFamily: ReelFontFamily): string {
  const found = CURATED_REEL_FONTS.find((f) => f.family === fontFamily);
  return found ? found.weight : "800";
}

function resolveActiveCaption(
  captions: readonly Caption[] | undefined,
  clipId: string,
  timelineTimeMs: number,
  canvasWidth: number,
  canvasHeight: number,
  captionStyle: CaptionStyle = DEFAULT_CAPTION_STYLE,
): ActiveCaptionDescriptor | null {
  if (!captions || captions.length === 0) {
    return null;
  }

  const caption =
    captions.find(
      (c) =>
        c.clipId === clipId &&
        timelineTimeMs >= c.timelineStartMs &&
        timelineTimeMs < c.timelineEndMs,
    ) ??
    captions.find(
      (c) =>
        c.clipId === clipId &&
        timelineTimeMs >= c.timelineStartMs &&
        timelineTimeMs <= c.timelineEndMs,
    ) ??
    null;

  if (!caption) {
    return null;
  }

  let activeWordIndex = caption.words.findIndex(
    (w) =>
      timelineTimeMs >= w.timelineStartMs && timelineTimeMs <= w.timelineEndMs,
  );
  if (activeWordIndex === -1) {
    for (let i = caption.words.length - 1; i >= 0; i--) {
      if (timelineTimeMs >= caption.words[i]!.timelineStartMs) {
        activeWordIndex = i;
        break;
      }
    }
  }
  if (activeWordIndex === -1) {
    activeWordIndex = 0;
  }

  const displayText = captionStyle.uppercase
    ? caption.text.toUpperCase()
    : caption.text;

  const wordLayouts: CaptionWordLayoutDescriptor[] = caption.words.map(
    (word, idx) => {
      const isActive = idx === activeWordIndex;
      const isSpoken = timelineTimeMs >= word.timelineStartMs;
      const wordDisplayText = captionStyle.uppercase
        ? word.text.toUpperCase()
        : word.text;

      let wordProgress = 0;
      if (captionStyle.animationMode === "word-pop") {
        if (timelineTimeMs >= word.timelineStartMs) {
          wordProgress = Math.min(
            1,
            Math.max(
              0,
              (timelineTimeMs - word.timelineStartMs) / WORD_POP_ENTRY_WINDOW_MS,
            ),
          );
        }
      } else {
        const wordDurationMs = Math.max(
          1,
          word.timelineEndMs - word.timelineStartMs,
        );
        if (timelineTimeMs >= word.timelineStartMs) {
          wordProgress = Math.min(
            1,
            Math.max(
              0,
              (timelineTimeMs - word.timelineStartMs) / wordDurationMs,
            ),
          );
        }
      }

      let scale = 1;
      if (captionStyle.animationMode === "flat") {
        scale = word.emphasis ? 1.08 : 1;
      } else if (captionStyle.animationMode === "hormozi-highlight") {
        if (isActive) {
          scale = word.emphasis ? 1.18 : 1.12;
        } else {
          scale = word.emphasis ? 1.06 : 1;
        }
      } else {
        scale = isSpoken
          ? computeSpringPopScale(wordProgress, word.emphasis)
          : computeSpringPopScale(0, word.emphasis);
      }

      let fillColor = captionStyle.primaryColor;
      if (word.emphasis) {
        fillColor = captionStyle.emphasisColor;
      } else if (
        isActive &&
        (captionStyle.animationMode === "hormozi-highlight" ||
          captionStyle.animationMode === "word-pop")
      ) {
        fillColor = captionStyle.activeWordColor;
      }

      const highlightPill =
        isActive && captionStyle.animationMode === "hormozi-highlight";
      const highlightPillColor = highlightPill
        ? captionStyle.presetId === "neon-box" ||
          captionStyle.backgroundMode === "box"
          ? "#22d3ee"
          : "rgba(250, 204, 21, 0.24)"
        : null;

      return {
        word,
        wordId: word.wordId,
        text: word.text,
        displayText: wordDisplayText,
        isActive,
        isSpoken,
        emphasis: word.emphasis,
        animationProgress: Number(wordProgress.toFixed(4)),
        scale,
        fillColor,
        highlightPill,
        highlightPillColor,
      };
    },
  );

  const activeWordLayout = wordLayouts[activeWordIndex];
  const normalizedPositionY =
    captionStyle.positionY > 1 && captionStyle.positionY <= 100
      ? captionStyle.positionY / 100
      : captionStyle.positionY;

  return {
    caption,
    text: caption.text,
    displayText,
    style: captionStyle,
    animationMode: captionStyle.animationMode,
    animationProgress: activeWordLayout ? activeWordLayout.animationProgress : 0,
    activeWordIndex,
    activeWord: caption.words[activeWordIndex] ?? null,
    words: caption.words,
    wordLayouts,
    centerX: Math.round(canvasWidth / 2),
    baselineY: Math.round(canvasHeight * normalizedPositionY),
  };
}

export function resolveFrameLayout(
  state: EditorState,
  timelineTimeMs: number,
  options: FrameLayoutOptions = {},
): FrameLayoutDescriptor {
  const canvasWidth = options.canvasWidth ?? 1080;
  const canvasHeight = options.canvasHeight ?? 1920;
  const showSafeArea = options.showSafeArea ?? false;

  const clips = state.timeline.clips;
  if (clips.length === 0) {
    throw new Error("Timeline must contain at least one Clip");
  }

  const clampedTimeMs = Math.max(
    0,
    Math.min(state.timeline.durationMs, timelineTimeMs),
  );

  // At boundary timestamps (e.g. clipA.timelineEndMs === clipB.timelineStartMs),
  // prefer the incoming clipB (`timelineStartMs <= clampedTimeMs < timelineEndMs`),
  // falling back to the final clip when clampedTimeMs === timeline.durationMs.
  const activeClip =
    clips.find(
      (clip) =>
        clampedTimeMs >= clip.timelineStartMs &&
        clampedTimeMs < clip.timelineEndMs,
    ) ?? clips[clips.length - 1]!;

  const offsetInClipMs = Math.max(
    0,
    Math.min(activeClip.durationMs, clampedTimeMs - activeClip.timelineStartMs),
  );
  const sourceTimeMs = activeClip.sourceStartMs + offsetInClipMs;

  const transform = activeClip.transform;
  const drawRect = computeTransformedDrawRect(
    state.sourceMedia.width,
    state.sourceMedia.height,
    canvasWidth,
    canvasHeight,
    transform,
  );
  const backdropRect =
    transform.fitMode === "contain"
      ? computeCoverDrawRect(
          state.sourceMedia.width,
          state.sourceMedia.height,
          canvasWidth,
          canvasHeight,
        )
      : null;

  const activeCaption = resolveActiveCaption(
    state.timeline.captions,
    activeClip.id,
    clampedTimeMs,
    canvasWidth,
    canvasHeight,
    state.captionStyle ?? DEFAULT_CAPTION_STYLE,
  );

  return {
    canvasWidth,
    canvasHeight,
    timelineTimeMs: clampedTimeMs,
    activeClip,
    sourceTimeMs,
    transform,
    drawRect,
    backdropRect,
    safeArea: showSafeArea
      ? computeSafeAreaOverlay(canvasWidth, canvasHeight)
      : null,
    activeCaption,
  };
}

export interface PlaybackStepResult {
  readonly activeClipId: string;
  readonly timelineTimeMs: number;
  readonly seekToSourceMs: number | null;
  readonly reachedEnd: boolean;
}

export function evaluatePlaybackStep(
  state: EditorState,
  currentClipId: string,
  videoCurrentTimeMs: number,
): PlaybackStepResult {
  const clips = state.timeline.clips;
  if (clips.length === 0) {
    throw new Error("Timeline must contain at least one Clip");
  }

  let clipIndex = clips.findIndex((c) => c.id === currentClipId);
  if (clipIndex === -1) {
    clipIndex = 0;
  }

  const currentClip = clips[clipIndex]!;

  if (videoCurrentTimeMs < currentClip.sourceEndMs) {
    const offsetMs = Math.max(0, videoCurrentTimeMs - currentClip.sourceStartMs);
    return {
      activeClipId: currentClip.id,
      timelineTimeMs: currentClip.timelineStartMs + offsetMs,
      seekToSourceMs: null,
      reachedEnd: false,
    };
  }

  const nextClip = clips[clipIndex + 1];
  if (!nextClip) {
    return {
      activeClipId: currentClip.id,
      timelineTimeMs: state.timeline.durationMs,
      seekToSourceMs: null,
      reachedEnd: true,
    };
  }

  const isContiguous =
    Math.abs(nextClip.sourceStartMs - currentClip.sourceEndMs) < 1;
  if (isContiguous && videoCurrentTimeMs < nextClip.sourceEndMs) {
    const offsetInNextMs = Math.max(
      0,
      videoCurrentTimeMs - nextClip.sourceStartMs,
    );
    return {
      activeClipId: nextClip.id,
      timelineTimeMs: nextClip.timelineStartMs + offsetInNextMs,
      seekToSourceMs: null,
      reachedEnd: false,
    };
  }

  return {
    activeClipId: nextClip.id,
    timelineTimeMs: nextClip.timelineStartMs,
    seekToSourceMs: nextClip.sourceStartMs,
    reachedEnd: false,
  };
}

function fillBackgroundShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  mode: "pill" | "box",
  pillRadius: number,
): void {
  if (
    mode === "pill" &&
    typeof ctx.beginPath === "function" &&
    typeof ctx.roundRect === "function" &&
    typeof ctx.fill === "function"
  ) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, pillRadius);
    ctx.fill();
    return;
  }
  ctx.fillRect(x, y, width, height);
}

function drawStrokedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fillColor: string,
  strokeColor: string,
  strokeWidth: number,
  maxWidth?: number,
): void {
  if (strokeWidth > 0 && typeof ctx.strokeText === "function") {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    if (typeof maxWidth === "number") {
      ctx.strokeText(text, x, y, maxWidth);
    } else {
      ctx.strokeText(text, x, y);
    }
  }
  ctx.fillStyle = fillColor;
  if (typeof maxWidth === "number") {
    ctx.fillText(text, x, y, maxWidth);
  } else {
    ctx.fillText(text, x, y);
  }
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  videoSource: CanvasImageSource | null,
  layout: FrameLayoutDescriptor,
): void {
  const {
    canvasWidth,
    canvasHeight,
    drawRect,
    backdropRect,
    safeArea,
    activeCaption,
  } = layout;

  ctx.save();
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (backdropRect) {
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    if (videoSource) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.drawImage(
        videoSource,
        backdropRect.x,
        backdropRect.y,
        backdropRect.width,
        backdropRect.height,
      );
      ctx.restore();
    }
  }

  if (videoSource) {
    ctx.drawImage(
      videoSource,
      drawRect.x,
      drawRect.y,
      drawRect.width,
      drawRect.height,
    );
  }

  if (activeCaption) {
    const style = activeCaption.style ?? DEFAULT_CAPTION_STYLE;
    const scaleX = canvasWidth / 1080;
    const scaleY = canvasHeight / 1920;
    const fontSize = Math.max(18, Math.round(style.fontSize * scaleY));
    const fontWeight = getReelFontWeight(style.fontFamily);
    const fontStack = getReelFontCssStack(style.fontFamily);
    ctx.font = `${fontWeight} ${fontSize}px ${fontStack}`;

    const measure = (text: string): number =>
      typeof ctx.measureText === "function"
        ? ctx.measureText(text).width
        : text.length * fontSize * 0.52;

    const fullDisplayText =
      activeCaption.displayText ??
      (style.uppercase
        ? activeCaption.text.toUpperCase()
        : activeCaption.text);

    const measuredWidth = measure(fullDisplayText);
    const pillPadX = Math.round(32 * scaleX);
    const pillPadY = Math.round(22 * scaleY);
    const maxPillWidth = canvasWidth - Math.round(96 * scaleX);
    const pillWidth = Math.min(
      maxPillWidth,
      Math.max(
        Math.round(220 * scaleX),
        Math.round(measuredWidth + pillPadX * 2),
      ),
    );
    const pillHeight = Math.round(fontSize + pillPadY * 2);
    const pillX = Math.round(activeCaption.centerX - pillWidth / 2);
    const pillY = Math.round(
      activeCaption.baselineY - fontSize - pillPadY * 0.65,
    );
    const textCenterY = Math.round(pillY + pillHeight / 2);

    if (style.backgroundMode !== "none") {
      ctx.save();
      ctx.fillStyle = style.backgroundColor;
      fillBackgroundShape(
        ctx,
        pillX,
        pillY,
        pillWidth,
        pillHeight,
        style.backgroundMode,
        Math.round(24 * scaleY),
      );
      ctx.restore();
    }

    const isUniformFlat =
      style.animationMode === "flat" &&
      activeCaption.wordLayouts.every((w) => !w.emphasis && w.scale === 1);

    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${fontStack}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (style.shadow) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
      ctx.shadowBlur = Math.round(12 * scaleY);
      ctx.shadowOffsetY = Math.round(4 * scaleY);
    }

    const scaledStrokeWidth = Math.max(0, Math.round(style.strokeWidth * scaleY));

    if (isUniformFlat) {
      const maxTextWidth = Math.max(40, pillWidth - pillPadX * 2);
      drawStrokedText(
        ctx,
        fullDisplayText,
        activeCaption.centerX,
        textCenterY,
        style.primaryColor,
        style.strokeColor,
        scaledStrokeWidth,
        maxTextWidth,
      );
    } else {
      const spaceWidth = Math.max(Math.round(fontSize * 0.28), measure(" "));
      const wordWidths = activeCaption.wordLayouts.map((w) =>
        Math.round(measure(w.displayText) * w.scale),
      );
      const totalWordsWidth =
        wordWidths.reduce((acc, width) => acc + width, 0) +
        Math.max(0, activeCaption.wordLayouts.length - 1) * spaceWidth;

      let cursorX = activeCaption.centerX - totalWordsWidth / 2;

      activeCaption.wordLayouts.forEach((wordLayout, idx) => {
        const wordWidth = wordWidths[idx] ?? 0;
        const wordCenterX = Math.round(cursorX + wordWidth / 2);

        if (wordLayout.highlightPill && wordLayout.highlightPillColor) {
          const wordPadX = Math.round(14 * scaleX);
          const wordPadY = Math.round(10 * scaleY);
          const highlightMode = style.backgroundMode === "box" ? "box" : "pill";
          ctx.save();
          ctx.fillStyle = wordLayout.highlightPillColor;
          fillBackgroundShape(
            ctx,
            Math.round(wordCenterX - wordWidth / 2 - wordPadX),
            Math.round(textCenterY - fontSize / 2 - wordPadY),
            Math.round(wordWidth + wordPadX * 2),
            Math.round(fontSize + wordPadY * 2),
            highlightMode,
            Math.round(14 * scaleY),
          );
          ctx.restore();
        }

        ctx.save();
        const wordFontSize = Math.max(
          16,
          Math.round(fontSize * wordLayout.scale),
        );
        ctx.font = `${fontWeight} ${wordFontSize}px ${fontStack}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        drawStrokedText(
          ctx,
          wordLayout.displayText,
          wordCenterX,
          textCenterY,
          wordLayout.fillColor,
          style.strokeColor,
          scaledStrokeWidth,
        );
        ctx.restore();

        cursorX += wordWidth + spaceWidth;
      });
    }

    ctx.restore();
  }

  if (safeArea) {
    // Shade obstructed platform UI zones
    ctx.fillStyle = "rgba(244, 63, 94, 0.22)";
    for (const zone of safeArea.zones) {
      ctx.fillRect(zone.rect.x, zone.rect.y, zone.rect.width, zone.rect.height);
    }

    // Draw dashed safe-area inner boundary
    ctx.strokeStyle = "rgba(56, 189, 248, 0.95)";
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 10]);
    ctx.strokeRect(
      safeArea.safeRect.x,
      safeArea.safeRect.y,
      safeArea.safeRect.width,
      safeArea.safeRect.height,
    );
    ctx.setLineDash([]);

    // Draw readable zone labels at 1080x1920 scale
    ctx.fillStyle = "rgba(254, 205, 211, 0.92)";
    ctx.font = "600 32px Inter, system-ui, sans-serif";
    ctx.fillText("UNSAFE: PLATFORM HEADER", 64, 125);
    ctx.fillText("UNSAFE: CAPTION & AUDIO DETAILS", 64, 1710);

    ctx.fillStyle = "rgba(186, 230, 253, 0.95)";
    ctx.font = "700 34px Inter, system-ui, sans-serif";
    ctx.fillText(
      "SAFE AREA (9:16)",
      safeArea.safeRect.x + 28,
      safeArea.safeRect.y + 56,
    );
  }

  ctx.restore();
}
