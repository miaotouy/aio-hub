import { describe, expect, it, vi } from "vitest";
import {
  executeAsyncMediaTask,
  geminiVideoTaskAdapter,
  minimaxMusicTaskAdapter,
  openAiVideoTaskAdapter,
  sunoMusicTaskAdapter,
  type JsonValue,
  type LlmTransport,
  type WireRequest,
  type WireResponse,
} from "../src";

describe("async media task adapters", () => {
  it("executes OpenAI video create, poll, and authenticated content retrieval", async () => {
    const requests: WireRequest[] = [];
    const responses = [
      jsonResponse({ id: "video-1", status: "queued" }),
      jsonResponse({ id: "video-1", status: "completed" }),
      bytesResponse(new Uint8Array([1, 2, 3]), { "content-type": "video/mp4" }),
    ];
    const task = await executeAsyncMediaTask({
      adapter: openAiVideoTaskAdapter,
      profile: {
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "secret",
      },
      request: {
        kind: "video",
        model: "sora-2",
        prompt: "waves",
        parameters: { size: "1280x720", durationSeconds: 8 },
      },
      transport: queueTransport(responses, requests),
      transportOptions: { requestId: "video-request" },
      pollIntervalMs: 0,
    });

    expect(requests.map((request) => request.url)).toEqual([
      "https://api.openai.com/v1/videos",
      "https://api.openai.com/v1/videos/video-1",
      "https://api.openai.com/v1/videos/video-1/content",
    ]);
    expect(task).toMatchObject({
      status: "succeeded",
      assets: [{ kind: "inline-base64", data: "AQID" }],
    });
  });

  it("normalizes Gemini long-running operations", async () => {
    const task = await executeAsyncMediaTask({
      adapter: geminiVideoTaskAdapter,
      profile: {
        provider: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com",
        apiKey: "key",
      },
      request: {
        kind: "video",
        model: "veo-3",
        prompt: "city",
        parameters: { aspectRatio: "16:9" },
      },
      transport: queueTransport([
        jsonResponse({ name: "operations/op-1", done: false }),
        jsonResponse({
          name: "operations/op-1",
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: "https://cdn/video.mp4" } }],
            },
          },
        }),
      ]),
      transportOptions: { requestId: "gemini-video" },
      pollIntervalMs: 0,
    });
    expect(task.assets).toEqual([
      {
        kind: "remote-url",
        url: "https://cdn/video.mp4",
        contentType: "video/mp4",
      },
    ]);
  });

  it("resolves Suno clip ids through feed requests", async () => {
    const task = await executeAsyncMediaTask({
      adapter: sunoMusicTaskAdapter,
      profile: {
        provider: "suno-newapi",
        baseUrl: "https://newapi.example.com",
        apiKey: "key",
      },
      request: {
        kind: "music",
        model: "chirp-v4",
        prompt: "song",
        parameters: { body: { gpt_description_prompt: "song" } },
      },
      transport: queueTransport([
        jsonResponse({ code: "success", data: "task-1" }),
        jsonResponse({
          data: { status: "SUCCESS", progress: "100%", data: ["clip-1"] },
        }),
        jsonResponse([
          { id: "clip-1", audio_url: "https://cdn.example.com/song.mp3" },
        ]),
      ]),
      transportOptions: { requestId: "suno" },
      pollIntervalMs: 0,
    });
    expect(task).toMatchObject({
      progress: 100,
      assets: [
        {
          kind: "remote-url",
          url: "https://cdn.example.com/song.mp3",
        },
      ],
    });
  });

  it("treats MiniMax synchronous music as an immediate completed task", async () => {
    const task = await executeAsyncMediaTask({
      adapter: minimaxMusicTaskAdapter,
      profile: {
        provider: "minimax-music",
        baseUrl: "https://api.minimax.io",
        apiKey: "key",
      },
      request: {
        kind: "music",
        model: "music-2.6",
        prompt: "song",
        parameters: {
          outputFormat: "hex",
          audioFormat: "mp3",
          body: { model: "music-2.6", prompt: "song" },
        },
      },
      transport: queueTransport([
        jsonResponse({
          data: { status: 2, audio: "010203" },
          base_resp: { status_code: 0 },
        }),
      ]),
      transportOptions: { requestId: "minimax" },
    });
    expect(task.assets?.[0]).toMatchObject({
      kind: "inline-base64",
      data: "AQID",
    });
  });

  it("uses an abortable poll delay", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = executeAsyncMediaTask({
      adapter: openAiVideoTaskAdapter,
      profile: { provider: "openai", baseUrl: "https://api.openai.com/v1" },
      request: { kind: "video", model: "sora", prompt: "test" },
      transport: queueTransport([jsonResponse({ id: "v", status: "queued" })]),
      transportOptions: { requestId: "cancel", signal: controller.signal },
      pollIntervalMs: 5_000,
    });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    vi.useRealTimers();
  });
});

function queueTransport(
  responses: WireResponse[],
  requests: WireRequest[] = []
): LlmTransport {
  return {
    async send(request) {
      requests.push(request);
      const response = responses.shift();
      if (!response) throw new Error("Unexpected transport request");
      return response;
    },
  };
}

function jsonResponse(value: JsonValue): WireResponse {
  return bytesResponse(new TextEncoder().encode(JSON.stringify(value)), {
    "content-type": "application/json",
  });
}

function bytesResponse(
  bytes: Uint8Array,
  headers: Record<string, string> = {}
): WireResponse {
  return {
    status: 200,
    statusText: "OK",
    headers,
    body: (async function* () {
      yield bytes;
    })(),
  };
}
