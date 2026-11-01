import { describe, expect, test } from "vitest";
import { EditorSession } from "./index.js";

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
      },
      {
        id: "clip-2",
        sourceStartMs: 4000,
        sourceEndMs: 10000,
        timelineStartMs: 4000,
        timelineEndMs: 10000,
        durationMs: 6000,
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
      },
      {
        id: "clip-3",
        sourceStartMs: 7000,
        sourceEndMs: 12000,
        timelineStartMs: 3000,
        timelineEndMs: 8000,
        durationMs: 5000,
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
      },
      {
        id: "clip-2",
        sourceStartMs: 5500,
        sourceEndMs: 10000,
        timelineStartMs: 3000,
        timelineEndMs: 7500,
        durationMs: 4500,
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
      },
    ]);

    // Dispatching a new command clears Redo history
    session.dispatch({ type: "splitClip", timelineTimeMs: 2500 });
    expect(session.getState().canRedo).toBe(false);
    expect(session.redo()).toBe(false);
  });
});
