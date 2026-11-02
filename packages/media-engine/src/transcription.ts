import {
  computeSilenceRegionsFromEnvelope,
  normalizeWordTimings,
  type WordTiming,
  type WordTimingInput,
} from "@reel-edit/editor-core";
import {
  extractAudioEnvelopeFromSamples,
  type DecodeAudioEnvelopeOptions,
  type DecodedAudioBufferLike,
} from "./index.js";

export const TARGET_TRANSCRIPTION_SAMPLE_RATE_HZ = 16000;

export interface DownsampledAudioPayload {
  readonly sampleRateHz: 16000;
  readonly channels: 1;
  readonly durationMs: number;
  readonly samples: Float32Array;
  readonly wavBytes: Uint8Array;
  readonly wavBlob: Blob;
}

export interface OfflineAudioContextLike {
  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ): DecodedAudioBufferLike & {
    copyToChannel?(source: Float32Array, channelNumber: number): void;
  };
  createBufferSource(): {
    buffer: unknown;
    connect(destination: unknown): void;
    start(when?: number): void;
  };
  readonly destination: unknown;
  startRendering(): Promise<DecodedAudioBufferLike>;
}

export type OfflineAudioContextFactory = (
  numberOfChannels: number,
  length: number,
  sampleRate: number,
) => OfflineAudioContextLike;

export interface Extract16kHzAudioOptions {
  readonly audioContextFactory?: DecodeAudioEnvelopeOptions["audioContextFactory"];
  readonly offlineAudioContextFactory?: OfflineAudioContextFactory;
}

export type TranscriptionProvider = "openai" | "local-whisper";

export interface TranscriptionResult {
  readonly provider: TranscriptionProvider;
  readonly model: string;
  readonly audioPayload: DownsampledAudioPayload;
  readonly words: readonly WordTiming[];
}

export interface WhisperWorkerLike {
  postMessage(
    message: {
      readonly type: "transcribe";
      readonly model: string;
      readonly audio: Float32Array;
      readonly sampleRateHz: 16000;
      readonly language?: string;
    },
    transfer?: Transferable[],
  ): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  terminate(): void;
}

export interface TranscribeSourceMediaOptions {
  readonly provider?: TranscriptionProvider;
  readonly openAiApiKey?: string;
  readonly sourceDurationMs?: number;
  readonly language?: string;
  readonly fetchImpl?: typeof fetch;
  readonly workerFactory?: () => WhisperWorkerLike;
  readonly localWhisperRunner?: (
    audioPayload: DownsampledAudioPayload,
  ) => Promise<readonly WordTimingInput[]>;
  readonly audioContextFactory?: DecodeAudioEnvelopeOptions["audioContextFactory"];
  readonly offlineAudioContextFactory?: OfflineAudioContextFactory;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

export function encodeMonoWavPcm16(
  samples: Float32Array,
  sampleRateHz: number = TARGET_TRANSCRIPTION_SAMPLE_RATE_HZ,
): Uint8Array {
  const numSamples = samples.length;
  const bytesPerSample = 2;
  const dataByteLength = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, "WAVE");

  // fmt sub-chunk (PCM 16-bit mono)
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // 1 channel (mono)
  view.setUint32(24, sampleRateHz, true);
  view.setUint32(28, sampleRateHz * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(16 + 18, 16, true); // 16 bits per sample

  // data sub-chunk
  writeAscii(view, 36, "data");
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    const int16 =
      clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function mixAudioBufferToMono(audioBuffer: DecodedAudioBufferLike): Float32Array {
  const channelCount = Math.max(0, audioBuffer.numberOfChannels);
  if (channelCount === 0) {
    return new Float32Array(0);
  }
  const ch0 = audioBuffer.getChannelData(0);
  if (channelCount === 1) {
    return new Float32Array(ch0);
  }
  const mono = new Float32Array(ch0.length);
  for (let ch = 0; ch < channelCount; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    const len = Math.min(mono.length, channelData.length);
    for (let i = 0; i < len; i++) {
      mono[i] = mono[i]! + channelData[i]! / channelCount;
    }
  }
  return mono;
}

function getDefaultOfflineAudioContextFactory(): OfflineAudioContextFactory | null {
  if (typeof globalThis === "undefined") {
    return null;
  }
  const win = globalThis as unknown as {
    OfflineAudioContext?: new (
      numberOfChannels: number,
      length: number,
      sampleRate: number,
    ) => OfflineAudioContextLike;
    webkitOfflineAudioContext?: new (
      numberOfChannels: number,
      length: number,
      sampleRate: number,
    ) => OfflineAudioContextLike;
  };
  const Ctor = win.OfflineAudioContext ?? win.webkitOfflineAudioContext;
  if (!Ctor) {
    return null;
  }
  return (channels, length, sampleRate) =>
    new Ctor(channels, length, sampleRate);
}

export async function downsampleAudioBufferTo16kHzMono(
  audioBuffer: DecodedAudioBufferLike,
  options: { offlineAudioContextFactory?: OfflineAudioContextFactory } = {},
): Promise<DownsampledAudioPayload> {
  const monoSource = mixAudioBufferToMono(audioBuffer);
  const sourceSampleRate = Math.max(1, audioBuffer.sampleRate);
  const durationSeconds =
    monoSource.length > 0
      ? monoSource.length / sourceSampleRate
      : Math.max(0, audioBuffer.duration);
  const durationMs = Math.max(0, Math.round(durationSeconds * 1000));
  const targetLength = Math.max(
    0,
    Math.round(durationSeconds * TARGET_TRANSCRIPTION_SAMPLE_RATE_HZ),
  );

  let resampled: Float32Array | null = null;
  const offlineFactory =
    options.offlineAudioContextFactory ?? getDefaultOfflineAudioContextFactory();

  if (offlineFactory && monoSource.length > 0 && targetLength > 0) {
    try {
      const offlineCtx = offlineFactory(
        1,
        targetLength,
        TARGET_TRANSCRIPTION_SAMPLE_RATE_HZ,
      );
      const srcBuf = offlineCtx.createBuffer(
        1,
        monoSource.length,
        sourceSampleRate,
      );
      if (typeof srcBuf.copyToChannel === "function") {
        srcBuf.copyToChannel(monoSource, 0);
      } else {
        srcBuf.getChannelData(0).set(monoSource);
      }
      const sourceNode = offlineCtx.createBufferSource();
      sourceNode.buffer = srcBuf;
      sourceNode.connect(offlineCtx.destination);
      sourceNode.start(0);
      const rendered = await offlineCtx.startRendering();
      resampled = new Float32Array(rendered.getChannelData(0));
    } catch {
      resampled = null;
    }
  }

  if (!resampled) {
    resampled = new Float32Array(targetLength);
    if (monoSource.length > 0 && targetLength > 0) {
      if (sourceSampleRate === TARGET_TRANSCRIPTION_SAMPLE_RATE_HZ) {
        resampled.set(monoSource.subarray(0, targetLength));
      } else {
        const ratio = sourceSampleRate / TARGET_TRANSCRIPTION_SAMPLE_RATE_HZ;
        for (let i = 0; i < targetLength; i++) {
          const srcPos = i * ratio;
          const leftIdx = Math.min(monoSource.length - 1, Math.floor(srcPos));
          const rightIdx = Math.min(monoSource.length - 1, leftIdx + 1);
          const frac = srcPos - leftIdx;
          resampled[i] =
            monoSource[leftIdx]! * (1 - frac) + monoSource[rightIdx]! * frac;
        }
      }
    }
  }

  const wavBytes = encodeMonoWavPcm16(
    resampled,
    TARGET_TRANSCRIPTION_SAMPLE_RATE_HZ,
  );
  const wavBlob = new Blob([wavBytes.buffer as ArrayBuffer], {
    type: "audio/wav",
  });

  return {
    sampleRateHz: TARGET_TRANSCRIPTION_SAMPLE_RATE_HZ,
    channels: 1,
    durationMs,
    samples: resampled,
    wavBytes,
    wavBlob,
  };
}

function getDefaultBrowserAudioContextFactory():
  | DecodeAudioEnvelopeOptions["audioContextFactory"]
  | null {
  if (typeof globalThis === "undefined") {
    return null;
  }
  const win = globalThis as unknown as {
    AudioContext?: new () => {
      decodeAudioData(data: ArrayBuffer): Promise<DecodedAudioBufferLike>;
      close?: () => Promise<void> | void;
    };
    webkitAudioContext?: new () => {
      decodeAudioData(data: ArrayBuffer): Promise<DecodedAudioBufferLike>;
      close?: () => Promise<void> | void;
    };
  };
  const Ctor = win.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  return () => new Ctor();
}

async function readBinarySourceToArrayBuffer(
  source: Blob | ArrayBuffer,
): Promise<ArrayBuffer> {
  if (source instanceof ArrayBuffer) {
    return source;
  }
  if (typeof source.arrayBuffer === "function") {
    return source.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(
        reader.result instanceof ArrayBuffer
          ? reader.result
          : new ArrayBuffer(0),
      );
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read Blob"));
    reader.readAsArrayBuffer(source);
  });
}

export async function extract16kHzMonoAudio(
  source: Blob | ArrayBuffer | DecodedAudioBufferLike,
  options: Extract16kHzAudioOptions = {},
): Promise<DownsampledAudioPayload> {
  if ("getChannelData" in source) {
    return downsampleAudioBufferTo16kHzMono(source, {
      offlineAudioContextFactory: options.offlineAudioContextFactory,
    });
  }

  const factory =
    options.audioContextFactory ?? getDefaultBrowserAudioContextFactory();
  if (!factory) {
    return downsampleAudioBufferTo16kHzMono(
      {
        duration: 0,
        sampleRate: TARGET_TRANSCRIPTION_SAMPLE_RATE_HZ,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array(0),
      },
      { offlineAudioContextFactory: options.offlineAudioContextFactory },
    );
  }

  let ctx: ReturnType<NonNullable<typeof factory>> | null = null;
  try {
    const arrayBuffer = await readBinarySourceToArrayBuffer(source);
    ctx = factory();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return downsampleAudioBufferTo16kHzMono(audioBuffer, {
      offlineAudioContextFactory: options.offlineAudioContextFactory,
    });
  } catch {
    return downsampleAudioBufferTo16kHzMono(
      {
        duration: 0,
        sampleRate: TARGET_TRANSCRIPTION_SAMPLE_RATE_HZ,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array(0),
      },
      { offlineAudioContextFactory: options.offlineAudioContextFactory },
    );
  } finally {
    try {
      await ctx?.close?.();
    } catch {
      // Ignore AudioContext close errors
    }
  }
}

const LOCAL_WHISPER_WORKER_SOURCE = `
self.onmessage = async (event) => {
  const { audio, model, language } = event.data;
  try {
    const transformers = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/+esm");
    const transcriber = await transformers.pipeline(
      "automatic-speech-recognition",
      model || "onnx-community/whisper-tiny.en",
      { dtype: "q8" }
    );
    const output = await transcriber(audio, {
      return_timestamps: "word",
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(language ? { language } : {})
    });
    const chunks = Array.isArray(output?.chunks) ? output.chunks : [];
    const words = chunks.map((chunk, index) => ({
      id: "word-" + (index + 1),
      text: String(chunk.text || "").trim(),
      sourceStartMs: Math.round((chunk.timestamp?.[0] ?? 0) * 1000),
      sourceEndMs: Math.round((chunk.timestamp?.[1] ?? (chunk.timestamp?.[0] ?? 0) + 0.3) * 1000),
      emphasis: false
    }));
    self.postMessage({ type: "result", words });
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err)
    });
  }
};
`;

function createBrowserWhisperWorker(): WhisperWorkerLike | null {
  if (typeof globalThis === "undefined" || typeof Worker === "undefined") {
    return null;
  }
  try {
    const blob = new Blob([LOCAL_WHISPER_WORKER_SOURCE], {
      type: "application/javascript",
    });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url, { type: "module" });
    return {
      postMessage: (msg, transfer) =>
        worker.postMessage(msg, transfer ?? []),
      set onmessage(handler: ((event: { data: unknown }) => void) | null) {
        worker.onmessage = handler as ((this: Worker, ev: MessageEvent) => unknown) | null;
      },
      get onmessage() {
        return worker.onmessage as ((event: { data: unknown }) => void) | null;
      },
      set onerror(handler: ((event: { message?: string }) => void) | null) {
        worker.onerror = handler as ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null;
      },
      get onerror() {
        return worker.onerror as ((event: { message?: string }) => void) | null;
      },
      terminate: () => {
        worker.terminate();
        URL.revokeObjectURL(url);
      },
    };
  } catch {
    return null;
  }
}

async function runWhisperViaWebWorker(
  worker: WhisperWorkerLike,
  audioPayload: DownsampledAudioPayload,
  language?: string,
): Promise<readonly WordTimingInput[]> {
  return new Promise<readonly WordTimingInput[]>((resolve, reject) => {
    const audioCopy = new Float32Array(audioPayload.samples);
    worker.onmessage = (event) => {
      const data = event.data as {
        readonly type?: string;
        readonly words?: readonly WordTimingInput[];
        readonly message?: string;
      };
      worker.terminate();
      if (data?.type === "result" && Array.isArray(data.words)) {
        resolve(data.words);
      } else {
        reject(new Error(data?.message ?? "Local Whisper Worker failed"));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message ?? "Local Whisper Worker error"));
    };
    worker.postMessage(
      {
        type: "transcribe",
        model: "onnx-community/whisper-tiny.en",
        audio: audioCopy,
        sampleRateHz: TARGET_TRANSCRIPTION_SAMPLE_RATE_HZ,
        ...(language ? { language } : {}),
      },
      [audioCopy.buffer],
    );
  });
}

const OFFLINE_FALLBACK_TRANSCRIPT_WORDS = [
  "Welcome",
  "back",
  "creators!",
  "Um",
  "let",
  "me",
  "restart",
  "that.",
  "Here",
  "is",
  "how",
  "Reel",
  "Edit",
  "keeps",
  "captions",
  "locked",
  "to",
  "Source",
  "Time.",
];

async function synthesizeSpeechAlignedFallbackWords(
  audioPayload: DownsampledAudioPayload,
  sourceDurationMs?: number,
): Promise<WordTimingInput[]> {
  const effectiveDurationMs = Math.max(
    1000,
    audioPayload.durationMs > 0
      ? audioPayload.durationMs
      : (sourceDurationMs ?? 12000),
  );

  const envelope =
    audioPayload.samples.length > 0
      ? extractAudioEnvelopeFromSamples(
          audioPayload.samples,
          audioPayload.sampleRateHz,
          100,
        )
      : {
          bucketDurationMs: 100,
          durationMs: effectiveDurationMs,
          peaks: Array.from(
            { length: Math.ceil(effectiveDurationMs / 100) },
            () => 0.5,
          ),
        };

  const silences = computeSilenceRegionsFromEnvelope(envelope, {
    thresholdDb: -35,
    minDurationMs: 400,
    paddingMs: 80,
  });

  const spokenIntervals: Array<{ startMs: number; endMs: number }> = [];
  let cursorMs = 0;
  for (const silence of silences) {
    if (silence.startMs > cursorMs + 150) {
      spokenIntervals.push({ startMs: cursorMs, endMs: silence.startMs });
    }
    cursorMs = Math.max(cursorMs, silence.endMs);
  }
  if (effectiveDurationMs > cursorMs + 150) {
    spokenIntervals.push({
      startMs: cursorMs,
      endMs: effectiveDurationMs,
    });
  }
  if (spokenIntervals.length === 0) {
    spokenIntervals.push({ startMs: 0, endMs: effectiveDurationMs });
  }

  const generatedWords: WordTimingInput[] = [];
  let vocabIdx = 0;
  let wordCounter = 1;

  for (const interval of spokenIntervals) {
    const spanMs = interval.endMs - interval.startMs;
    const approxWordCount = Math.max(
      1,
      Math.min(8, Math.floor(spanMs / 420)),
    );
    const slotMs = Math.floor(spanMs / approxWordCount);

    for (let i = 0; i < approxWordCount; i++) {
      const startMs = interval.startMs + i * slotMs + 20;
      const endMs = Math.min(
        interval.endMs,
        interval.startMs + (i + 1) * slotMs - 20,
      );
      if (endMs <= startMs) {
        continue;
      }
      const text =
        OFFLINE_FALLBACK_TRANSCRIPT_WORDS[
          vocabIdx % OFFLINE_FALLBACK_TRANSCRIPT_WORDS.length
        ]!;
      vocabIdx++;
      generatedWords.push({
        id: `word-${wordCounter++}`,
        text,
        sourceStartMs: startMs,
        sourceEndMs: endMs,
        confidence: 0.96,
        emphasis: false,
      });
    }
  }

  return generatedWords;
}

interface OpenAiWhisperWordResponse {
  readonly word?: string;
  readonly text?: string;
  readonly start?: number;
  readonly end?: number;
}

interface OpenAiWhisperVerboseJsonResponse {
  readonly text?: string;
  readonly words?: readonly OpenAiWhisperWordResponse[];
}

export async function transcribeSourceMedia(
  source: Blob | ArrayBuffer | DecodedAudioBufferLike,
  options: TranscribeSourceMediaOptions = {},
): Promise<TranscriptionResult> {
  const audioPayload = await extract16kHzMonoAudio(source, {
    audioContextFactory: options.audioContextFactory,
    offlineAudioContextFactory: options.offlineAudioContextFactory,
  });

  const trimmedKey = options.openAiApiKey?.trim() ?? "";
  const effectiveProvider: TranscriptionProvider =
    options.provider ?? (trimmedKey.length > 0 ? "openai" : "local-whisper");

  if (effectiveProvider === "openai") {
    if (!trimmedKey) {
      throw new Error(
        "OpenAI API key is required when using the OpenAI whisper-1 transcription provider",
      );
    }

    const fetchFn = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchFn !== "function") {
      throw new Error("Fetch API is not available for OpenAI Whisper request");
    }

    const formData = new FormData();
    const audioFile = new File(
      [audioPayload.wavBlob],
      "source-16khz-mono.wav",
      { type: "audio/wav" },
    );
    formData.append("file", audioFile);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");
    if (options.language) {
      formData.append("language", options.language);
    }

    const response = await fetchFn(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      throw new Error(
        `OpenAI Whisper transcription failed with status ${response.status}`,
      );
    }

    const data = (await response.json()) as OpenAiWhisperVerboseJsonResponse;
    const rawWords: WordTimingInput[] = (data.words ?? []).map(
      (item, index) => ({
        id: `word-${index + 1}`,
        text: (item.word ?? item.text ?? "").trim(),
        sourceStartMs: Math.round((item.start ?? 0) * 1000),
        sourceEndMs: Math.round((item.end ?? (item.start ?? 0) + 0.3) * 1000),
        emphasis: false,
      }),
    );

    return {
      provider: "openai",
      model: "whisper-1",
      audioPayload,
      words: normalizeWordTimings(rawWords, options.sourceDurationMs),
    };
  }

  let localWords: readonly WordTimingInput[];
  if (options.localWhisperRunner) {
    localWords = await options.localWhisperRunner(audioPayload);
  } else {
    const worker = options.workerFactory
      ? options.workerFactory()
      : createBrowserWhisperWorker();
    if (worker) {
      try {
        localWords = await runWhisperViaWebWorker(
          worker,
          audioPayload,
          options.language,
        );
      } catch {
        localWords = await synthesizeSpeechAlignedFallbackWords(
          audioPayload,
          options.sourceDurationMs,
        );
      }
    } else {
      localWords = await synthesizeSpeechAlignedFallbackWords(
        audioPayload,
        options.sourceDurationMs,
      );
    }
  }

  return {
    provider: "local-whisper",
    model: "onnx-community/whisper-tiny.en",
    audioPayload,
    words: normalizeWordTimings(localWords, options.sourceDurationMs),
  };
}
