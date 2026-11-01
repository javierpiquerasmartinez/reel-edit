import { describe, expect, test } from "vitest";
import { EditorSession } from "./index.js";

const DEFAULT_TRANSFORM = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  fitMode: "cover" as const,
};

describe("EditorSession", () => {
  test("initializes Timeline from Source Media with a single full-duration Clip spanning [0ms, sourceDurationMs]", () => {
    const session = EditorSession.fromSourceMedia({
      id: "source-1",
      fileName: "talking-head.mp4",
      durationMs: 12000,
      width: 1080,
      height: 1920,
    });

    const state = session.getState();
    expect(state.sourceMedia).toEqual({
      id: "source-1",
      fileName: "talking-head.mp4",
      durationMs: 12000,
      width: 1080,
      height: 1920,
    });
    expect(state.timeline.durationMs).toBe(12000);
    expect(state.timeline.clips).toEqual([
      {
        id: "clip-1",
        sourceStartMs: 0,
        sourceEndMs: 12000,
        timelineStartMs: 0,
        timelineEndMs: 12000,
        durationMs: 12000,
        transform: DEFAULT_TRANSFORM,
      },
    ]);
  });

  test("splitClip divides the active Clip at the playhead into two contiguous Clips referencing exact Source Time", () => {
    const session = EditorSession.fromSourceMedia({
      id: "source-1",
      fileName: "talking-head.mp4",
      durationMs: 10000,
      width: 1080,
      height: 1920,
    });

    const result = session.dispatch({
      type: "splitClip",
      timelineTimeMs: 4000,
    });

    expect(result.applied).toBe(true);
    const state = session.getState();
    expect(state.timeline.durationMs).toBe(10000);
    expect(state.timeline.clips).toEqual([
      {
        id: "clip-1",
        sourceStartMs: 0,
        sourceEndMs: 4000,
        timelineStartMs: 0,
        timelineEndMs: 4000,
        durationMs: 4000,
        transform: DEFAULT_TRANSFORM,
      },
      {
        id: "clip-2",
        sourceStartMs: 4000,
        sourceEndMs: 10000,
        timelineStartMs: 4000,
        timelineEndMs: 10000,
        durationMs: 6000,
        transform: DEFAULT_TRANSFORM,
      },
    ]);

    // Splitting right on an existing boundary or outside bounds should be rejected
    const boundaryAttempt = session.dispatch({
      type: "splitClip",
      timelineTimeMs: 4000,
    });
    expect(boundaryAttempt.applied).toBe(false);
    expect(session.getState().timeline.clips).toHaveLength(2);
  });

  test("deleteClips removes selected Clips with Ripple Delete and prevents deleting the last remaining Clip", () => {
    const session = EditorSession.fromSourceMedia({
      id: "source-1",
      fileName: "talking-head.mp4",
      durationMs: 12000,
      width: 1080,
      height: 1920,
    });

    // Split into 3 clips: [0..3000], [3000..7000], [7000..12000]
    session.dispatch({ type: "splitClip", timelineTimeMs: 3000 });
    session.dispatch({ type: "splitClip", timelineTimeMs: 7000 });

    const beforeDelete = session.getState().timeline.clips;
    expect(beforeDelete.map((c) => c.id)).toEqual(["clip-1", "clip-2", "clip-3"]);

    // Delete the middle clip (clip-2: 3000..7000)
    const deleteRes = session.dispatch({
      type: "deleteClips",
      clipIds: ["clip-2"],
    });
    expect(deleteRes.applied).toBe(true);

    // clip-3 (source 7000..12000) must ripple-shift to timeline [3000..8000]
    const afterDelete = session.getState();
    expect(afterDelete.timeline.durationMs).toBe(8000);
    expect(afterDelete.timeline.clips).toEqual([
      {
        id: "clip-1",
        sourceStartMs: 0,
        sourceEndMs: 3000,
        timelineStartMs: 0,
        timelineEndMs: 3000,
        durationMs: 3000,
        transform: DEFAULT_TRANSFORM,
      },
      {
        id: "clip-3",
        sourceStartMs: 7000,
        sourceEndMs: 12000,
        timelineStartMs: 3000,
        timelineEndMs: 8000,
        durationMs: 5000,
        transform: DEFAULT_TRANSFORM,
      },
    ]);

    // Attempting to delete all remaining clips must be rejected
    const deleteAllAttempt = session.dispatch({
      type: "deleteClips",
      clipIds: ["clip-1", "clip-3"],
    });
    expect(deleteAllAttempt.applied).toBe(false);
    expect(session.getState().timeline.clips).toHaveLength(2);
  });

  test("trimClip adjusts sourceStartMs or sourceEndMs within Source Media bounds and ripple-shifts downstream Clips", () => {
    const session = EditorSession.fromSourceMedia({
      id: "source-1",
      fileName: "talking-head.mp4",
      durationMs: 10000,
      width: 1080,
      height: 1920,
    });

    session.dispatch({ type: "splitClip", timelineTimeMs: 5000 });

    // Trim clip-1 to [1000..4000] (was [0..5000])
    const trimRes = session.dispatch({
      type: "trimClip",
      clipId: "clip-1",
      sourceStartMs: 1000,
      sourceEndMs: 4000,
    });
    expect(trimRes.applied).toBe(true);

    // Clamping check: trimming clip-2 beyond sourceDurationMs clamps to [5000..10000]
    session.dispatch({
      type: "trimClip",
      clipId: "clip-2",
      sourceStartMs: 5500,
      sourceEndMs: 15000,
    });

    const state = session.getState();
    // clip-1 has duration 3000 [0..3000], clip-2 has duration 4500 [3000..7500]
    expect(state.timeline.durationMs).toBe(7500);
    expect(state.timeline.clips).toEqual([
      {
        id: "clip-1",
        sourceStartMs: 1000,
        sourceEndMs: 4000,
        timelineStartMs: 0,
        timelineEndMs: 3000,
        durationMs: 3000,
        transform: DEFAULT_TRANSFORM,
      },
      {
        id: "clip-2",
        sourceStartMs: 5500,
        sourceEndMs: 10000,
        timelineStartMs: 3000,
        timelineEndMs: 7500,
        durationMs: 4500,
        transform: DEFAULT_TRANSFORM,
      },
    ]);

    // Invalid trim where sourceStartMs >= sourceEndMs is rejected
    const invalidTrim = session.dispatch({
      type: "trimClip",
      clipId: "clip-1",
      sourceStartMs: 4000,
      sourceEndMs: 4000,
    });
    expect(invalidTrim.applied).toBe(false);
  });

  test("supports multi-step Undo and Redo across splitClip, trimClip, and deleteClips", () => {
    const session = EditorSession.fromSourceMedia({
      id: "source-1",
      fileName: "talking-head.mp4",
      durationMs: 10000,
      width: 1080,
      height: 1920,
    });

    expect(session.getState().canUndo).toBe(false);
    expect(session.getState().canRedo).toBe(false);

    // Step 1: split at 4000ms -> clip-1 [0..4000], clip-2 [4000..10000]
    session.dispatch({ type: "splitClip", timelineTimeMs: 4000 });
    expect(session.getState().canUndo).toBe(true);

    // Step 2: trim clip-2 to [5000..9000] -> timeline duration 8000ms
    session.dispatch({
      type: "trimClip",
      clipId: "clip-2",
      sourceStartMs: 5000,
      sourceEndMs: 9000,
    });
    expect(session.getState().timeline.durationMs).toBe(8000);

    // Step 3: delete clip-1 -> only clip-2 remains at timeline [0..4000]
    session.dispatch({ type: "deleteClips", clipIds: ["clip-1"] });
    expect(session.getState().timeline.clips).toEqual([
      {
        id: "clip-2",
        sourceStartMs: 5000,
        sourceEndMs: 9000,
        timelineStartMs: 0,
        timelineEndMs: 4000,
        durationMs: 4000,
        transform: DEFAULT_TRANSFORM,
      },
    ]);

    // Undo Step 3 (deleteClips)
    expect(session.undo()).toBe(true);
    expect(session.getState().canRedo).toBe(true);
    expect(session.getState().timeline.durationMs).toBe(8000);
    expect(session.getState().timeline.clips.map((c) => c.id)).toEqual([
      "clip-1",
      "clip-2",
    ]);

    // Undo Step 2 (trimClip)
    expect(session.undo()).toBe(true);
    expect(session.getState().timeline.durationMs).toBe(10000);
    expect(session.getState().timeline.clips[1]?.sourceStartMs).toBe(4000);
    expect(session.getState().timeline.clips[1]?.sourceEndMs).toBe(10000);

    // Redo Step 2 (trimClip)
    expect(session.redo()).toBe(true);
    expect(session.getState().timeline.durationMs).toBe(8000);

    // Undo Step 2 and Step 1 back to initial state
    expect(session.undo()).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.getState().canUndo).toBe(false);
    expect(session.getState().timeline.clips).toEqual([
      {
        id: "clip-1",
        sourceStartMs: 0,
        sourceEndMs: 10000,
        timelineStartMs: 0,
        timelineEndMs: 10000,
        durationMs: 10000,
        transform: DEFAULT_TRANSFORM,
      },
    ]);

    // Dispatching a new command clears Redo history
    session.dispatch({ type: "splitClip", timelineTimeMs: 2500 });
    expect(session.getState().canRedo).toBe(false);
    expect(session.redo()).toBe(false);
  });

  test("setClipTransform updates framing (cover/contain) and Punch-in zoom/offset on one or more Clips and preserves transform across splits", () => {
    const session = EditorSession.fromSourceMedia({
      id: "source-1",
      fileName: "landscape-interview.mp4",
      durationMs: 9000,
      width: 1920,
      height: 1080,
    });

    session.dispatch({ type: "splitClip", timelineTimeMs: 3000 });
    session.dispatch({ type: "splitClip", timelineTimeMs: 6000 });

    // Switch all 3 clips to "contain" framing mode
    const fitRes = session.dispatch({
      type: "setClipTransform",
      clipIds: ["clip-1", "clip-2", "clip-3"],
      fitMode: "contain",
    });
    expect(fitRes.applied).toBe(true);
    expect(
      session.getState().timeline.clips.map((c) => c.transform.fitMode),
    ).toEqual(["contain", "contain", "contain"]);

    // Apply a Punch-in zoom (scale: 1.35, offsetX: -40, offsetY: 25) to clip-2 only
    const punchInRes = session.dispatch({
      type: "setClipTransform",
      clipIds: ["clip-2"],
      scale: 1.35,
      offsetX: -40,
      offsetY: 25,
    });
    expect(punchInRes.applied).toBe(true);

    const clipsAfterPunchIn = session.getState().timeline.clips;
    expect(clipsAfterPunchIn[0]?.transform).toEqual({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      fitMode: "contain",
    });
    expect(clipsAfterPunchIn[1]?.transform).toEqual({
      scale: 1.35,
      offsetX: -40,
      offsetY: 25,
      fitMode: "contain",
    });

    // Splitting a transformed Clip preserves its transform on both halves
    session.dispatch({ type: "splitClip", timelineTimeMs: 4500 });
    const afterSplit = session.getState().timeline.clips;
    expect(afterSplit[1]?.transform).toEqual({
      scale: 1.35,
      offsetX: -40,
      offsetY: 25,
      fitMode: "contain",
    });
    expect(afterSplit[2]?.transform).toEqual({
      scale: 1.35,
      offsetX: -40,
      offsetY: 25,
      fitMode: "contain",
    });
  });

  test("reorderClip moves a Clip to a new index and recalculates contiguous Timeline Time intervals without gaps", () => {
    const session = EditorSession.fromSourceMedia({
      id: "source-1",
      fileName: "talking-head.mp4",
      durationMs: 12000,
      width: 1080,
      height: 1920,
    });

    // Split into 3 clips: clip-1 [0..2000] (2s), clip-2 [2000..7000] (5s), clip-3 [7000..12000] (5s)
    session.dispatch({ type: "splitClip", timelineTimeMs: 2000 });
    session.dispatch({ type: "splitClip", timelineTimeMs: 7000 });

    // Move clip-3 (source [7000..12000], duration 5000ms) to index 0
    const reorderRes = session.dispatch({
      type: "reorderClip",
      clipId: "clip-3",
      targetIndex: 0,
    });
    expect(reorderRes.applied).toBe(true);

    const state = session.getState();
    expect(state.timeline.durationMs).toBe(12000);
    expect(state.timeline.clips).toEqual([
      {
        id: "clip-3",
        sourceStartMs: 7000,
        sourceEndMs: 12000,
        timelineStartMs: 0,
        timelineEndMs: 5000,
        durationMs: 5000,
        transform: DEFAULT_TRANSFORM,
      },
      {
        id: "clip-1",
        sourceStartMs: 0,
        sourceEndMs: 2000,
        timelineStartMs: 5000,
        timelineEndMs: 7000,
        durationMs: 2000,
        transform: DEFAULT_TRANSFORM,
      },
      {
        id: "clip-2",
        sourceStartMs: 2000,
        sourceEndMs: 7000,
        timelineStartMs: 7000,
        timelineEndMs: 12000,
        durationMs: 5000,
        transform: DEFAULT_TRANSFORM,
      },
    ]);

    // Reordering to the same index or out-of-bounds index is rejected
    expect(
      session.dispatch({
        type: "reorderClip",
        clipId: "clip-3",
        targetIndex: 0,
      }).applied,
    ).toBe(false);
    expect(
      session.dispatch({
        type: "reorderClip",
        clipId: "clip-3",
        targetIndex: 5,
      }).applied,
    ).toBe(false);
  });

  test("duplicateClipAsHook inserts a duplicated Hook Clip at 0ms Timeline Time, shifts existing Clips forward, and supports Undo/Redo across transform, reorder, and Hook operations", () => {
    const session = EditorSession.fromSourceMedia({
      id: "source-1",
      fileName: "podcast-reel.mp4",
      durationMs: 10000,
      width: 1920,
      height: 1080,
    });

    // Split into clip-1 [0..4000] and clip-2 [4000..10000]
    session.dispatch({ type: "splitClip", timelineTimeMs: 4000 });

    // Apply Punch-in and contain framing to clip-2
    session.dispatch({
      type: "setClipTransform",
      clipIds: ["clip-2"],
      fitMode: "contain",
      scale: 1.25,
      offsetX: 15,
      offsetY: -20,
    });

    // Promote a 2500ms high-impact Clip range [6000..8500] from clip-2 to 0ms Timeline Time as an opening Hook
    const hookRes = session.dispatch({
      type: "duplicateClipAsHook",
      sourceStartMs: 6000,
      sourceEndMs: 8500,
    });
    expect(hookRes.applied).toBe(true);

    const afterHook = session.getState();
    expect(afterHook.timeline.durationMs).toBe(12500);
    expect(afterHook.timeline.clips).toEqual([
      {
        id: "clip-3",
        sourceStartMs: 6000,
        sourceEndMs: 8500,
        timelineStartMs: 0,
        timelineEndMs: 2500,
        durationMs: 2500,
        transform: {
          scale: 1.25,
          offsetX: 15,
          offsetY: -20,
          fitMode: "contain",
        },
      },
      {
        id: "clip-1",
        sourceStartMs: 0,
        sourceEndMs: 4000,
        timelineStartMs: 2500,
        timelineEndMs: 6500,
        durationMs: 4000,
        transform: DEFAULT_TRANSFORM,
      },
      {
        id: "clip-2",
        sourceStartMs: 4000,
        sourceEndMs: 10000,
        timelineStartMs: 6500,
        timelineEndMs: 12500,
        durationMs: 6000,
        transform: {
          scale: 1.25,
          offsetX: 15,
          offsetY: -20,
          fitMode: "contain",
        },
      },
    ]);

    // Reorder clip-2 before clip-1 (index 1)
    session.dispatch({
      type: "reorderClip",
      clipId: "clip-2",
      targetIndex: 1,
    });
    expect(session.getState().timeline.clips.map((c) => c.id)).toEqual([
      "clip-3",
      "clip-2",
      "clip-1",
    ]);

    // Undo reorderClip -> back to [clip-3, clip-1, clip-2]
    expect(session.undo()).toBe(true);
    expect(session.getState().timeline.clips.map((c) => c.id)).toEqual([
      "clip-3",
      "clip-1",
      "clip-2",
    ]);

    // Undo duplicateClipAsHook -> back to [clip-1, clip-2] with duration 10000ms
    expect(session.undo()).toBe(true);
    expect(session.getState().timeline.durationMs).toBe(10000);
    expect(session.getState().timeline.clips.map((c) => c.id)).toEqual([
      "clip-1",
      "clip-2",
    ]);

    // Undo setClipTransform -> clip-2 returns to DEFAULT_TRANSFORM
    expect(session.undo()).toBe(true);
    expect(session.getState().timeline.clips[1]?.transform).toEqual(
      DEFAULT_TRANSFORM,
    );

    // Redo all three operations
    expect(session.redo()).toBe(true);
    expect(session.redo()).toBe(true);
    expect(session.redo()).toBe(true);
    expect(session.getState().timeline.durationMs).toBe(12500);
    expect(session.getState().timeline.clips.map((c) => c.id)).toEqual([
      "clip-3",
      "clip-2",
      "clip-1",
    ]);
    expect(session.getState().timeline.clips[0]?.transform.scale).toBe(1.25);
  });

  test("removeSilences splits active Clips around detected Silence Regions with speech padding, applies Ripple Delete, and reverts in a single Undo step", () => {
    // 100 buckets of 100ms = 10000ms total
    const peaks = Array.from({ length: 100 }, (_, index) => {
      const timeMs = index * 100;
      // Silence 1: [2000..3600ms] (1600ms)
      if (timeMs >= 2000 && timeMs < 3600) {
        return 0.002;
      }
      // Brief pause below minDurationMs: [5000..5300ms] (300ms)
      if (timeMs >= 5000 && timeMs < 5300) {
        return 0.002;
      }
      // Silence 2: [6500..8500ms] (2000ms)
      if (timeMs >= 6500 && timeMs < 8500) {
        return 0.001;
      }
      return 0.6;
    });

    const session = EditorSession.fromSourceMedia(
      {
        id: "source-1",
        fileName: "talking-head.mp4",
        durationMs: 10000,
        width: 1080,
        height: 1920,
      },
      {
        audioEnvelope: {
          bucketDurationMs: 100,
          durationMs: 10000,
          peaks,
        },
      },
    );

    const res = session.dispatch({
      type: "removeSilences",
      thresholdDb: -35,
      minDurationMs: 500,
      paddingMs: 150,
    });
    expect(res.applied).toBe(true);

    const afterRemove = session.getState();
    // Silence 1 padded: [2150..3450] (1300ms removed)
    // Silence 2 padded: [6650..8350] (1700ms removed)
    // Remaining clips: [0..2150], [3450..6650], [8350..10000] -> total 7000ms
    expect(afterRemove.timeline.durationMs).toBe(7000);
    expect(afterRemove.timeline.clips).toEqual([
      {
        id: "clip-1",
        sourceStartMs: 0,
        sourceEndMs: 2150,
        timelineStartMs: 0,
        timelineEndMs: 2150,
        durationMs: 2150,
        transform: DEFAULT_TRANSFORM,
      },
      {
        id: "clip-2",
        sourceStartMs: 3450,
        sourceEndMs: 6650,
        timelineStartMs: 2150,
        timelineEndMs: 5350,
        durationMs: 3200,
        transform: DEFAULT_TRANSFORM,
      },
      {
        id: "clip-3",
        sourceStartMs: 8350,
        sourceEndMs: 10000,
        timelineStartMs: 5350,
        timelineEndMs: 7000,
        durationMs: 1650,
        transform: DEFAULT_TRANSFORM,
      },
    ]);

    // Single Undo step restores exact prior 1-Clip Timeline [0..10000ms]
    expect(session.undo()).toBe(true);
    expect(session.getState().timeline.durationMs).toBe(10000);
    expect(session.getState().timeline.clips).toEqual([
      {
        id: "clip-1",
        sourceStartMs: 0,
        sourceEndMs: 10000,
        timelineStartMs: 0,
        timelineEndMs: 10000,
        durationMs: 10000,
        transform: DEFAULT_TRANSFORM,
      },
    ]);

    // Single Redo step re-applies removeSilences
    expect(session.redo()).toBe(true);
    expect(session.getState().timeline.durationMs).toBe(7000);
    expect(session.getState().timeline.clips).toHaveLength(3);
  });
});
