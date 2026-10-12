import { describe, expect, it } from "vitest";
import {
  executeAsyncMediaTask,
  executeSyncMediaRequest,
  openRouterImageAdapter,
  openRouterAudioAdapter,
  openRouterVideoTaskAdapter,
  type ProviderProfile,
  type WireRequest,
  type WireResponse,
  type LlmTransport,
} from "../src";

const profile: ProviderProfile = {
  provider: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "test-key",
};

function jsonResponse(value: unknown): WireResponse {
  return response(
    new TextEncoder().encode(JSON.stringify(value)),
    "application/json"
  );
}
function response(bytes: Uint8Array, contentType: string): WireResponse {
  return {
    status: 200,
    statusText: "OK",
    headers: { "content-type": contentType },
    body: (async function* () {
      yield bytes;
    })(),
  };
}
function queue(
  responses: WireResponse[],
  requests: WireRequest[]
): LlmTransport {
  return {
    async send(request) {
      requests.push(request);
      const result = responses.shift();
      if (!result) throw new Error("Unexpected media request");
      return result;
    },
  };
}

describe("OpenRouter media protocol", () => {
  it("sends image references as JSON and preserves encoded output MIME", async () => {
    const requests: WireRequest[] = [];
    const result = await executeSyncMediaRequest({
      adapter: openRouterImageAdapter,
      profile,
      request: {
        kind: "image",
        model: "google/image-model",
        prompt: "a tea room",
        count: 2,
        aspectRatio: "16:9",
        responseFormat: "webp",
        extensions: { resolution: "2K", provider: { zdr: true } },
        inputs: [
          {
            type: "image",
            source: {
              kind: "remote-url",
              url: "https://cdn.example.com/reference.png",
            },
          },
          {
            type: "image",
            source: {
              kind: "local-file",
              ref: {
                kind: "local-file-ref",
                path: "C:/reference.png",
                contentType: "image/png",
              },
            },
          },
        ],
      },
      transport: queue(
        [
          jsonResponse({
            data: [
              { b64_json: "AQID", media_type: "image/jpeg" },
              { b64_json: "BAUG" },
            ],
          }),
        ],
        requests
      ),
      transportOptions: { requestId: "or-image" },
    });
    expect(requests[0]).toMatchObject({
      url: "https://openrouter.ai/api/v1/images",
      body: {
        kind: "json",
        value: {
          model: "google/image-model",
          prompt: "a tea room",
          n: 2,
          aspect_ratio: "16:9",
          resolution: "2K",
          output_format: "webp",
          stream: false,
          provider: { zdr: true },
          input_references: [
            {
              type: "image_url",
              image_url: { url: "https://cdn.example.com/reference.png" },
            },
            {
              type: "image_url",
              image_url: {
                url: {
                  kind: "local-file-ref",
                  path: "C:/reference.png",
                  contentType: "image/png",
                },
              },
            },
          ],
        },
      },
    });
    expect(result.assets).toEqual([
      { kind: "inline-base64", data: "AQID", contentType: "image/jpeg" },
      { kind: "inline-base64", data: "BAUG", contentType: "image/webp" },
    ]);
  });

  it("honors a custom image endpoint for reference generation", () => {
    const wire = openRouterImageAdapter.buildRequest(
      {
        ...profile,
        endpoints: { imagesGenerations: "https://gateway.example.com/images" },
      },
      {
        kind: "image",
        model: "image-model",
        prompt: "edit",
        inputs: [
          {
            type: "image",
            source: {
              kind: "bytes",
              data: new Uint8Array([1, 2, 3]),
              contentType: "image/png",
            },
          },
        ],
      }
    );
    expect(wire).toMatchObject({
      url: "https://gateway.example.com/images",
      body: {
        kind: "json",
        value: {
          input_references: [
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,AQID" },
            },
          ],
        },
      },
    });
  });

  it("rejects empty image results instead of reporting a completed generation", async () => {
    await expect(
      openRouterImageAdapter.parseResponse(jsonResponse({ data: [] }), {
        kind: "image",
        model: "image",
        prompt: "draw",
      })
    ).rejects.toThrow("returned no images");
  });

  it("maps video references and follows polling through all returned video URLs", async () => {
    const requests: WireRequest[] = [];
    const task = await executeAsyncMediaTask({
      adapter: openRouterVideoTaskAdapter,
      profile,
      request: {
        kind: "video",
        model: "bytedance/seedance-2.0",
        prompt: "ocean",
        parameters: {
          durationSeconds: 5,
          aspectRatio: "16:9",
          resolution: "720p",
          generateAudio: true,
        },
        inputs: [
          {
            type: "image",
            role: "first_frame",
            source: {
              kind: "remote-url",
              url: "https://cdn.example.com/start.png",
            },
          },
          {
            type: "image",
            role: "last_frame",
            source: {
              kind: "inline-base64",
              data: "AQID",
              contentType: "image/png",
            },
          },
          {
            type: "audio",
            source: {
              kind: "remote-url",
              url: "https://cdn.example.com/ref.mp3",
            },
          },
          {
            type: "video",
            source: {
              kind: "remote-url",
              url: "https://cdn.example.com/ref.mp4",
            },
          },
        ],
      },
      transport: queue(
        [
          jsonResponse({
            id: "job-1",
            status: "pending",
            polling_url: "/api/v1/videos/job-1?token=public",
          }),
          jsonResponse({ id: "job-1", status: "in_progress" }),
          jsonResponse({
            id: "job-1",
            status: "completed",
            unsigned_urls: [
              "https://cdn.example.com/a.mp4",
              "https://cdn.example.com/b.mp4",
            ],
          }),
        ],
        requests
      ),
      transportOptions: { requestId: "or-video" },
      pollIntervalMs: 0,
    });
    expect(requests[0]).toMatchObject({
      url: "https://openrouter.ai/api/v1/videos",
      body: {
        kind: "json",
        value: {
          model: "bytedance/seedance-2.0",
          prompt: "ocean",
          duration: 5,
          aspect_ratio: "16:9",
          resolution: "720p",
          generate_audio: true,
          frame_images: [
            {
              type: "image_url",
              frame_type: "first_frame",
              image_url: { url: "https://cdn.example.com/start.png" },
            },
            {
              type: "image_url",
              frame_type: "last_frame",
              image_url: { url: "data:image/png;base64,AQID" },
            },
          ],
          input_references: [
            {
              type: "audio_url",
              audio_url: { url: "https://cdn.example.com/ref.mp3" },
            },
            {
              type: "video_url",
              video_url: { url: "https://cdn.example.com/ref.mp4" },
            },
          ],
        },
      },
    });
    expect(requests.map((value) => value.url)).toEqual([
      "https://openrouter.ai/api/v1/videos",
      "https://openrouter.ai/api/v1/videos/job-1?token=public",
      "https://openrouter.ai/api/v1/videos/job-1?token=public",
    ]);
    expect(task).toMatchObject({
      status: "succeeded",
      progress: 100,
      assets: [
        { kind: "remote-url", url: "https://cdn.example.com/a.mp4" },
        { kind: "remote-url", url: "https://cdn.example.com/b.mp4" },
      ],
    });
  });

  it("retrieves authenticated video content when completion has no unsigned URLs", async () => {
    const requests: WireRequest[] = [];
    const task = await executeAsyncMediaTask({
      adapter: openRouterVideoTaskAdapter,
      profile,
      request: { kind: "video", model: "video", prompt: "waves" },
      transport: queue(
        [
          jsonResponse({ id: "job-2", status: "completed" }),
          response(new Uint8Array([1, 2, 3]), "video/mp4"),
        ],
        requests
      ),
      transportOptions: { requestId: "or-content" },
      pollIntervalMs: 0,
    });
    expect(requests[1]).toMatchObject({
      url: "https://openrouter.ai/api/v1/videos/job-2/content",
      headers: { Authorization: "Bearer test-key" },
    });
    expect(task.assets).toEqual([
      { kind: "inline-base64", data: "AQID", contentType: "video/mp4" },
    ]);
  });

  it.each(["failed", "expired", "cancelled"])(
    "ends video tasks with terminal %s status",
    async (status) => {
      const requests: WireRequest[] = [];
      await expect(
        executeAsyncMediaTask({
          adapter: openRouterVideoTaskAdapter,
          profile,
          request: { kind: "video", model: "video", prompt: "waves" },
          transport: queue([jsonResponse({ id: "job-3", status })], requests),
          transportOptions: { requestId: "or-terminal" },
          pollIntervalMs: 0,
        })
      ).rejects.toThrow(
        status === "cancelled"
          ? "cancelled"
          : status === "expired"
            ? "expired"
            : "failed"
      );
      expect(requests).toHaveLength(1);
    }
  );

  it("keeps authenticated polling on the configured origin and supports an explicit override", () => {
    const request = { kind: "video" as const, model: "video", prompt: "waves" };
    const task = {
      id: "job/4",
      status: "queued" as const,
      metadata: { pollingUrl: "https://foreign.example.com/poll" },
    };
    expect(() =>
      openRouterVideoTaskAdapter.buildPollRequest(profile, request, task)
    ).toThrow("outside the configured API origin");
    expect(
      openRouterVideoTaskAdapter.buildPollRequest(
        {
          ...profile,
          endpoints: {
            videoStatus: "https://gateway.example.com/jobs/{video_id}",
          },
        },
        request,
        task
      ).url
    ).toBe("https://gateway.example.com/jobs/job%2F4");
  });

  it("sends provider-defined speech voices and references and preserves PCM bytes", async () => {
    const requests: WireRequest[] = [];
    const audio = await executeSyncMediaRequest({
      adapter: openRouterAudioAdapter,
      profile,
      request: {
        kind: "audio",
        model: "speech-model",
        prompt: "Hello",
        audio: { voice: "en_paul_neutral", format: "pcm", speed: 1.2 },
        extensions: { instructions: "calm", provider: { zdr: true } },
        inputs: [
          {
            type: "audio",
            source: {
              kind: "inline-base64",
              data: "AQID",
              contentType: "audio/wav",
            },
          },
          {
            type: "audio",
            source: {
              kind: "remote-url",
              url: "https://cdn.example.com/voice.wav",
            },
          },
        ],
      },
      transport: queue(
        [response(new Uint8Array([1, 2, 3]), "audio/pcm")],
        requests
      ),
      transportOptions: { requestId: "or-speech" },
    });
    expect(requests[0]).toMatchObject({
      url: "https://openrouter.ai/api/v1/audio/speech",
      body: {
        kind: "json",
        value: {
          voice: "en_paul_neutral",
          input: "Hello",
          response_format: "pcm",
          instructions: "calm",
          provider: { zdr: true },
          speed: 1.2,
          input_references: [
            {
              type: "input_audio",
              input_audio: { data: "data:audio/wav;base64,AQID" },
            },
            {
              type: "input_audio",
              input_audio: { url: "https://cdn.example.com/voice.wav" },
            },
          ],
        },
      },
    });
    expect(audio.binary).toEqual(new Uint8Array([1, 2, 3]));
    expect(audio.metadata?.format).toBe("pcm");
    const wire = openRouterAudioAdapter.buildRequest(profile, {
      kind: "audio",
      model: "speech-model",
      prompt: "Hello",
    });
    expect(wire.body).toEqual({
      kind: "json",
      value: { model: "speech-model", input: "Hello", response_format: "mp3" },
    });
  });

  it("normalizes legacy workbench image defaults into accepted image parameters", () => {
    const wire = openRouterImageAdapter.buildRequest(profile, {
      kind: "image",
      model: "image-model",
      prompt: "draw",
      size: "1024x1024",
      quality: "standard",
      aspectRatio: "16:9",
      seed: -1,
      extensions: { resolution: "720p" },
    });
    expect(wire.body).toEqual({
      kind: "json",
      value: {
        model: "image-model",
        prompt: "draw",
        size: "1024x1024",
        quality: "auto",
        stream: false,
      },
    });
  });

  it("prefers normalized video dimensions over the workbench's legacy image size", () => {
    const wire = openRouterVideoTaskAdapter.buildCreateRequest(profile, {
      kind: "video",
      model: "video-model",
      prompt: "waves",
      parameters: {
        size: "1024x1024",
        seed: -1,
        aspectRatio: "16:9",
        resolution: "720p",
        durationSeconds: 5,
      },
    });
    expect(wire.body).toEqual({
      kind: "json",
      value: {
        model: "video-model",
        prompt: "waves",
        aspect_ratio: "16:9",
        resolution: "720p",
        duration: 5,
      },
    });
  });
});
