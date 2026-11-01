import { describe, expect, test } from "vitest";
import { EditorSession } from "@reel-edit/editor-core";
import { evaluatePlaybackStep, resolveFrameLayout } from "./index.js";

describe("media-engine 9:16 frame compositor descriptor", () => {
  test("resolves active Clip and maps Timeline Time to exact Source Time across adjacent Clips without gaps", () => {
    const session = EditorSession.fromSourceMedia({
      id: "source-1",
      fileName: "demo.mp4",
      durationMs: 12000,
      width: 1080,
      height: 1920,
    });

    // Split into [0..3000], [3000..7000], [7000..12000] and ripple-delete middle clip
    session.dispatch({ type: "splitClip", timelineTimeMs: 3000 });
    session.dispatch({ type: "splitClip", timelineTimeMs: 7000 });
    session.dispatch({ type: "deleteClips", clipIds: ["clip-2"] });

    const state = session.getState();

    // Inside first clip at 1500ms Timeline Time -> 1500ms Source Time
    const frameAt1500 = resolveFrameLayout(state, 1500);
    expect(frameAt1500.activeClip.id).toBe("clip-1");
    expect(frameAt1500.sourceTimeMs).toBe(1500);

    // Exactly at clip transition boundary (3000ms Timeline Time) -> transitions immediately to clip-3 at 7000ms Source Time
    const frameAtBoundary = resolveFrameLayout(state, 3000);
    expect(frameAtBoundary.activeClip.id).toBe("clip-3");
    expect(frameAtBoundary.sourceTimeMs).toBe(7000);

    // Inside second clip (4200ms Timeline Time) -> 8200ms Source Time
    const frameAt4200 = resolveFrameLayout(state, 4200);
    expect(frameAt4200.activeClip.id).toBe("clip-3");
    expect(frameAt4200.sourceTimeMs).toBe(8200);

    // At end of Timeline (8000ms Timeline Time) -> holds last Clip at 12000ms Source Time (never blank)
    const frameAtEnd = resolveFrameLayout(state, 8000);
    expect(frameAtEnd.activeClip.id).toBe("clip-3");
    expect(frameAtEnd.sourceTimeMs).toBe(12000);
  });

  test("computes 9:16 Safe Area overlay boundaries when enabled", () => {
    const session = EditorSession.fromSourceMedia({
      id: "source-1",
      fileName: "demo.mp4",
      durationMs: 5000,
      width: 1920,
      height: 1080,
    });

    const hiddenSafeArea = resolveFrameLayout(session.getState(), 1000, {
      showSafeArea: false,
    });
    expect(hiddenSafeArea.safeArea).toBeNull();

    const visibleSafeArea = resolveFrameLayout(session.getState(), 1000, {
      showSafeArea: true,
      canvasWidth: 1080,
      canvasHeight: 1920,
    });
    expect(visibleSafeArea.safeArea).not.toBeNull();
    expect(visibleSafeArea.safeArea?.safeRect).toEqual({
      x: 64,
      y: 220,
      width: 840,
      height: 1280,
    });
    expect(visibleSafeArea.safeArea?.zones.map((z) => z.id)).toEqual([
      "top-header",
      "right-actions",
      "bottom-details",
    ]);
  });

  test("evaluatePlaybackStep transitions smoothly across contiguous splits without seeking and seeks across ripple-deleted gaps", () => {
    const session = EditorSession.fromSourceMedia({
      id: "source-1",
      fileName: "demo.mp4",
      durationMs: 12000,
      width: 1080,
      height: 1920,
    });

    // Split into clip-1 [0..3000], clip-2 [3000..6000], clip-3 [6000..9000], clip-4 [9000..12000]
    session.dispatch({ type: "splitClip", timelineTimeMs: 3000 });
    session.dispatch({ type: "splitClip", timelineTimeMs: 6000 });
    session.dispatch({ type: "splitClip", timelineTimeMs: 9000 });
    // Ripple-delete clip-3 [6000..9000]
    session.dispatch({ type: "deleteClips", clipIds: ["clip-3"] });

    const state = session.getState();

    // Contiguous transition: clip-1 [0..3000] -> clip-2 [3000..6000] requires no video seek
    const contiguousStep = evaluatePlaybackStep(state, "clip-1", 3010);
    expect(contiguousStep).toEqual({
      activeClipId: "clip-2",
      timelineTimeMs: 3010,
      seekToSourceMs: null,
      reachedEnd: false,
    });

    // Discontiguous transition after Ripple Delete: clip-2 [source 3000..6000] -> clip-4 [source 9000..12000, timeline 6000..9000]
    const jumpStep = evaluatePlaybackStep(state, "clip-2", 6005);
    expect(jumpStep).toEqual({
      activeClipId: "clip-4",
      timelineTimeMs: 6000,
      seekToSourceMs: 9000,
      reachedEnd: false,
    });

    // End of timeline
    const endStep = evaluatePlaybackStep(state, "clip-4", 12000);
    expect(endStep).toEqual({
      activeClipId: "clip-4",
      timelineTimeMs: 9000,
      seekToSourceMs: null,
      reachedEnd: true,
    });
  });
});
