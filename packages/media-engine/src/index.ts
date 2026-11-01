import {
  DEFAULT_CLIP_TRANSFORM,
  computeSilenceRegionsFromEnvelope,
  getAudioEnvelopeBucketRange,
  type AudioEnvelope,
  type Clip,
  type ClipTransform,
  type EditorState,
  type SilenceDetectionConfig,
  type SilenceRegion,
  type Timeline,
} from "@reel-edit/editor-core";

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

  return bars;
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

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  videoSource: CanvasImageSource | null,
  layout: FrameLayoutDescriptor,
): void {
  const { canvasWidth, canvasHeight, drawRect, backdropRect, safeArea } = layout;

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
