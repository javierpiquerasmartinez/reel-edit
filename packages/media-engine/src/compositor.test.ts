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

  test("computes cover and contain framing rects for both 16:9 horizontal and 9:16 vertical Source Media", () => {
    const horizontalSession = EditorSession.fromSourceMedia({
      id: "source-h",
      fileName: "landscape-16x9.mp4",
      durationMs: 8000,
      width: 1920,
      height: 1080,
    });

    // Default cover framing on 1920x1080 source into 1080x1920 canvas
    const coverHorizontal = resolveFrameLayout(horizontalSession.getState(), 1000);
    expect(coverHorizontal.transform.fitMode).toBe("cover");
    expect(coverHorizontal.drawRect).toEqual({
      x: -1166,
      y: 0,
      width: 3413,
      height: 1920,
    });
    expect(coverHorizontal.backdropRect).toBeNull();

    // Switch to contain framing on 1920x1080 source into 1080x1920 canvas
    horizontalSession.dispatch({
      type: "setClipTransform",
      clipIds: ["clip-1"],
      fitMode: "contain",
    });
    const containHorizontal = resolveFrameLayout(
      horizontalSession.getState(),
      1000,
    );
    expect(containHorizontal.transform.fitMode).toBe("contain");
    expect(containHorizontal.drawRect).toEqual({
      x: 0,
      y: 656,
      width: 1080,
      height: 608,
    });
    expect(containHorizontal.backdropRect).toEqual({
      x: -1166,
      y: 0,
      width: 3413,
      height: 1920,
    });

    // Vertical 9:16 source (1080x1920) fills 1080x1920 in both cover and contain modes at 1.0x scale
    const verticalSession = EditorSession.fromSourceMedia({
      id: "source-v",
      fileName: "vertical-9x16.mp4",
      durationMs: 8000,
      width: 1080,
      height: 1920,
    });
    expect(resolveFrameLayout(verticalSession.getState(), 500).drawRect).toEqual({
      x: 0,
      y: 0,
      width: 1080,
      height: 1920,
    });
    verticalSession.dispatch({
      type: "setClipTransform",
      clipIds: ["clip-1"],
      fitMode: "contain",
    });
    expect(resolveFrameLayout(verticalSession.getState(), 500).drawRect).toEqual({
      x: 0,
      y: 0,
      width: 1080,
      height: 1920,
    });
  });

  test("applies Punch-in zoom (scale, offsetX, offsetY) and reflects Hook and reorder operations at the compositor seam", () => {
    const session = EditorSession.fromSourceMedia({
      id: "source-1",
      fileName: "talking-head.mp4",
      durationMs: 10000,
      width: 1080,
      height: 1920,
    });

    // Split at 4000ms -> clip-1 [0..4000], clip-2 [4000..10000]
    session.dispatch({ type: "splitClip", timelineTimeMs: 4000 });

    // Apply Punch-in zoom (scale: 1.5, offsetX: -40, offsetY: 60) to clip-2
    session.dispatch({
      type: "setClipTransform",
      clipIds: ["clip-2"],
      scale: 1.5,
      offsetX: -40,
      offsetY: 60,
    });

    // At 5000ms Timeline Time (inside clip-2), drawRect reflects 1.5x scale and pan offsets
    const zoomedLayout = resolveFrameLayout(session.getState(), 5000);
    expect(zoomedLayout.activeClip.id).toBe("clip-2");
    expect(zoomedLayout.drawRect).toEqual({
      x: -310,
      y: -420,
      width: 1620,
      height: 2880,
    });

    // Promote [7000..9000] from clip-2 as an opening Hook at 0ms Timeline Time
    session.dispatch({
      type: "duplicateClipAsHook",
      sourceStartMs: 7000,
      sourceEndMs: 9000,
    });

    // At 500ms Timeline Time, compositor resolves the Hook clip (clip-3) at 7500ms Source Time with inherited Punch-in
    const hookLayout = resolveFrameLayout(session.getState(), 500);
    expect(hookLayout.activeClip.id).toBe("clip-3");
    expect(hookLayout.sourceTimeMs).toBe(7500);
    expect(hookLayout.drawRect).toEqual({
      x: -310,
      y: -420,
      width: 1620,
      height: 2880,
    });
  });
});
