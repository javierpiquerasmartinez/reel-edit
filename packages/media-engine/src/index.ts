import {
  DEFAULT_CLIP_TRANSFORM,
  type Clip,
  type ClipTransform,
  type EditorState,
} from "@reel-edit/editor-core";

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
