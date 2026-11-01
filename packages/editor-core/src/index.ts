import { z } from "zod";

export interface SourceMedia {
  readonly id: string;
  readonly fileName: string;
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
}

export interface Clip {
  readonly id: string;
  readonly sourceStartMs: number;
  readonly sourceEndMs: number;
  readonly timelineStartMs: number;
  readonly timelineEndMs: number;
  readonly durationMs: number;
}

export interface Timeline {
  readonly clips: readonly Clip[];
  readonly durationMs: number;
}

export interface EditorState {
  readonly sourceMedia: SourceMedia;
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

export const EditCommandSchema = z.discriminatedUnion("type", [
  SplitClipCommandSchema,
  DeleteClipsCommandSchema,
  TrimClipCommandSchema,
]);

export type SplitClipCommand = z.infer<typeof SplitClipCommandSchema>;
export type DeleteClipsCommand = z.infer<typeof DeleteClipsCommandSchema>;
export type TrimClipCommand = z.infer<typeof TrimClipCommandSchema>;
export type EditCommand = z.infer<typeof EditCommandSchema>;

export interface DispatchResult {
  readonly applied: boolean;
  readonly reason?: string;
}

interface SourceClipRange {
  readonly id: string;
  readonly sourceStartMs: number;
  readonly sourceEndMs: number;
}

interface HistorySnapshot {
  readonly clips: readonly SourceClipRange[];
  readonly nextClipCounter: number;
}

function projectTimeline(sourceClips: readonly SourceClipRange[]): Timeline {
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
    };
  });
  return {
    clips,
    durationMs: cursorMs,
  };
}

export class EditorSession {
  private readonly sourceMedia: SourceMedia;
  private clips: readonly SourceClipRange[];
  private nextClipCounter = 2;
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];
  private listeners = new Set<() => void>();

  private constructor(sourceMedia: SourceMedia) {
    if (sourceMedia.durationMs <= 0) {
      throw new Error("Source Media durationMs must be greater than 0");
    }
    this.sourceMedia = Object.freeze({ ...sourceMedia });
    this.clips = [
      {
        id: "clip-1",
        sourceStartMs: 0,
        sourceEndMs: sourceMedia.durationMs,
      },
    ];
  }

  static fromSourceMedia(sourceMedia: SourceMedia): EditorSession {
    return new EditorSession(sourceMedia);
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
      clips: this.clips.map((c) => ({ ...c })),
      nextClipCounter: this.nextClipCounter,
    };
  }

  private commitClips(
    snapshotBefore: HistorySnapshot,
    nextClips: readonly SourceClipRange[],
  ): DispatchResult {
    this.undoStack.push(snapshotBefore);
    this.redoStack = [];
    this.clips = nextClips;
    this.notify();
    return { applied: true };
  }

  getState(): EditorState {
    return {
      sourceMedia: this.sourceMedia,
      timeline: projectTimeline(this.clips),
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
      };
      const secondHalf: SourceClipRange = {
        id: `clip-${this.nextClipCounter++}`,
        sourceStartMs: splitSourceMs,
        sourceEndMs: target.sourceEndMs,
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

    const clipIndex = this.clips.findIndex((c) => c.id === parsed.clipId);
    if (clipIndex === -1) {
      return {
        applied: false,
        reason: `Clip ${parsed.clipId} not found`,
      };
    }

    const target = this.clips[clipIndex]!;
    const requestedStartMs = parsed.sourceStartMs ?? target.sourceStartMs;
    const requestedEndMs = parsed.sourceEndMs ?? target.sourceEndMs;
    const clampedStart = Math.max(
      0,
      Math.min(this.sourceMedia.durationMs, requestedStartMs),
    );
    const clampedEnd = Math.max(
      0,
      Math.min(this.sourceMedia.durationMs, requestedEndMs),
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
    this.nextClipCounter = next.nextClipCounter;
    this.notify();
    return true;
  }
}
