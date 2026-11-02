import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App.js";

function createTestAudioBufferChannel(): Float32Array {
  // 12 seconds at 100 Hz = 1200 samples
  const samples = new Float32Array(1200);
  for (let i = 0; i < samples.length; i++) {
    const timeMs = i * 10;
    if (timeMs >= 2400 && timeMs < 4200) {
      samples[i] = 0.002;
    } else if (timeMs >= 5800 && timeMs < 6100) {
      samples[i] = 0.005;
    } else if (timeMs >= 7800 && timeMs < 9600) {
      samples[i] = 0.001;
    } else {
      samples[i] = 0.65;
    }
  }
  return samples;
}

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

  const channelData = createTestAudioBufferChannel();
  (
    globalThis as unknown as {
      AudioContext?: unknown;
    }
  ).AudioContext = class MockAudioContext {
    async decodeAudioData() {
      return {
        duration: 12,
        sampleRate: 100,
        numberOfChannels: 1,
        getChannelData: () => channelData,
      };
    }
    async close() {}
  };
});

afterEach(() => {
  cleanup();
  delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
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

  test("renders audio waveform with shaded Silence Regions on Timeline Clips, recalculates cuts and time saved when adjusting thresholdDb/minDurationMs/paddingMs, and executes reversible removeSilences", async () => {
    render(<App />);

    const fileInput = screen.getByLabelText(/import source media/i);
    const fakeVideoFile = new File(["video-bytes"], "talking-head.mp4", {
      type: "video/mp4",
    });
    fireEvent.change(fileInput, { target: { files: [fakeVideoFile] } });

    // Wait for Web Audio API decodeAudioData to populate the waveform and shaded Silence Regions inside clip-1
    await waitFor(() => {
      expect(
        screen.getAllByTestId(/^clip-silence-region-clip-1-/),
      ).toHaveLength(2);
    });
    const clip1Waveform = screen.getByTestId("clip-waveform-clip-1");
    expect(clip1Waveform).toBeDefined();
    expect(
      clip1Waveform.querySelectorAll("[data-waveform-bar]").length,
    ).toBeGreaterThan(10);
    expect(screen.getByTestId("silence-preview-summary").textContent).toContain(
      "2 cuts · 3.1s saved",
    );

    // Adjust minDurationMs to 250ms and paddingMs to 50ms -> catches the 300ms pause as a 3rd Silence Region
    fireEvent.change(screen.getByLabelText(/min silence duration/i), {
      target: { value: "250" },
    });
    fireEvent.change(screen.getByLabelText(/speech padding/i), {
      target: { value: "50" },
    });
    expect(
      screen.getAllByTestId(/^clip-silence-region-clip-1-/),
    ).toHaveLength(3);
    expect(screen.getByTestId("silence-preview-summary").textContent).toContain(
      "3 cuts · 3.6s saved",
    );

    // Adjust to thresholdDb = -35, minDurationMs = 500, paddingMs = 100 -> 2 cuts saving 3200ms (3.2s)
    fireEvent.change(screen.getByLabelText(/silence threshold/i), {
      target: { value: "-35" },
    });
    fireEvent.change(screen.getByLabelText(/min silence duration/i), {
      target: { value: "500" },
    });
    fireEvent.change(screen.getByLabelText(/speech padding/i), {
      target: { value: "100" },
    });
    expect(screen.getByTestId("silence-preview-summary").textContent).toContain(
      "2 cuts · 3.2s saved",
    );

    // Execute removeSilences -> splits clip-1 around the 2 Silence Regions and Ripple-Deletes silent intervals
    fireEvent.click(screen.getByRole("button", { name: /remove silences/i }));

    // Timeline duration decreases from 12.000s to 8.800s across 3 contiguous Clips
    expect(screen.getByTestId("timeline-duration").textContent).toBe("00:08.800");
    expect(screen.getByTestId("timeline-clip-clip-1")).toBeDefined();
    expect(screen.getByTestId("timeline-clip-clip-2")).toBeDefined();
    expect(screen.getByTestId("timeline-clip-clip-3")).toBeDefined();

    // Each split Clip renders its own corresponding slice of the audio waveform
    expect(screen.getByTestId("clip-waveform-clip-1")).toBeDefined();
    expect(screen.getByTestId("clip-waveform-clip-2")).toBeDefined();
    expect(screen.getByTestId("clip-waveform-clip-3")).toBeDefined();
    expect(screen.getByTestId("silence-preview-summary").textContent).toContain(
      "0 cuts · 0.0s saved",
    );

    // Single Undo step restores the exact prior 1-Clip Timeline [0..12000ms]
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(screen.getByTestId("timeline-duration").textContent).toBe("00:12.000");
    expect(screen.getByTestId("timeline-clip-clip-1")).toBeDefined();
    expect(screen.queryByTestId("timeline-clip-clip-2")).toBeNull();
    expect(screen.queryByTestId("timeline-clip-clip-3")).toBeNull();
    expect(screen.getByTestId("silence-preview-summary").textContent).toContain(
      "2 cuts · 3.2s saved",
    );
  });

  test("transcribes 16kHz mono audio (local Whisper and OpenAI whisper-1), projects Source-Time Captions onto 9:16 player, seeks on word click, edits word text via updateWords, and Ripple-Deletes video via deleteWordRange with Undo/Redo", async () => {
    render(<App />);

    // 1. Import Source Media
    const fileInput = screen.getByLabelText(/import source media/i);
    const fakeVideoFile = new File(["video-bytes"], "scripted-reel.mp4", {
      type: "video/mp4",
    });
    fireEvent.change(fileInput, { target: { files: [fakeVideoFile] } });

    // 2. Transcribe using built-in Local Browser Whisper without any API key
    const transcribeBtn = screen.getByRole("button", {
      name: /transcribe audio/i,
    });
    fireEvent.click(transcribeBtn);

    await waitFor(() => {
      expect(screen.getByTestId("transcription-badge").textContent).toContain(
        "16kHz Mono",
      );
    });
    expect(
      screen.getAllByTestId(/^transcript-word-/).length,
    ).toBeGreaterThan(3);

    // 3. Switch to OpenAI whisper-1 with API key and re-transcribe to verify hybrid provider
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          words: [
            { word: "Hook", start: 0.4, end: 0.9 },
            { word: "viewers", start: 1.0, end: 1.6 },
            { word: "fast.", start: 1.7, end: 2.3 },
            { word: "Um", start: 3.0, end: 3.5 },
            { word: "wrong", start: 3.6, end: 4.2 },
            { word: "take.", start: 4.3, end: 5.0 },
            { word: "Ship", start: 6.0, end: 6.6 },
            { word: "your", start: 6.7, end: 7.2 },
            { word: "reel!", start: 7.3, end: 8.0 },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    fireEvent.change(screen.getByLabelText(/transcription provider/i), {
      target: { value: "openai" },
    });
    fireEvent.change(screen.getByLabelText(/openai api key/i), {
      target: { value: "sk-live-whisper-key" },
    });
    fireEvent.click(transcribeBtn);

    await waitFor(() => {
      expect(screen.getByTestId("transcript-word-word-1").textContent).toContain(
        "Hook",
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 4. Click word-7 ("Ship" at 6000ms Source Time / 6000ms Timeline Time) -> seeks playhead to 00:06.000
    fireEvent.click(screen.getByTestId("transcript-word-word-7"));
    expect(screen.getByTestId("playhead-time").textContent).toBe("00:06.000");
    expect(screen.getByTestId("active-caption-overlay").textContent).toContain(
      "Ship your reel!",
    );

    // 5. Edit word-9 text ("reel!" -> "Reels!") via updateWords without altering Word Timings
    fireEvent.click(screen.getByTestId("transcript-word-word-9"));
    const wordTextInput = screen.getByLabelText(/edit selected word text/i);
    fireEvent.change(wordTextInput, { target: { value: "Reels!" } });
    fireEvent.click(screen.getByRole("button", { name: /save word text/i }));

    expect(screen.getByTestId("transcript-word-word-9").textContent).toContain(
      "Reels!",
    );
    expect(screen.getByTestId("active-caption-overlay").textContent).toContain(
      "Ship your Reels!",
    );

    // 6. Select phrase word-4..word-6 ("Um wrong take." spanning [3000..5000ms] Source Time) and delete it
    fireEvent.click(screen.getByTestId("transcript-word-word-4"));
    fireEvent.click(screen.getByTestId("transcript-word-word-6"), {
      shiftKey: true,
    });
    fireEvent.click(
      screen.getByRole("button", { name: /delete selected words/i }),
    );

    // Timeline duration ripple-deletes 2000ms: 12000ms -> 10000ms
    expect(screen.getByTestId("timeline-duration").textContent).toBe("00:10.000");

    // Deleted words word-4, word-5, word-6 appear struck-through / inactive
    expect(
      screen
        .getByTestId("transcript-word-word-4")
        .getAttribute("data-word-active"),
    ).toBe("false");
    expect(
      screen
        .getByTestId("transcript-word-word-5")
        .getAttribute("data-word-active"),
    ).toBe("false");
    expect(
      screen
        .getByTestId("transcript-word-word-6")
        .getAttribute("data-word-active"),
    ).toBe("false");

    // Clicking word-7 ("Ship", sourceStartMs 6000ms) now seeks to shifted Timeline Time 4000ms (00:04.000)
    fireEvent.click(screen.getByTestId("transcript-word-word-7"));
    expect(screen.getByTestId("playhead-time").textContent).toBe("00:04.000");
    expect(screen.getByTestId("active-caption-overlay").textContent).toContain(
      "Ship your Reels!",
    );

    // 7. Undo restores the deleted phrase [3000..5000ms] and returns Timeline duration to 00:12.000
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(screen.getByTestId("timeline-duration").textContent).toBe("00:12.000");
    expect(
      screen
        .getByTestId("transcript-word-word-4")
        .getAttribute("data-word-active"),
    ).toBe("true");
  });

  test("preloads curated Reel fonts, applies Caption Presets, customizes style overrides, re-groups Captions on the Timeline caption track via maxWordsPerCaption and pauseBreakMs, and toggles Word Emphasis with Undo/Redo", async () => {
    render(<App />);

    // 1. Import Source Media and transcribe audio so Captions appear on the Timeline caption track
    const fileInput = screen.getByLabelText(/import source media/i);
    const fakeVideoFile = new File(["video-bytes"], "styled-reel.mp4", {
      type: "video/mp4",
    });
    fireEvent.change(fileInput, { target: { files: [fakeVideoFile] } });

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          words: [
            { word: "Build", start: 0.2, end: 0.6 },
            { word: "engaging", start: 0.7, end: 1.2 },
            { word: "vertical", start: 1.3, end: 1.8 },
            { word: "Reels", start: 1.9, end: 2.4 },
            { word: "with", start: 3.1, end: 3.5 },
            { word: "instant", start: 3.6, end: 4.1 },
            { word: "captions.", start: 4.2, end: 4.8 },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    fireEvent.change(screen.getByLabelText(/transcription provider/i), {
      target: { value: "openai" },
    });
    fireEvent.change(screen.getByLabelText(/openai api key/i), {
      target: { value: "sk-test-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: /transcribe audio/i }));

    await waitFor(() => {
      expect(screen.getByTestId("timeline-caption-track")).toBeDefined();
    });

    // Default grouping (maxWordsPerCaption: 4, pauseBreakMs: 400):
    // 700ms pause between "Reels" (2.4s) and "with" (3.1s) splits into 2 Caption blocks on the Timeline caption track
    expect(screen.getAllByTestId(/^timeline-caption-caption-/)).toHaveLength(2);

    // 2. Verify all 6 curated Reel fonts are selectable in the Captions panel
    const fontSelect = screen.getByLabelText(
      /caption font family/i,
    ) as HTMLSelectElement;
    const fontOptionValues = Array.from(fontSelect.options).map((o) => o.value);
    expect(fontOptionValues).toEqual([
      "Montserrat",
      "Anton",
      "Inter",
      "Bebas Neue",
      "Poppins",
      "Bangers",
    ]);

    // 3. Apply "Hormozi Active-Word Highlight" preset and verify uppercase & font update
    fireEvent.click(
      screen.getByRole("button", { name: /hormozi active-word highlight/i }),
    );
    expect(fontSelect.value).toBe("Montserrat");
    expect(
      screen
        .getByRole("button", { name: /uppercase captions/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    // Seek to 300ms so first caption is active on player overlay in uppercase
    fireEvent.change(screen.getByLabelText(/timeline playhead/i), {
      target: { value: "300" },
    });
    expect(screen.getByTestId("active-caption-overlay").textContent).toContain(
      "BUILD ENGAGING VERTICAL REELS",
    );

    // 4. Customize individual style properties (fontFamily, fontSize, positionY, backgroundMode)
    fireEvent.change(fontSelect, { target: { value: "Bangers" } });
    expect(fontSelect.value).toBe("Bangers");

    fireEvent.change(screen.getByLabelText(/caption font size/i), {
      target: { value: "74" },
    });
    fireEvent.change(screen.getByLabelText(/caption vertical position/i), {
      target: { value: "0.65" },
    });
    fireEvent.change(screen.getByLabelText(/caption background mode/i), {
      target: { value: "box" },
    });

    // 5. Adjust maxWordsPerCaption to 2 -> dynamically re-groups the 7 words into 4 Captions on the Timeline caption track
    fireEvent.change(screen.getByLabelText(/max words per caption/i), {
      target: { value: "2" },
    });
    expect(screen.getAllByTestId(/^timeline-caption-caption-/)).toHaveLength(4);

    // 6. Select word-2 ("engaging") in Transcript and toggle Word Emphasis
    fireEvent.click(screen.getByTestId("transcript-word-word-2"));
    const emphasisBtn = screen.getByRole("button", {
      name: /toggle word emphasis/i,
    });
    expect(emphasisBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(emphasisBtn);
    expect(emphasisBtn.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen
        .getByTestId("transcript-word-word-2")
        .getAttribute("data-word-emphasis"),
    ).toBe("true");

    // 7. Undo reverts Word Emphasis, and another Undo reverts maxWordsPerCaption back to 4 (2 Captions on Timeline)
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(
      screen
        .getByTestId("transcript-word-word-2")
        .getAttribute("data-word-emphasis"),
    ).toBe("false");

    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(screen.getAllByTestId(/^timeline-caption-caption-/)).toHaveLength(2);

    // Redo twice re-applies both the grouping change and Word Emphasis
    fireEvent.keyDown(window, { key: "z", metaKey: true, shiftKey: true });
    expect(screen.getAllByTestId(/^timeline-caption-caption-/)).toHaveLength(4);
    fireEvent.keyDown(window, { key: "z", metaKey: true, shiftKey: true });
    expect(
      screen
        .getByTestId("transcript-word-word-2")
        .getAttribute("data-word-emphasis"),
    ).toBe("true");
  });
});
