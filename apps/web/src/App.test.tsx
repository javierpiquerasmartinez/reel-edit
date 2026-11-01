import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App.js";

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Reel Edit Web Workspace (Issue 01)", () => {
  test("imports local Source Media, renders 9:16 player with Safe Area toggle, zooms Timeline, and performs split, trim, multi-clip Ripple Delete, Undo, and Redo", () => {
    render(<App />);

    // 1. Import a local Source Media video file
    const fileInput = screen.getByLabelText(/import source media/i);
    const fakeVideoFile = new File(["video-bytes"], "creator-reel.mp4", {
      type: "video/mp4",
    });
    fireEvent.change(fileInput, { target: { files: [fakeVideoFile] } });

    // Verify Source Media is registered and Timeline has 1 full-duration Clip [0ms, 12000ms]
    expect(screen.getByText("creator-reel.mp4")).toBeDefined();
    expect(screen.getByTestId("timeline-clip-clip-1")).toBeDefined();
    expect(screen.getByTestId("timeline-duration").textContent).toBe("00:12.000");

    // 2. Toggle Safe Area overlay on the 9:16 player
    const safeAreaToggle = screen.getByRole("button", { name: /safe area/i });
    expect(safeAreaToggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(safeAreaToggle);
    expect(safeAreaToggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("safe-area-indicator")).toBeDefined();

    // 3. Adjust horizontal Timeline zoom and scrub playhead to millisecond-accurate 3250ms, then split
    const zoomSlider = screen.getByLabelText(/timeline zoom/i);
    fireEvent.change(zoomSlider, { target: { value: "2" } });

    const scrubber = screen.getByLabelText(/timeline playhead/i);
    fireEvent.change(scrubber, { target: { value: "3250" } });
    expect(screen.getByTestId("playhead-time").textContent).toBe("00:03.250");
    fireEvent.keyDown(window, { key: "s" });

    // Scrub to 7000ms and split again so we have 3 clips: clip-1, clip-2, clip-3
    fireEvent.change(scrubber, { target: { value: "7000" } });
    fireEvent.keyDown(window, { key: "s" });
    expect(screen.getByTestId("timeline-clip-clip-1")).toBeDefined();
    expect(screen.getByTestId("timeline-clip-clip-2")).toBeDefined();
    expect(screen.getByTestId("timeline-clip-clip-3")).toBeDefined();

    // 4. Trim clip-3's end handle on the Timeline from 12000ms to 10000ms
    const clip3EndTrim = screen.getByLabelText(/trim end clip-3/i);
    fireEvent.change(clip3EndTrim, { target: { value: "10000" } });
    expect(screen.getByTestId("timeline-duration").textContent).toBe("00:10.000");

    // 5. Multi-select clip-1 and clip-2 (Click clip-1, Shift+Click clip-2) and delete both with Ripple Delete
    fireEvent.click(screen.getByTestId("timeline-clip-clip-1"));
    fireEvent.click(screen.getByTestId("timeline-clip-clip-2"), {
      shiftKey: true,
    });
    fireEvent.keyDown(window, { key: "Delete" });

    // clip-1 and clip-2 are removed; clip-3 [source 7000..10000] ripple-shifts to timeline [0..3000]
    expect(screen.queryByTestId("timeline-clip-clip-1")).toBeNull();
    expect(screen.queryByTestId("timeline-clip-clip-2")).toBeNull();
    expect(screen.getByTestId("timeline-clip-clip-3")).toBeDefined();
    expect(screen.getByTestId("timeline-duration").textContent).toBe("00:03.000");

    // Attempting to delete the last remaining clip (clip-3) is prevented
    fireEvent.click(screen.getByTestId("timeline-clip-clip-3"));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(screen.getByTestId("timeline-clip-clip-3")).toBeDefined();

    // 6. Step backward with Undo (Cmd+Z) and forward with Redo (Cmd+Shift+Z)
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(screen.getByTestId("timeline-clip-clip-1")).toBeDefined();
    expect(screen.getByTestId("timeline-clip-clip-2")).toBeDefined();
    expect(screen.getByTestId("timeline-duration").textContent).toBe("00:10.000");

    fireEvent.keyDown(window, { key: "z", metaKey: true, shiftKey: true });
    expect(screen.queryByTestId("timeline-clip-clip-1")).toBeNull();
    expect(screen.queryByTestId("timeline-clip-clip-2")).toBeNull();
    expect(screen.getByTestId("timeline-duration").textContent).toBe("00:03.000");
  });

  test("switches Clip framing (cover/contain), applies Punch-in zoom and offsets, reorders Clips, and promotes an opening Hook with Undo/Redo", () => {
    render(<App />);

    const fileInput = screen.getByLabelText(/import source media/i);
    const fakeVideoFile = new File(["video-bytes"], "interview.mp4", {
      type: "video/mp4",
    });
    fireEvent.change(fileInput, { target: { files: [fakeVideoFile] } });

    // Split into 2 clips at 4000ms: clip-1 [0..4000] and clip-2 [4000..12000]
    const scrubber = screen.getByLabelText(/timeline playhead/i);
    fireEvent.change(scrubber, { target: { value: "4000" } });
    fireEvent.keyDown(window, { key: "s" });

    // Select clip-2 and switch framing to "contain"
    fireEvent.click(screen.getByTestId("timeline-clip-clip-2"));
    fireEvent.click(screen.getByRole("button", { name: /^contain$/i }));
    expect(screen.getByTestId("clip-badge-clip-2").textContent).toContain(
      "contain",
    );

    // Apply Punch-in zoom (scale 1.35, offsetX -30, offsetY 20) to selected clip-2
    fireEvent.change(screen.getByLabelText(/punch-in scale/i), {
      target: { value: "1.35" },
    });
    fireEvent.change(screen.getByLabelText(/offset x/i), {
      target: { value: "-30" },
    });
    fireEvent.change(screen.getByLabelText(/offset y/i), {
      target: { value: "20" },
    });
    expect(screen.getByTestId("clip-badge-clip-2").textContent).toContain(
      "1.35×",
    );

    // Reorder clip-2 earlier on the Timeline (to index 0)
    fireEvent.click(screen.getByRole("button", { name: /move clip-2 earlier/i }));
    const reorderedClips = screen.getAllByTestId(/^timeline-clip-clip-/);
    expect(reorderedClips.map((el) => el.getAttribute("data-testid"))).toEqual([
      "timeline-clip-clip-2",
      "timeline-clip-clip-1",
    ]);

    // Select clip-1 and promote it as an opening Hook at 0ms Timeline Time
    fireEvent.click(screen.getByTestId("timeline-clip-clip-1"));
    fireEvent.click(
      screen.getByRole("button", { name: /promote as opening hook/i }),
    );

    // Hook clip-3 (duration 4000ms) is inserted at index 0 -> total duration becomes 16000ms
    expect(screen.getByTestId("timeline-duration").textContent).toBe("00:16.000");
    const clipsAfterHook = screen.getAllByTestId(/^timeline-clip-clip-/);
    expect(clipsAfterHook.map((el) => el.getAttribute("data-testid"))).toEqual([
      "timeline-clip-clip-3",
      "timeline-clip-clip-2",
      "timeline-clip-clip-1",
    ]);

    // Undo Hook promotion -> duration returns to 12000ms
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(screen.getByTestId("timeline-duration").textContent).toBe("00:12.000");
    expect(screen.queryByTestId("timeline-clip-clip-3")).toBeNull();
  });
});
