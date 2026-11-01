import { useCallback, useEffect, useRef, useState } from "react";
import {
  EditorSession,
  type Clip,
  type EditorState,
} from "@reel-edit/editor-core";
import {
  evaluatePlaybackStep,
  renderFrame,
  resolveFrameLayout,
  type FrameLayoutDescriptor,
} from "@reel-edit/media-engine";
import {
  Film,
  Pause,
  Play,
  Redo2,
  Scissors,
  ShieldCheck,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
} from "lucide-react";
import { formatTimecodeMs } from "./format.js";

const DEFAULT_FALLBACK_DURATION_MS = 12000;
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

export function App() {
  const [session, setSession] = useState<EditorSession | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [timelineTimeMs, setTimelineTimeMs] = useState<number>(0);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [timelineZoom, setTimelineZoom] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [showSafeArea, setShowSafeArea] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeClipIdRef = useRef<string>("clip-1");
  const timelineTimeMsRef = useRef<number>(0);
  timelineTimeMsRef.current = timelineTimeMs;

  // Subscribe to EditorSession state updates
  useEffect(() => {
    if (!session) {
      setEditorState(null);
      return;
    }
    const syncState = () => {
      const next = session.getState();
      setEditorState(next);
      setTimelineTimeMs((prev) => Math.min(prev, next.timeline.durationMs));
      setSelectedClipIds((prev) => {
        const validIds = new Set(next.timeline.clips.map((c) => c.id));
        const kept = prev.filter((id) => validIds.has(id));
        if (kept.length > 0) {
          return kept;
        }
        return next.timeline.clips[0] ? [next.timeline.clips[0].id] : [];
      });
    };
    syncState();
    return session.subscribe(syncState);
  }, [session]);

  // Clean up object URL on unmount or replacement
  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const initializeSourceMedia = useCallback(
    (fileName: string, durationMs: number, width: number, height: number) => {
      const nextSession = EditorSession.fromSourceMedia({
        id: `source-${Date.now()}`,
        fileName,
        durationMs: Math.max(100, Math.round(durationMs)),
        width: width > 0 ? width : CANVAS_WIDTH,
        height: height > 0 ? height : CANVAS_HEIGHT,
      });
      setSession(nextSession);
      setTimelineTimeMs(0);
      timelineTimeMsRef.current = 0;
      setSelectedClipIds(["clip-1"]);
      activeClipIdRef.current = "clip-1";
      setIsPlaying(false);
      setStatusMessage(null);
    },
    [],
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (typeof URL.createObjectURL === "function") {
      try {
        const nextUrl = URL.createObjectURL(file);
        setVideoUrl(nextUrl);
      } catch {
        setVideoUrl(null);
      }
    }

    // Initialize immediately so the Timeline is ready without waiting for network/cloud
    initializeSourceMedia(
      file.name,
      DEFAULT_FALLBACK_DURATION_MS,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
    );
  };

  const handleVideoLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video || !editorState) {
      return;
    }
    const realDurationMs =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.round(video.duration * 1000)
        : DEFAULT_FALLBACK_DURATION_MS;
    const realWidth = video.videoWidth || CANVAS_WIDTH;
    const realHeight = video.videoHeight || CANVAS_HEIGHT;

    if (
      realDurationMs !== editorState.sourceMedia.durationMs ||
      realWidth !== editorState.sourceMedia.width ||
      realHeight !== editorState.sourceMedia.height
    ) {
      initializeSourceMedia(
        editorState.sourceMedia.fileName,
        realDurationMs,
        realWidth,
        realHeight,
      );
    }

    // Nudge currentTime slightly off 0 so browsers immediately decode and paint the initial video frame
    if (video.currentTime === 0) {
      try {
        video.currentTime = 0.001;
      } catch {
        // Ignore in non-media test environments
      }
    }
  };

  const computeLayout = useCallback(
    (timeMs: number): FrameLayoutDescriptor | null => {
      if (!editorState) {
        return null;
      }
      return resolveFrameLayout(editorState, timeMs, {
        canvasWidth: CANVAS_WIDTH,
        canvasHeight: CANVAS_HEIGHT,
        showSafeArea,
      });
    },
    [editorState, showSafeArea],
  );

  // Render the 9:16 WYSIWYG canvas frame whenever state, playhead, or Safe Area changes
  const drawCurrentFrame = useCallback(
    (timeMs: number) => {
      const layout = computeLayout(timeMs);
      if (!layout) {
        return;
      }
      activeClipIdRef.current = layout.activeClip.id;

      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      let ctx: CanvasRenderingContext2D | null = null;
      try {
        ctx = canvas.getContext("2d");
      } catch {
        ctx = null;
      }
      if (!ctx) {
        return;
      }
      renderFrame(ctx, videoRef.current, layout);
    },
    [computeLayout],
  );

  useEffect(() => {
    drawCurrentFrame(timelineTimeMs);
  }, [drawCurrentFrame, timelineTimeMs]);

  // Scrubbing to a new Timeline Time seeks the underlying video to the mapped Source Time
  const seekToTimelineTime = useCallback(
    (nextTimeMs: number) => {
      if (!editorState) {
        return;
      }
      const clamped = Math.max(
        0,
        Math.min(editorState.timeline.durationMs, nextTimeMs),
      );
      setTimelineTimeMs(clamped);
      timelineTimeMsRef.current = clamped;

      const layout = computeLayout(clamped);
      if (!layout) {
        return;
      }
      activeClipIdRef.current = layout.activeClip.id;

      const video = videoRef.current;
      if (video && Math.abs(video.currentTime * 1000 - layout.sourceTimeMs) > 16) {
        try {
          video.currentTime = layout.sourceTimeMs / 1000;
        } catch {
          // Ignore in non-media test environments
        }
      }
    },
    [computeLayout, editorState],
  );

  // Smooth playback loop across adjacent Clips in Timeline Time
  useEffect(() => {
    if (!isPlaying || !editorState) {
      return;
    }
    let rafId = 0;

    const tick = () => {
      const video = videoRef.current;
      let nextTimeMs = timelineTimeMsRef.current;

      if (video && !video.paused) {
        const videoTimeMs = video.currentTime * 1000;
        const step = evaluatePlaybackStep(
          editorState,
          activeClipIdRef.current,
          videoTimeMs,
        );
        activeClipIdRef.current = step.activeClipId;
        nextTimeMs = step.timelineTimeMs;
        timelineTimeMsRef.current = nextTimeMs;
        setTimelineTimeMs(nextTimeMs);

        if (step.seekToSourceMs !== null) {
          try {
            video.currentTime = step.seekToSourceMs / 1000;
          } catch {
            // Ignore in non-media test environments
          }
        }

        if (step.reachedEnd) {
          video.pause();
          setIsPlaying(false);
          drawCurrentFrame(nextTimeMs);
          return;
        }
      }
      drawCurrentFrame(nextTimeMs);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying, editorState, drawCurrentFrame]);

  const togglePlayPause = useCallback(() => {
    if (!editorState) {
      return;
    }
    const video = videoRef.current;
    if (isPlaying) {
      video?.pause();
      setIsPlaying(false);
      return;
    }

    const startFromMs =
      timelineTimeMs >= editorState.timeline.durationMs ? 0 : timelineTimeMs;
    seekToTimelineTime(startFromMs);
    if (video && typeof video.play === "function") {
      video.play().catch(() => {
        // Ignore play() rejection in headless test environments
      });
    }
    setIsPlaying(true);
  }, [editorState, isPlaying, seekToTimelineTime, timelineTimeMs]);

  const handleSplitAtPlayhead = useCallback(() => {
    if (!session) {
      return;
    }
    const res = session.dispatch({
      type: "splitClip",
      timelineTimeMs,
    });
    setStatusMessage(res.applied ? "Split Clip at playhead" : (res.reason ?? null));
  }, [session, timelineTimeMs]);

  const handleDeleteSelectedClips = useCallback(() => {
    if (!session || selectedClipIds.length === 0) {
      return;
    }
    const res = session.dispatch({
      type: "deleteClips",
      clipIds: selectedClipIds,
    });
    setStatusMessage(
      res.applied ? "Applied Ripple Delete" : (res.reason ?? null),
    );
  }, [session, selectedClipIds]);

  const handleSelectClip = useCallback(
    (clipId: string, multiSelect: boolean) => {
      setSelectedClipIds((prev) => {
        if (!multiSelect) {
          return [clipId];
        }
        if (prev.includes(clipId)) {
          return prev.length > 1 ? prev.filter((id) => id !== clipId) : prev;
        }
        return [...prev, clipId];
      });
    },
    [],
  );

  const handleTrimClip = useCallback(
    (clip: Clip, edge: "start" | "end", nextValueMs: number) => {
      if (!session) {
        return;
      }
      const res = session.dispatch({
        type: "trimClip",
        clipId: clip.id,
        sourceStartMs: edge === "start" ? nextValueMs : clip.sourceStartMs,
        sourceEndMs: edge === "end" ? nextValueMs : clip.sourceEndMs,
      });
      if (!res.applied && res.reason) {
        setStatusMessage(res.reason);
      }
    },
    [session],
  );

  const handleUndo = useCallback(() => {
    if (!session) {
      return;
    }
    if (session.undo()) {
      setStatusMessage("Undid last edit");
    }
  }, [session]);

  const handleRedo = useCallback(() => {
    if (!session) {
      return;
    }
    if (session.redo()) {
      setStatusMessage("Redid edit");
    }
  }, [session]);

  // Global keyboard shortcuts: S (splitClip), Delete/Backspace (deleteClips), Cmd/Ctrl+Z (Undo), Cmd/Ctrl+Shift+Z (Redo)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (event.key.toLowerCase() === "s" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        handleSplitAtPlayhead();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        handleDeleteSelectedClips();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDeleteSelectedClips, handleRedo, handleSplitAtPlayhead, handleUndo]);

  const currentLayout = computeLayout(timelineTimeMs);
  const canDeleteSelected =
    Boolean(editorState) &&
    selectedClipIds.length > 0 &&
    selectedClipIds.length < (editorState?.timeline.clips.length ?? 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top Header Bar */}
      <header className="h-14 border-b border-zinc-800 px-6 flex items-center justify-between bg-zinc-900/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Reel Edit</h1>
            <p className="text-xs text-zinc-400">9:16 Non-Destructive Editor</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="source-media-input"
            className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-zinc-950 font-medium text-xs px-3.5 py-2 transition"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Source Media</span>
            <input
              id="source-media-input"
              aria-label="Import Source Media"
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>

          <button
            type="button"
            onClick={handleUndo}
            disabled={!editorState?.canUndo}
            aria-label="Undo"
            title="Undo (Cmd/Ctrl+Z)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={!editorState?.canRedo}
            aria-label="Redo"
            title="Redo (Cmd/Ctrl+Shift+Z)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span>Redo</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      {!editorState ? (
        <main className="flex-1 flex items-center justify-center p-8">
          <label
            htmlFor="source-media-input"
            className="cursor-pointer max-w-md w-full rounded-2xl border border-dashed border-zinc-800 hover:border-sky-500/50 bg-zinc-900/40 hover:bg-zinc-900/70 p-8 text-center space-y-4 transition block"
          >
            <div className="mx-auto w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Upload className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold">
                Import a local Source Media video
              </h2>
              <p className="text-xs text-zinc-400">
                Zero cloud upload. Your video stays in your browser and opens on
                a 9:16 vertical Timeline with Ripple Delete.
              </p>
            </div>
          </label>
        </main>
      ) : (
        <main className="flex-1 grid grid-rows-[1fr_auto] overflow-hidden">
          {/* Upper Zone: Source Media Info + 9:16 Vertical Canvas Player */}
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 p-6 overflow-y-auto">
            {/* Left Inspector: Source Media & Active Clip Metadata */}
            <aside className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4 self-start">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                  Source Media
                </div>
                <div className="mt-1 text-sm font-semibold text-zinc-100 truncate">
                  {editorState.sourceMedia.fileName}
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  Source Duration:{" "}
                  {formatTimecodeMs(editorState.sourceMedia.durationMs)} ·{" "}
                  {editorState.sourceMedia.width}×
                  {editorState.sourceMedia.height}
                </div>
              </div>

              {currentLayout && (
                <div className="border-t border-zinc-800 pt-3 space-y-1">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                    Active Clip at Playhead
                  </div>
                  <div className="text-xs font-medium text-sky-400">
                    {currentLayout.activeClip.id}
                  </div>
                  <div className="text-xs text-zinc-400">
                    Source Time: {formatTimecodeMs(currentLayout.sourceTimeMs)}{" "}
                    ({formatTimecodeMs(currentLayout.activeClip.sourceStartMs)}{" "}
                    – {formatTimecodeMs(currentLayout.activeClip.sourceEndMs)})
                  </div>
                </div>
              )}

              {statusMessage && (
                <div
                  role="status"
                  className="rounded-lg bg-zinc-800/80 border border-zinc-700 px-3 py-2 text-xs text-zinc-200"
                >
                  {statusMessage}
                </div>
              )}
            </aside>

            {/* Center: 9:16 Vertical WYSIWYG Canvas Player */}
            <section className="flex flex-col items-center justify-center gap-4">
              <div className="relative aspect-[9/16] h-[420px] max-h-[60vh] rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl">
                {videoUrl && (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    preload="auto"
                    muted
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onLoadedData={() =>
                      drawCurrentFrame(timelineTimeMsRef.current)
                    }
                    onSeeked={() => drawCurrentFrame(timelineTimeMsRef.current)}
                    className="hidden"
                    playsInline
                  />
                )}
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  data-testid="player-canvas"
                  className="w-full h-full object-contain"
                />

                {showSafeArea && currentLayout?.safeArea && (
                  <div
                    data-testid="safe-area-indicator"
                    className="pointer-events-none sr-only"
                  >
                    Safe Area Guide Active (Reels · TikTok · Shorts)
                  </div>
                )}
              </div>

              {/* Player Transport & Safe Area Controls */}
              <div className="flex flex-wrap items-center gap-3 bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-2.5">
                <button
                  type="button"
                  onClick={togglePlayPause}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 text-zinc-950 px-3 py-1.5 text-xs font-semibold hover:bg-white"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Play</span>
                    </>
                  )}
                </button>

                <div className="text-xs font-mono text-zinc-300">
                  <span data-testid="playhead-time">
                    {formatTimecodeMs(timelineTimeMs)}
                  </span>
                  {" / "}
                  <span data-testid="timeline-duration">
                    {formatTimecodeMs(editorState.timeline.durationMs)}
                  </span>
                </div>

                <button
                  type="button"
                  aria-pressed={showSafeArea}
                  onClick={() => setShowSafeArea((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    showSafeArea
                      ? "border-sky-400/60 bg-sky-500/20 text-sky-300"
                      : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Safe Area</span>
                </button>
              </div>
            </section>
          </div>

          {/* Lower Zone: Non-Destructive Timeline & Edit Command Toolbar */}
          <section
            aria-label="Timeline"
            className="border-t border-zinc-800 bg-zinc-900/70 p-5 space-y-4"
          >
            {/* Timeline Action Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSplitAtPlayhead}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-100"
                >
                  <Scissors className="w-3.5 h-3.5 text-sky-400" />
                  <span>Split at Playhead (S)</span>
                </button>

                <button
                  type="button"
                  onClick={handleDeleteSelectedClips}
                  disabled={!canDeleteSelected}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-rose-950/60 hover:border-rose-700/60 px-3 py-1.5 text-xs font-medium text-zinc-100 disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>
                    Ripple Delete ({selectedClipIds.length} selected · Del)
                  </span>
                </button>
              </div>

              {/* Millisecond-Accurate Playhead Scrubber & Horizontal Zoom */}
              <div className="flex flex-wrap items-center gap-4 flex-1 justify-end">
                <div className="flex items-center gap-2 min-w-[220px] max-w-sm flex-1">
                  <label
                    htmlFor="timeline-playhead-slider"
                    className="text-xs text-zinc-400 whitespace-nowrap"
                  >
                    Timeline Playhead
                  </label>
                  <input
                    id="timeline-playhead-slider"
                    aria-label="Timeline Playhead"
                    type="range"
                    min={0}
                    max={editorState.timeline.durationMs}
                    step={1}
                    value={timelineTimeMs}
                    onChange={(e) => seekToTimelineTime(Number(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <ZoomIn className="w-3.5 h-3.5 text-zinc-400" />
                  <label
                    htmlFor="timeline-zoom-slider"
                    className="text-xs text-zinc-400 whitespace-nowrap"
                  >
                    Timeline Zoom ({timelineZoom.toFixed(1)}×)
                  </label>
                  <input
                    id="timeline-zoom-slider"
                    aria-label="Timeline Zoom"
                    type="range"
                    min={1}
                    max={5}
                    step={0.5}
                    value={timelineZoom}
                    onChange={(e) => setTimelineZoom(Number(e.target.value))}
                    className="w-24 accent-sky-400"
                  />
                </div>
              </div>
            </div>

            {/* Contiguous Clip Track (Ripple Delete guarantees zero gaps) */}
            <div className="overflow-x-auto pb-2">
              <div
                className="flex items-stretch gap-1.5"
                style={{ width: `${Math.round(timelineZoom * 100)}%` }}
              >
                {editorState.timeline.clips.map((clip) => {
                  const isSelected = selectedClipIds.includes(clip.id);
                  const widthPercent = Math.max(
                    12,
                    Math.round(
                      (clip.durationMs / editorState.timeline.durationMs) * 100,
                    ),
                  );
                  return (
                    <div
                      key={clip.id}
                      data-testid={`timeline-clip-${clip.id}`}
                      onClick={(e) =>
                        handleSelectClip(
                          clip.id,
                          e.shiftKey || e.metaKey || e.ctrlKey,
                        )
                      }
                      style={{ flexBasis: `${widthPercent}%` }}
                      className={`group relative rounded-xl border p-3 transition cursor-pointer select-none min-w-[200px] flex-grow ${
                        isSelected
                          ? "border-sky-400 bg-sky-500/15"
                          : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-zinc-100">{clip.id}</span>
                        <span className="font-mono text-[11px] text-sky-300">
                          {formatTimecodeMs(clip.timelineStartMs)} –{" "}
                          {formatTimecodeMs(clip.timelineEndMs)}
                        </span>
                      </div>

                      <div className="mt-1 text-[11px] text-zinc-400 font-mono">
                        Source: {formatTimecodeMs(clip.sourceStartMs)} →{" "}
                        {formatTimecodeMs(clip.sourceEndMs)}
                      </div>

                      {/* Timeline Trim Handles */}
                      <div
                        className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/80"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                          <span>In (ms)</span>
                          <input
                            aria-label={`Trim start ${clip.id}`}
                            type="number"
                            min={0}
                            max={clip.sourceEndMs - 100}
                            step={50}
                            value={clip.sourceStartMs}
                            onChange={(e) =>
                              handleTrimClip(
                                clip,
                                "start",
                                Number(e.target.value),
                              )
                            }
                            className="rounded bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs font-mono text-zinc-200"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                          <span>Out (ms)</span>
                          <input
                            aria-label={`Trim end ${clip.id}`}
                            type="number"
                            min={clip.sourceStartMs + 100}
                            max={editorState.sourceMedia.durationMs}
                            step={50}
                            value={clip.sourceEndMs}
                            onChange={(e) =>
                              handleTrimClip(
                                clip,
                                "end",
                                Number(e.target.value),
                              )
                            }
                            className="rounded bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs font-mono text-zinc-200"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
