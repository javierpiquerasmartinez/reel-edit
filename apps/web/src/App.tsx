import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_CLIP_TRANSFORM,
  DEFAULT_SILENCE_CONFIG,
  EditorSession,
  type AudioEnvelope,
  type Clip,
  type ClipFitMode,
  type EditorState,
  type SilenceDetectionConfig,
} from "@reel-edit/editor-core";
import {
  decodeSourceMediaAudioEnvelope,
  evaluatePlaybackStep,
  projectSilencePreview,
  renderFrame,
  resolveFrameLayout,
  sliceClipWaveform,
  transcribeSourceMedia,
  type FrameLayoutDescriptor,
  type TranscriptionProvider,
} from "@reel-edit/media-engine";
import {
  ArrowLeft,
  ArrowRight,
  AudioWaveform,
  FileText,
  Film,
  Maximize2,
  Mic,
  Pause,
  Play,
  Redo2,
  Scissors,
  ShieldCheck,
  Sparkles,
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
  const [silenceConfig, setSilenceConfig] = useState<SilenceDetectionConfig>(
    DEFAULT_SILENCE_CONFIG,
  );
  const [transcriptionProvider, setTranscriptionProvider] =
    useState<TranscriptionProvider>("local-whisper");
  const [transcriptionLanguage, setTranscriptionLanguage] =
    useState<string>("spanish");
  const [openAiApiKey, setOpenAiApiKey] = useState<string>("");
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState<
    string | null
  >(null);
  const [transcriptionBadge, setTranscriptionBadge] = useState<string | null>(
    null,
  );
  const [selectedWordRange, setSelectedWordRange] = useState<{
    startWordId: string;
    endWordId: string;
  } | null>(null);
  const [editingWordText, setEditingWordText] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceFileRef = useRef<File | null>(null);
  const decodedEnvelopePromiseRef = useRef<Promise<AudioEnvelope> | null>(null);
  const resolvedEnvelopeRef = useRef<AudioEnvelope | null>(null);
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
      const safeDurationMs = Math.max(100, Math.round(durationMs));
      const nextSession = EditorSession.fromSourceMedia({
        id: `source-${Date.now()}`,
        fileName,
        durationMs: safeDurationMs,
        width: width > 0 ? width : CANVAS_WIDTH,
        height: height > 0 ? height : CANVAS_HEIGHT,
      });
      setSession(nextSession);
      setTimelineTimeMs(0);
      timelineTimeMsRef.current = 0;
      setSelectedClipIds(["clip-1"]);
      activeClipIdRef.current = "clip-1";
      setIsPlaying(false);
      setTranscriptionBadge(null);
      setSelectedWordRange(null);
      setEditingWordText("");
      setStatusMessage(null);

      const existingEnvelope = resolvedEnvelopeRef.current;
      if (existingEnvelope && existingEnvelope.peaks.length > 0) {
        nextSession.setAudioEnvelope(existingEnvelope);
      }

      const envelopePromise = decodedEnvelopePromiseRef.current;
      if (envelopePromise) {
        void envelopePromise.then((decodedEnvelope) => {
          if (decodedEnvelope.peaks.length > 0) {
            resolvedEnvelopeRef.current = decodedEnvelope;
            nextSession.setAudioEnvelope(decodedEnvelope);
          }
        });
      }
    },
    [],
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    sourceFileRef.current = file;
    resolvedEnvelopeRef.current = null;
    decodedEnvelopePromiseRef.current = decodeSourceMediaAudioEnvelope(file, {
      bucketDurationMs: 100,
    });

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

      const video = videoRef.current;
      if (
        !isPlaying &&
        video &&
        video.paused &&
        Math.abs(video.currentTime * 1000 - layout.sourceTimeMs) > 16
      ) {
        try {
          video.currentTime = layout.sourceTimeMs / 1000;
        } catch {
          // Ignore in non-media test environments
        }
      }

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
    [computeLayout, isPlaying],
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

  const handleSetClipTransform = useCallback(
    (
      updates: {
        fitMode?: ClipFitMode;
        scale?: number;
        offsetX?: number;
        offsetY?: number;
      },
      applyToAll = false,
    ) => {
      if (!session || !editorState) {
        return;
      }
      const targetIds = applyToAll
        ? editorState.timeline.clips.map((c) => c.id)
        : selectedClipIds.length > 0
          ? selectedClipIds
          : editorState.timeline.clips[0]
            ? [editorState.timeline.clips[0].id]
            : [];
      if (targetIds.length === 0) {
        return;
      }
      const res = session.dispatch({
        type: "setClipTransform",
        clipIds: targetIds,
        ...updates,
      });
      setStatusMessage(
        res.applied ? "Updated Clip transform" : (res.reason ?? null),
      );
    },
    [editorState, selectedClipIds, session],
  );

  const handleReorderClip = useCallback(
    (clipId: string, targetIndex: number) => {
      if (!session) {
        return;
      }
      const res = session.dispatch({
        type: "reorderClip",
        clipId,
        targetIndex,
      });
      setStatusMessage(
        res.applied ? `Reordered ${clipId}` : (res.reason ?? null),
      );
    },
    [session],
  );

  const handlePromoteAsHook = useCallback(() => {
    if (!session || !editorState) {
      return;
    }
    const targetClip =
      editorState.timeline.clips.find((c) => selectedClipIds.includes(c.id)) ??
      editorState.timeline.clips[0];
    if (!targetClip) {
      return;
    }
    const res = session.dispatch({
      type: "duplicateClipAsHook",
      sourceStartMs: targetClip.sourceStartMs,
      sourceEndMs: targetClip.sourceEndMs,
    });
    if (res.applied) {
      const nextFirst = session.getState().timeline.clips[0];
      if (nextFirst) {
        setSelectedClipIds([nextFirst.id]);
      }
      seekToTimelineTime(0);
      setStatusMessage(`Promoted ${targetClip.id} as opening Hook at 00:00.000`);
    } else if (res.reason) {
      setStatusMessage(res.reason);
    }
  }, [editorState, seekToTimelineTime, selectedClipIds, session]);

  const handleRemoveSilences = useCallback(() => {
    if (!session) {
      return;
    }
    const res = session.dispatch({
      type: "removeSilences",
      thresholdDb: silenceConfig.thresholdDb,
      minDurationMs: silenceConfig.minDurationMs,
      paddingMs: silenceConfig.paddingMs,
    });
    setStatusMessage(
      res.applied
        ? "Removed Silence Regions with Ripple Delete"
        : (res.reason ?? null),
    );
  }, [session, silenceConfig]);

  const handleTranscribeAudio = useCallback(async () => {
    if (!session || !editorState) {
      return;
    }
    setIsTranscribing(true);
    setTranscriptionProgress("Downsampling audio to 16kHz mono...");
    try {
      const sourceInput = sourceFileRef.current ?? new ArrayBuffer(0);
      const languageArg =
        transcriptionLanguage === "auto"
          ? undefined
          : transcriptionProvider === "openai"
            ? transcriptionLanguage === "spanish"
              ? "es"
              : "en"
            : transcriptionLanguage;
      const result = await transcribeSourceMedia(sourceInput, {
        provider: transcriptionProvider,
        openAiApiKey,
        language: languageArg,
        sourceDurationMs: editorState.sourceMedia.durationMs,
        onProgress: (status) => {
          setTranscriptionProgress(status);
        },
      });
      session.setTranscript(result.words);
      const firstWord = result.words[0];
      if (firstWord) {
        setSelectedWordRange({
          startWordId: firstWord.id,
          endWordId: firstWord.id,
        });
        setEditingWordText(firstWord.text);
      }
      setTranscriptionBadge(
        `16kHz Mono · ${result.words.length} words · ${result.model}`,
      );
      setStatusMessage(
        `Generated Transcript (${result.words.length} Word Timings via ${result.model})`,
      );
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : "Transcription failed",
      );
    } finally {
      setIsTranscribing(false);
      setTranscriptionProgress(null);
    }
  }, [
    editorState,
    openAiApiKey,
    session,
    transcriptionLanguage,
    transcriptionProvider,
  ]);

  const handleWordClick = useCallback(
    (
      word: {
        readonly id: string;
        readonly text: string;
        readonly isActive: boolean;
        readonly timelineStartMs: number | null;
      },
      extendSelection: boolean,
    ) => {
      if (extendSelection && selectedWordRange) {
        setSelectedWordRange({
          startWordId: selectedWordRange.startWordId,
          endWordId: word.id,
        });
      } else {
        setSelectedWordRange({
          startWordId: word.id,
          endWordId: word.id,
        });
        setEditingWordText(word.text);
      }

      if (word.isActive && word.timelineStartMs !== null) {
        seekToTimelineTime(word.timelineStartMs);
      }
    },
    [seekToTimelineTime, selectedWordRange],
  );

  const handleSaveWordText = useCallback(() => {
    if (!session || !selectedWordRange) {
      return;
    }
    const trimmed = editingWordText.trim();
    if (!trimmed) {
      return;
    }
    const res = session.dispatch({
      type: "updateWords",
      updates: [
        {
          wordId: selectedWordRange.startWordId,
          text: trimmed,
        },
      ],
    });
    setStatusMessage(
      res.applied ? "Updated Caption word text" : (res.reason ?? null),
    );
  }, [editingWordText, selectedWordRange, session]);

  const handleDeleteSelectedWords = useCallback(() => {
    if (!session || !selectedWordRange) {
      return;
    }
    const res = session.dispatch({
      type: "deleteWordRange",
      startWordId: selectedWordRange.startWordId,
      endWordId: selectedWordRange.endWordId,
    });
    setStatusMessage(
      res.applied
        ? "Cut selected Word Timing range with Ripple Delete"
        : (res.reason ?? null),
    );
  }, [selectedWordRange, session]);

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
  const selectedClip =
    editorState?.timeline.clips.find((c) => selectedClipIds.includes(c.id)) ??
    currentLayout?.activeClip ??
    null;
  const activeTransform = selectedClip?.transform ?? DEFAULT_CLIP_TRANSFORM;
  const silencePreview = editorState
    ? projectSilencePreview(
        editorState.timeline,
        editorState.audioEnvelope,
        silenceConfig,
      )
    : null;
  const canDeleteSelected =
    Boolean(editorState) &&
    selectedClipIds.length > 0 &&
    selectedClipIds.length < (editorState?.timeline.clips.length ?? 0);

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden lg:h-screen lg:overflow-hidden bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top Header Bar */}
      <header className="h-14 shrink-0 border-b border-zinc-800 px-6 flex items-center justify-between bg-zinc-900/60">
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
        <main className="flex-1 min-h-0 min-w-0 w-full max-w-full grid grid-cols-[minmax(0,1fr)] grid-rows-[1fr_auto] overflow-hidden">
          {/* Upper Zone: Source Media Info + 9:16 Vertical Canvas Player + Transcript Panel */}
          <div className="min-h-0 min-w-0 w-full grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)_340px] gap-4 p-4 overflow-y-auto lg:overflow-hidden">
            {/* Left Inspector: Source Media & Active Clip Metadata */}
            <aside className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4 self-start lg:max-h-full lg:overflow-y-auto">
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

              {/* Clip Framing (Cover / Contain) & Punch-in Zoom Inspector */}
              <div className="border-t border-zinc-800 pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>Framing &amp; Punch-in</span>
                  </div>
                  <span className="text-[11px] text-zinc-400">
                    {selectedClipIds.length} selected
                  </span>
                </div>

                {/* Cover / Contain Framing Mode Toggle */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    aria-pressed={activeTransform.fitMode === "cover"}
                    onClick={() => handleSetClipTransform({ fitMode: "cover" })}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                      activeTransform.fitMode === "cover"
                        ? "border-sky-400 bg-sky-500/20 text-sky-200"
                        : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    Cover
                  </button>
                  <button
                    type="button"
                    aria-pressed={activeTransform.fitMode === "contain"}
                    onClick={() =>
                      handleSetClipTransform({ fitMode: "contain" })
                    }
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                      activeTransform.fitMode === "contain"
                        ? "border-sky-400 bg-sky-500/20 text-sky-200"
                        : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    Contain
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleSetClipTransform(
                      { fitMode: activeTransform.fitMode },
                      true,
                    )
                  }
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition"
                >
                  Apply {activeTransform.fitMode} to All Clips
                </button>

                {/* Punch-in Zoom Scale & X/Y Pan Offsets */}
                <div className="space-y-2 pt-1">
                  <label className="flex flex-col gap-1 text-xs text-zinc-300">
                    <span className="flex justify-between text-[11px] text-zinc-400">
                      <span>Punch-in Scale</span>
                      <span className="font-mono text-sky-300">
                        {activeTransform.scale.toFixed(2)}×
                      </span>
                    </span>
                    <input
                      aria-label="Punch-in Scale"
                      type="number"
                      min={0.5}
                      max={3}
                      step={0.05}
                      value={activeTransform.scale}
                      onChange={(e) =>
                        handleSetClipTransform({
                          scale: Number(e.target.value),
                        })
                      }
                      className="rounded bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs font-mono text-zinc-200"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                      <span>Offset X (px)</span>
                      <input
                        aria-label="Offset X"
                        type="number"
                        step={10}
                        value={activeTransform.offsetX}
                        onChange={(e) =>
                          handleSetClipTransform({
                            offsetX: Number(e.target.value),
                          })
                        }
                        className="rounded bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs font-mono text-zinc-200"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                      <span>Offset Y (px)</span>
                      <input
                        aria-label="Offset Y"
                        type="number"
                        step={10}
                        value={activeTransform.offsetY}
                        onChange={(e) =>
                          handleSetClipTransform({
                            offsetY: Number(e.target.value),
                          })
                        }
                        className="rounded bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs font-mono text-zinc-200"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Silences Detection & Removal Panel */}
              <div className="border-t border-zinc-800 pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <AudioWaveform className="w-3.5 h-3.5 text-rose-400" />
                    <span>Silences</span>
                  </div>
                  {silencePreview && (
                    <span
                      data-testid="silence-preview-summary"
                      className="rounded bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[11px] font-mono text-rose-300"
                    >
                      {silencePreview.cutCount}{" "}
                      {silencePreview.cutCount === 1 ? "cut" : "cuts"} ·{" "}
                      {(silencePreview.savedDurationMs / 1000).toFixed(1)}s
                      saved
                    </span>
                  )}
                </div>

                <div className="space-y-2.5">
                  <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                    <span className="flex justify-between">
                      <span>Silence Threshold (dB)</span>
                      <span className="font-mono text-zinc-200">
                        {silenceConfig.thresholdDb} dB
                      </span>
                    </span>
                    <input
                      aria-label="Silence Threshold (dB)"
                      type="range"
                      min={-60}
                      max={-10}
                      step={1}
                      value={silenceConfig.thresholdDb}
                      onChange={(e) =>
                        setSilenceConfig((prev) => ({
                          ...prev,
                          thresholdDb: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-rose-400"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                    <span className="flex justify-between">
                      <span>Min Silence Duration (ms)</span>
                      <span className="font-mono text-zinc-200">
                        {silenceConfig.minDurationMs} ms
                      </span>
                    </span>
                    <input
                      aria-label="Min Silence Duration (ms)"
                      type="range"
                      min={100}
                      max={3000}
                      step={50}
                      value={silenceConfig.minDurationMs}
                      onChange={(e) =>
                        setSilenceConfig((prev) => ({
                          ...prev,
                          minDurationMs: Math.max(
                            50,
                            Number(e.target.value) || 50,
                          ),
                        }))
                      }
                      className="w-full accent-rose-400"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                    <span className="flex justify-between">
                      <span>Speech Padding (ms)</span>
                      <span className="font-mono text-zinc-200">
                        {silenceConfig.paddingMs} ms
                      </span>
                    </span>
                    <input
                      aria-label="Speech Padding (ms)"
                      type="range"
                      min={0}
                      max={500}
                      step={10}
                      value={silenceConfig.paddingMs}
                      onChange={(e) =>
                        setSilenceConfig((prev) => ({
                          ...prev,
                          paddingMs: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      className="w-full accent-rose-400"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleRemoveSilences}
                    disabled={!silencePreview || silencePreview.cutCount === 0}
                    className="w-full rounded-lg border border-rose-500/40 bg-rose-500/20 hover:bg-rose-500/30 disabled:opacity-40 px-3 py-1.5 text-xs font-semibold text-rose-200 transition"
                  >
                    Remove Silences
                  </button>
                </div>
              </div>

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
            <section className="min-h-0 min-w-0 flex flex-col items-center justify-center gap-3">
              <div className="relative w-[270px] h-[480px] shrink-0 rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl">
                {videoUrl && (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    preload="auto"
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onLoadedData={() =>
                      drawCurrentFrame(timelineTimeMsRef.current)
                    }
                    onCanPlay={() =>
                      drawCurrentFrame(timelineTimeMsRef.current)
                    }
                    onSeeked={() => drawCurrentFrame(timelineTimeMsRef.current)}
                    onTimeUpdate={() => {
                      if (!isPlaying) {
                        drawCurrentFrame(timelineTimeMsRef.current);
                      }
                    }}
                    className="pointer-events-none absolute inset-0 w-full h-full opacity-0"
                    playsInline
                  />
                )}
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  data-testid="player-canvas"
                  className="block w-full h-full"
                />

                {currentLayout?.activeCaption && (
                  <div
                    data-testid="active-caption-overlay"
                    className="pointer-events-none sr-only"
                  >
                    {currentLayout.activeCaption.text}
                  </div>
                )}

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

            {/* Right Panel: Hybrid Transcription & Interactive Transcript Editor */}
            <aside
              aria-label="Transcript"
              className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4 self-start lg:max-h-full lg:overflow-y-auto"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Transcript &amp; Captions</span>
                </div>
                {transcriptionBadge && (
                  <span
                    data-testid="transcription-badge"
                    className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-300"
                  >
                    {transcriptionBadge}
                  </span>
                )}
              </div>

              {/* Hybrid Whisper Provider Controls (16kHz Mono Extraction) */}
              <div className="space-y-2.5">
                <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                  <span>Transcription Provider</span>
                  <select
                    aria-label="Transcription Provider"
                    value={transcriptionProvider}
                    onChange={(e) =>
                      setTranscriptionProvider(
                        e.target.value as TranscriptionProvider,
                      )
                    }
                    className="rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200"
                  >
                    <option value="local-whisper">
                      Local Browser Whisper (Free · WebGPU/Wasm)
                    </option>
                    <option value="openai">
                      OpenAI Whisper (whisper-1 · Word Timings)
                    </option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                  <span>Spoken Language</span>
                  <select
                    aria-label="Spoken Language"
                    value={transcriptionLanguage}
                    onChange={(e) => setTranscriptionLanguage(e.target.value)}
                    className="rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200"
                  >
                    <option value="spanish">Español (es)</option>
                    <option value="english">English (en)</option>
                    <option value="auto">Auto-detect</option>
                  </select>
                </label>

                {transcriptionProvider === "openai" && (
                  <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                    <span>OpenAI API Key</span>
                    <input
                      aria-label="OpenAI API Key"
                      type="password"
                      placeholder="sk-..."
                      value={openAiApiKey}
                      onChange={(e) => setOpenAiApiKey(e.target.value)}
                      className="rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-xs font-mono text-zinc-200"
                    />
                  </label>
                )}

                <button
                  type="button"
                  onClick={() => void handleTranscribeAudio()}
                  disabled={isTranscribing}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-40 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>
                    {isTranscribing
                      ? (transcriptionProgress ??
                        "Downsampling 16kHz & Transcribing...")
                      : "Transcribe Audio"}
                  </span>
                </button>
              </div>

              {/* Interactive Word-Level Transcript & Text-Based Video Editing */}
              {editorState.projectedTranscriptWords.length === 0 ? (
                <p className="text-xs text-zinc-400 border-t border-zinc-800 pt-3">
                  Generate a Transcript to click words to seek, edit Caption
                  spelling, or select and delete spoken phrases with Ripple
                  Delete.
                </p>
              ) : (
                <div className="border-t border-zinc-800 pt-3 space-y-3">
                  <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
                    {editorState.projectedTranscriptWords.map((word, idx) => {
                      const words = editorState.projectedTranscriptWords;
                      const startIdx = selectedWordRange
                        ? words.findIndex(
                            (w) => w.id === selectedWordRange.startWordId,
                          )
                        : -1;
                      const endIdx = selectedWordRange
                        ? words.findIndex(
                            (w) => w.id === selectedWordRange.endWordId,
                          )
                        : -1;
                      const fromIdx =
                        startIdx !== -1 && endIdx !== -1
                          ? Math.min(startIdx, endIdx)
                          : -1;
                      const toIdx =
                        startIdx !== -1 && endIdx !== -1
                          ? Math.max(startIdx, endIdx)
                          : -1;
                      const isWordSelected =
                        fromIdx !== -1 && idx >= fromIdx && idx <= toIdx;

                      return (
                        <button
                          key={word.id}
                          type="button"
                          data-testid={`transcript-word-${word.id}`}
                          data-word-active={word.isActive ? "true" : "false"}
                          onClick={(e) => handleWordClick(word, e.shiftKey)}
                          className={`rounded px-1.5 py-0.5 text-xs font-medium transition ${
                            !word.isActive
                              ? "line-through opacity-45 text-zinc-500 bg-zinc-900 border border-zinc-800/60"
                              : isWordSelected
                                ? "bg-emerald-500/25 border border-emerald-400 text-emerald-100"
                                : "bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800"
                          }`}
                        >
                          {word.text}
                        </button>
                      );
                    })}
                  </div>

                  {/* Word Text Correction & Phrase Ripple-Delete Controls */}
                  {selectedWordRange && (
                    <div className="space-y-2 pt-1">
                      {selectedWordRange.startWordId ===
                        selectedWordRange.endWordId && (
                        <div className="flex items-end gap-1.5">
                          <label className="flex-1 flex flex-col gap-1 text-[11px] text-zinc-400">
                            <span>Edit Selected Word Text</span>
                            <input
                              aria-label="Edit selected word text"
                              type="text"
                              value={editingWordText}
                              onChange={(e) =>
                                setEditingWordText(e.target.value)
                              }
                              className="rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-1 text-xs text-zinc-100"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={handleSaveWordText}
                            className="rounded-lg border border-sky-500/40 bg-sky-500/20 hover:bg-sky-500/30 px-2.5 py-1 text-xs font-semibold text-sky-200 transition"
                          >
                            Save Word Text
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleDeleteSelectedWords}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/20 hover:bg-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-200 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Selected Words (Ripple Delete)</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </aside>
          </div>

          {/* Lower Zone: Non-Destructive Timeline & Edit Command Toolbar */}
          <section
            aria-label="Timeline"
            className="shrink-0 min-w-0 w-full max-w-full overflow-hidden border-t border-zinc-800 bg-zinc-900/70 p-4 space-y-3"
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

                <button
                  type="button"
                  onClick={handlePromoteAsHook}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 px-3 py-1.5 text-xs font-medium text-amber-200"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Promote as Opening Hook</span>
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
            <div className="w-full min-w-0 overflow-x-auto pb-2">
              <div
                className="flex items-stretch gap-1.5"
                style={{ width: `${Math.round(timelineZoom * 100)}%` }}
              >
                {editorState.timeline.clips.map((clip, clipIndex) => {
                  const isSelected = selectedClipIds.includes(clip.id);
                  const widthPercent = Math.max(
                    12,
                    Math.round(
                      (clip.durationMs / editorState.timeline.durationMs) * 100,
                    ),
                  );
                  const waveformBars = editorState.audioEnvelope
                    ? sliceClipWaveform(
                        editorState.audioEnvelope,
                        clip,
                        silencePreview?.silenceRegions ?? [],
                        160,
                      )
                    : [];
                  const clipSilenceIntervals =
                    silencePreview?.clipSilences[clip.id] ?? [];
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
                      className={`group relative rounded-xl border p-3 transition cursor-pointer select-none min-w-[220px] overflow-hidden flex-grow ${
                        isSelected
                          ? "border-sky-400 bg-sky-500/15"
                          : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-100">{clip.id}</span>
                          <span
                            data-testid={`clip-badge-${clip.id}`}
                            className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300"
                          >
                            {clip.transform.fitMode} ·{" "}
                            {clip.transform.scale.toFixed(2)}×
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-sky-300">
                          {formatTimecodeMs(clip.timelineStartMs)} –{" "}
                          {formatTimecodeMs(clip.timelineEndMs)}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                        <span>
                          Source: {formatTimecodeMs(clip.sourceStartMs)} →{" "}
                          {formatTimecodeMs(clip.sourceEndMs)}
                        </span>
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            aria-label={`Move ${clip.id} earlier`}
                            disabled={clipIndex === 0}
                            onClick={() =>
                              handleReorderClip(clip.id, clipIndex - 1)
                            }
                            className="rounded border border-zinc-700 bg-zinc-800 p-1 text-zinc-200 hover:bg-zinc-700 disabled:opacity-30"
                          >
                            <ArrowLeft className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${clip.id} later`}
                            disabled={
                              clipIndex ===
                              editorState.timeline.clips.length - 1
                            }
                            onClick={() =>
                              handleReorderClip(clip.id, clipIndex + 1)
                            }
                            className="rounded border border-zinc-700 bg-zinc-800 p-1 text-zinc-200 hover:bg-zinc-700 disabled:opacity-30"
                          >
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Synchronized Audio Waveform & Shaded Silence Regions */}
                      <div
                        data-testid={`clip-waveform-${clip.id}`}
                        className="relative mt-2.5 h-10 rounded-lg bg-zinc-950/90 border border-zinc-800/80 py-1 flex items-center gap-[1px] overflow-hidden"
                      >
                        {clipSilenceIntervals.map((interval, idx) => (
                          <div
                            key={`${interval.sourceStartMs}-${interval.sourceEndMs}`}
                            data-testid={`clip-silence-region-${clip.id}-${idx}`}
                            style={{
                              left: `${(interval.startRatio * 100).toFixed(2)}%`,
                              width: `${((interval.endRatio - interval.startRatio) * 100).toFixed(2)}%`,
                            }}
                            className="pointer-events-none absolute inset-y-0 bg-rose-500/25 border-x border-rose-400/50"
                          />
                        ))}
                        {waveformBars.map((bar) => (
                          <div
                            key={bar.index}
                            data-waveform-bar={bar.isSilent ? "silent" : "speech"}
                            style={{
                              flexGrow: bar.durationMs,
                              flexBasis: 0,
                              height: `${Math.max(14, Math.round(bar.peak * 100))}%`,
                            }}
                            className={`min-w-0 rounded-full transition-all ${
                              bar.isSilent
                                ? "bg-rose-400/70"
                                : "bg-sky-400/85"
                            }`}
                          />
                        ))}
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
