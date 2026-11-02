import { describe, expect, test, vi } from "vitest";
import { EditorSession } from "@reel-edit/editor-core";
import {
  decodeSourceMediaAudioEnvelope,
  detectSilenceRegions,
  downsampleAudioBufferTo16kHzMono,
  evaluatePlaybackStep,
  extract16kHzMonoAudio,
  extractAudioEnvelopeFromSamples,
  preloadReelFonts,
  projectSilencePreview,
  renderFrame,
  resolveFrameLayout,
  sliceClipWaveform,
  transcribeSourceMedia,
} from "./index.js";

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

  test("detectSilenceRegions extracts Silence Regions from a synthetic PCM amplitude buffer respecting thresholdDb, minDurationMs, and paddingMs", () => {
    // 10 seconds of mono PCM audio at 1000 Hz (10,000 samples)
    // Spoken segments: amplitude 0.5 (~ -6.02 dB)
    // Silent segments: amplitude 0.002 (~ -53.98 dB)
    // - [0..1500ms]: speech
    // - [1500..3500ms]: 2000ms silence -> padded by 100ms at speech boundaries -> [1600..3400ms] (1800ms)
    // - [3500..5000ms]: speech
    // - [5000..5300ms]: 300ms short pause (< minDurationMs 500ms) -> ignored
    // - [5300..6500ms]: speech
    // - [6500..8000ms]: 1500ms silence -> padded by 100ms at speech boundaries -> [6600..7900ms] (1300ms)
    // - [8000..10000ms]: speech
    const sampleRateHz = 1000;
    const samples = new Float32Array(10000);
    for (let i = 0; i < samples.length; i++) {
      const timeMs = i;
      const isSilent1 = timeMs >= 1500 && timeMs < 3500;
      const isShortPause = timeMs >= 5000 && timeMs < 5300;
      const isSilent2 = timeMs >= 6500 && timeMs < 8000;
      samples[i] = isSilent1 || isShortPause || isSilent2 ? 0.002 : 0.5;
    }

    const regions = detectSilenceRegions(
      { samples, sampleRateHz, bucketDurationMs: 50 },
      {
        thresholdDb: -35,
        minDurationMs: 500,
        paddingMs: 100,
      },
    );

    expect(regions).toEqual([
      {
        startMs: 1600,
        endMs: 3400,
        durationMs: 1800,
      },
      {
        startMs: 6600,
        endMs: 7900,
        durationMs: 1300,
      },
    ]);

    // Raising minDurationMs to 1600ms filters out the second 1500ms silence
    const stricterRegions = detectSilenceRegions(
      extractAudioEnvelopeFromSamples(samples, sampleRateHz, 50),
      {
        thresholdDb: -35,
        minDurationMs: 1600,
        paddingMs: 100,
      },
    );
    expect(stricterRegions).toEqual([
      {
        startMs: 1600,
        endMs: 3400,
        durationMs: 1800,
      },
    ]);
  });

  test("decodes Web Audio API AudioBuffer into an AudioEnvelope, slices Clip waveforms across splits/trims, and previews cuts and time saved", async () => {
    // 6000ms at 100Hz = 600 samples, bucketDurationMs = 500ms (12 buckets)
    // Silence in [2000..4000ms] (buckets 4..7)
    const channelData = new Float32Array(600);
    for (let i = 0; i < 600; i++) {
      const timeMs = i * 10;
      channelData[i] = timeMs >= 2000 && timeMs < 4000 ? 0.001 : 0.8;
    }

    const envelope = await decodeSourceMediaAudioEnvelope(new ArrayBuffer(16), {
      bucketDurationMs: 500,
      audioContextFactory: () => ({
        decodeAudioData: async () => ({
          duration: 6,
          sampleRate: 100,
          numberOfChannels: 1,
          getChannelData: () => channelData,
        }),
      }),
    });

    expect(envelope.durationMs).toBe(6000);
    expect(envelope.bucketDurationMs).toBe(500);
    expect(envelope.peaks).toHaveLength(12);

    const session = EditorSession.fromSourceMedia(
      {
        id: "source-1",
        fileName: "voice.mp4",
        durationMs: 6000,
        width: 1080,
        height: 1920,
      },
      { audioEnvelope: envelope },
    );

    const previewFull = projectSilencePreview(
      session.getState().timeline,
      envelope,
      {
        thresholdDb: -35,
        minDurationMs: 500,
        paddingMs: 100,
      },
    );
    // [2000..4000ms] padded by 100ms -> [2100..3900ms] (1800ms saved, 1 cut)
    expect(previewFull.cutCount).toBe(1);
    expect(previewFull.savedDurationMs).toBe(1800);
    expect(previewFull.clipSilences["clip-1"]).toEqual([
      {
        sourceStartMs: 2100,
        sourceEndMs: 3900,
        offsetStartMs: 2100,
        offsetEndMs: 3900,
        startRatio: 2100 / 6000,
        endRatio: 3900 / 6000,
        durationMs: 1800,
      },
    ]);

    // Split at 1500ms -> clip-1 [0..1500ms] (3 buckets of speech), clip-2 [1500..6000ms] (9 buckets containing the silence)
    session.dispatch({ type: "splitClip", timelineTimeMs: 1500 });
    const [clip1, clip2] = session.getState().timeline.clips;

    const clip1Slice = sliceClipWaveform(
      envelope,
      clip1!,
      previewFull.silenceRegions,
    );
    expect(clip1Slice).toHaveLength(3);
    expect(clip1Slice.every((bar) => !bar.isSilent && bar.peak > 0.5)).toBe(true);

    const clip2Slice = sliceClipWaveform(
      envelope,
      clip2!,
      previewFull.silenceRegions,
    );
    expect(clip2Slice).toHaveLength(9);
    expect(clip2Slice.some((bar) => bar.isSilent)).toBe(true);
  });

  test("downsamples multi-channel high-rate Source Media audio to compact 16kHz mono PCM WAV prior to transcription", async () => {
    // 2 seconds of 48kHz stereo audio (96,000 samples per channel)
    const left = new Float32Array(96000).fill(0.6);
    const right = new Float32Array(96000).fill(0.2);

    const payload = await downsampleAudioBufferTo16kHzMono({
      duration: 2,
      sampleRate: 48000,
      numberOfChannels: 2,
      getChannelData: (ch) => (ch === 0 ? left : right),
    });

    expect(payload.sampleRateHz).toBe(16000);
    expect(payload.channels).toBe(1);
    expect(payload.durationMs).toBe(2000);
    // 2 seconds at 16,000 Hz = 32,000 mono samples
    expect(payload.samples).toHaveLength(32000);
    expect(payload.samples[0]).toBeCloseTo(0.4, 2);

    // 44-byte WAV header + 32,000 * 2 bytes (16-bit PCM) = 64,044 bytes
    expect(payload.wavBytes.byteLength).toBe(64044);
    const headerAscii = String.fromCharCode(
      ...payload.wavBytes.slice(0, 4),
      ...payload.wavBytes.slice(8, 12),
    );
    expect(headerAscii).toBe("RIFFWAVE");

    // Verify extract16kHzMonoAudio decodes via AudioContext and renders via OfflineAudioContext at 16000Hz mono
    const offlineRenderSpy = vi.fn(async () => ({
      duration: 1,
      sampleRate: 16000,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(16000).fill(0.5),
    }));
    const extracted = await extract16kHzMonoAudio(new ArrayBuffer(32), {
      audioContextFactory: () => ({
        decodeAudioData: async () => ({
          duration: 1,
          sampleRate: 44100,
          numberOfChannels: 1,
          getChannelData: () => new Float32Array(44100).fill(0.5),
        }),
      }),
      offlineAudioContextFactory: (channels, length, sampleRate) => {
        expect(channels).toBe(1);
        expect(length).toBe(16000);
        expect(sampleRate).toBe(16000);
        return {
          destination: {},
          createBuffer: (_c, l, s) => ({
            duration: l / s,
            sampleRate: s,
            numberOfChannels: 1,
            getChannelData: () => new Float32Array(l),
          }),
          createBufferSource: () => ({
            buffer: null,
            connect: vi.fn(),
            start: vi.fn(),
          }),
          startRendering: offlineRenderSpy,
        };
      },
    });
    expect(offlineRenderSpy).toHaveBeenCalledTimes(1);
    expect(extracted.sampleRateHz).toBe(16000);
    expect(extracted.channels).toBe(1);
    expect(extracted.samples).toHaveLength(16000);
  });

  test("transcribeSourceMedia supports both OpenAI whisper-1 (with API key) and built-in local browser Whisper worker (without API key), producing Source-Time Word Timings", async () => {
    // 3 seconds of 48kHz audio
    const mockAudioContextFactory = () => ({
      decodeAudioData: async () => ({
        duration: 3,
        sampleRate: 48000,
        numberOfChannels: 1,
        getChannelData: () => {
          const buf = new Float32Array(144000);
          for (let i = 0; i < buf.length; i++) {
            const ms = (i / 48000) * 1000;
            buf[i] = ms >= 200 && ms <= 2600 ? 0.5 : 0.001;
          }
          return buf;
        },
      }),
    });

    // 1. OpenAI whisper-1 transcription with 16kHz mono payload
    const fetchSpy = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.Authorization).toBe("Bearer sk-test-openai-key");
      const formData = init?.body as FormData;
      expect(formData.get("model")).toBe("whisper-1");
      expect(formData.get("response_format")).toBe("verbose_json");
      expect(formData.get("timestamp_granularities[]")).toBe("word");

      return new Response(
        JSON.stringify({
          words: [
            { word: "Creator", start: 0.25, end: 0.75 },
            { word: "workflow", start: 0.8, end: 1.4 },
            { word: "rocks.", start: 1.45, end: 2.1 },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const openAiResult = await transcribeSourceMedia(new ArrayBuffer(64), {
      provider: "openai",
      openAiApiKey: "sk-test-openai-key",
      fetchImpl: fetchSpy as unknown as typeof fetch,
      audioContextFactory: mockAudioContextFactory,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(openAiResult.provider).toBe("openai");
    expect(openAiResult.audioPayload.sampleRateHz).toBe(16000);
    expect(openAiResult.words).toEqual([
      {
        id: "word-1",
        text: "Creator",
        sourceStartMs: 250,
        sourceEndMs: 750,
        emphasis: false,
      },
      {
        id: "word-2",
        text: "workflow",
        sourceStartMs: 800,
        sourceEndMs: 1400,
        emphasis: false,
      },
      {
        id: "word-3",
        text: "rocks.",
        sourceStartMs: 1450,
        sourceEndMs: 2100,
        emphasis: false,
      },
    ]);

    // 2. Local browser Whisper Web Worker transcription without any API key
    const workerTerminateSpy = vi.fn();
    const localResult = await transcribeSourceMedia(new ArrayBuffer(64), {
      provider: "local-whisper",
      audioContextFactory: mockAudioContextFactory,
      workerFactory: () => {
        const worker = {
          onmessage: null as ((event: { data: unknown }) => void) | null,
          onerror: null as ((event: { message?: string }) => void) | null,
          terminate: workerTerminateSpy,
          postMessage(msg: {
            readonly type: "transcribe";
            readonly model: string;
            readonly audio: Float32Array;
            readonly sampleRateHz: 16000;
          }) {
            expect(msg.type).toBe("transcribe");
            expect(msg.model).toBe("onnx-community/whisper-tiny.en");
            expect(msg.sampleRateHz).toBe(16000);
            expect(msg.audio).toHaveLength(48000);
            worker.onmessage?.({
              data: {
                type: "result",
                words: [
                  {
                    id: "word-1",
                    text: "Local",
                    sourceStartMs: 300,
                    sourceEndMs: 800,
                  },
                  {
                    id: "word-2",
                    text: "Whisper!",
                    sourceStartMs: 850,
                    sourceEndMs: 1500,
                  },
                ],
              },
            });
          },
        };
        return worker;
      },
    });

    expect(workerTerminateSpy).toHaveBeenCalledTimes(1);
    expect(localResult.provider).toBe("local-whisper");
    expect(localResult.model).toBe("onnx-community/whisper-tiny.en");
    expect(localResult.audioPayload.sampleRateHz).toBe(16000);
    expect(localResult.words).toEqual([
      {
        id: "word-1",
        text: "Local",
        sourceStartMs: 300,
        sourceEndMs: 800,
        emphasis: false,
      },
      {
        id: "word-2",
        text: "Whisper!",
        sourceStartMs: 850,
        sourceEndMs: 1500,
        emphasis: false,
      },
    ]);
  });

  test("resolves active Caption and spoken word in resolveFrameLayout and renders updated Caption text on the 9:16 canvas", () => {
    const session = EditorSession.fromSourceMedia(
      {
        id: "source-1",
        fileName: "captions.mp4",
        durationMs: 8000,
        width: 1080,
        height: 1920,
      },
      {
        transcript: [
          { id: "w-1", text: "Zero", sourceStartMs: 400, sourceEndMs: 900 },
          { id: "w-2", text: "upload", sourceStartMs: 950, sourceEndMs: 1500 },
          { id: "w-3", text: "editor.", sourceStartMs: 1550, sourceEndMs: 2200 },
        ],
      },
    );

    const layoutAt1100 = resolveFrameLayout(session.getState(), 1100);
    expect(layoutAt1100.activeCaption).not.toBeNull();
    expect(layoutAt1100.activeCaption?.text).toBe("Zero upload editor.");
    expect(layoutAt1100.activeCaption?.activeWordIndex).toBe(1);
    expect(layoutAt1100.activeCaption?.activeWord?.text).toBe("upload");

    // Update word text via updateWords and verify canvas renderFrame draws the updated Caption
    session.dispatch({
      type: "updateWords",
      updates: [{ wordId: "w-2", text: "latency" }],
    });

    const updatedLayout = resolveFrameLayout(session.getState(), 1100);
    expect(updatedLayout.activeCaption?.text).toBe("Zero latency editor.");

    const fillTextSpy = vi.fn();
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      drawImage: vi.fn(),
      setLineDash: vi.fn(),
      fillText: fillTextSpy,
      strokeText: vi.fn(),
      measureText: vi.fn((t: string) => ({ width: t.length * 24 })),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
      textAlign: "left",
      textBaseline: "alphabetic",
    } as unknown as CanvasRenderingContext2D;

    renderFrame(mockCtx, null, updatedLayout);
    expect(
      fillTextSpy.mock.calls.some((call) =>
        String(call[0]).includes("Zero latency editor."),
      ),
    ).toBe(true);
  });

  test("hands the active word to the next word exactly at a shared Word Timing boundary inside one Caption", () => {
    const session = EditorSession.fromSourceMedia(
      {
        id: "source-1",
        fileName: "contiguous.mp4",
        durationMs: 8000,
        width: 1080,
        height: 1920,
      },
      {
        transcript: [
          { id: "w-1", text: "el", sourceStartMs: 1120, sourceEndMs: 1280 },
          { id: "w-2", text: "tumor", sourceStartMs: 1280, sourceEndMs: 1580 },
          { id: "w-3", text: "más", sourceStartMs: 1580, sourceEndMs: 1920 },
          { id: "w-4", text: "frecuente", sourceStartMs: 1920, sourceEndMs: 2200 },
        ],
      },
    );

    const state = session.getState();
    expect(resolveFrameLayout(state, 1579).activeCaption?.activeWord?.text).toBe("tumor");
    expect(resolveFrameLayout(state, 1580).activeCaption?.activeWord?.text).toBe("más");
    expect(resolveFrameLayout(state, 1920).activeCaption?.activeWord?.text).toBe("frecuente");
    // The Caption's final instant still holds its last word
    expect(resolveFrameLayout(state, 2200).activeCaption?.activeWord?.text).toBe("frecuente");
  });

  test("preloadReelFonts preloads the curated Reel font catalog via browser Font Loading API and resolveFrameLayout deterministically computes Flat, Hormozi Highlight, Word-by-Word Pop, and Word Emphasis styling", async () => {
    const loadSpy = vi.fn(async () => []);
    const fontResult = await preloadReelFonts({
      fontFaceSet: { load: loadSpy },
    });
    expect(fontResult.status).toBe("loaded");
    expect(fontResult.loadedFamilies).toEqual([
      "Montserrat",
      "Anton",
      "Inter",
      "Bebas Neue",
      "Poppins",
      "Bangers",
    ]);
    expect(loadSpy).toHaveBeenCalledTimes(6);

    const session = EditorSession.fromSourceMedia(
      {
        id: "source-1",
        fileName: "animated-captions.mp4",
        durationMs: 8000,
        width: 1080,
        height: 1920,
      },
      {
        transcript: [
          { id: "w-1", text: "Build", sourceStartMs: 400, sourceEndMs: 800 },
          {
            id: "w-2",
            text: "viral",
            sourceStartMs: 900,
            sourceEndMs: 1400,
            emphasis: true,
          },
          { id: "w-3", text: "Reels.", sourceStartMs: 1500, sourceEndMs: 2100 },
        ],
      },
    );

    // 1. Flat Static preset ("flat"): static scale 1 on normal words, emphasisColor + scale boost on emphasized word
    const flatLayout = resolveFrameLayout(session.getState(), 500);
    expect(flatLayout.activeCaption?.animationMode).toBe("flat");
    expect(flatLayout.activeCaption?.baselineY).toBe(Math.round(1920 * 0.72));
    expect(flatLayout.activeCaption?.wordLayouts.map((w) => ({
      displayText: w.displayText,
      isActive: w.isActive,
      emphasis: w.emphasis,
      fillColor: w.fillColor,
      highlightPill: w.highlightPill,
      scale: w.scale,
    }))).toEqual([
      {
        displayText: "Build",
        isActive: true,
        emphasis: false,
        fillColor: "#ffffff",
        highlightPill: false,
        scale: 1,
      },
      {
        displayText: "viral",
        isActive: false,
        emphasis: true,
        fillColor: "#38bdf8",
        highlightPill: false,
        scale: 1.08,
      },
      {
        displayText: "Reels.",
        isActive: false,
        emphasis: false,
        fillColor: "#ffffff",
        highlightPill: false,
        scale: 1,
      },
    ]);

    // 2. Hormozi Active-Word Highlight preset ("hormozi-highlight"): uppercase, active-word color/pill/scale highlight
    session.dispatch({
      type: "updateCaptionStyle",
      presetId: "hormozi-highlight",
    });

    // At 500ms ("BUILD" is active, "VIRAL" is emphasized):
    const hormoziAt500 = resolveFrameLayout(session.getState(), 500);
    expect(hormoziAt500.activeCaption?.animationMode).toBe("hormozi-highlight");
    expect(hormoziAt500.activeCaption?.displayText).toBe("BUILD VIRAL REELS.");
    expect(hormoziAt500.activeCaption?.wordLayouts[0]).toMatchObject({
      displayText: "BUILD",
      isActive: true,
      fillColor: "#facc15",
      highlightPill: true,
      scale: 1.12,
    });
    expect(hormoziAt500.activeCaption?.wordLayouts[1]).toMatchObject({
      displayText: "VIRAL",
      isActive: false,
      emphasis: true,
      fillColor: "#22c55e",
      highlightPill: false,
    });

    // At 1100ms ("VIRAL" is both active AND emphasized):
    const hormoziAt1100 = resolveFrameLayout(session.getState(), 1100);
    expect(hormoziAt1100.activeCaption?.activeWordIndex).toBe(1);
    expect(hormoziAt1100.activeCaption?.wordLayouts[1]).toMatchObject({
      displayText: "VIRAL",
      isActive: true,
      emphasis: true,
      fillColor: "#22c55e",
      highlightPill: true,
      scale: 1.18,
    });

    // 3. Word-by-Word Pop preset ("word-pop") + vertical positionY override (0.60):
    // Deterministic spring-scaled entry curve based on elapsed ms since word.timelineStartMs
    session.dispatch({
      type: "updateCaptionStyle",
      presetId: "word-pop",
      styleOverrides: {
        positionY: 0.6,
      },
    });

    // w-3 ("Reels.") starts at 1500ms with 160ms entry pop window:
    // - At 1500ms (0ms elapsed -> progress 0): entry scale 0.65
    const popStart = resolveFrameLayout(session.getState(), 1500);
    expect(popStart.activeCaption?.baselineY).toBe(Math.round(1920 * 0.6));
    expect(popStart.activeCaption?.activeWordIndex).toBe(2);
    expect(popStart.activeCaption?.animationProgress).toBe(0);
    expect(popStart.activeCaption?.wordLayouts[2]?.scale).toBeCloseTo(0.65, 2);

    // - At 1580ms (80ms elapsed -> progress 0.5): spring overshoot > 1.15
    const popMid = resolveFrameLayout(session.getState(), 1580);
    expect(popMid.activeCaption?.animationProgress).toBeCloseTo(0.5, 2);
    expect(popMid.activeCaption?.wordLayouts[2]?.scale).toBeGreaterThan(1.15);

    // - At 1700ms (200ms elapsed -> progress 1.0): settled to 1.0
    const popSettled = resolveFrameLayout(session.getState(), 1700);
    expect(popSettled.activeCaption?.animationProgress).toBe(1);
    expect(popSettled.activeCaption?.wordLayouts[2]?.scale).toBeCloseTo(1.0, 2);
  });
});
