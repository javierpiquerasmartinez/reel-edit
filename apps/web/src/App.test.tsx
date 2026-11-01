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
});
