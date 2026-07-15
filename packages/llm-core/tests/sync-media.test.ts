import { describe, expect, it } from "vitest";
import {
  geminiImageAdapter,
  openAiAudioAdapter,
  openAiImageAdapter,
  siliconFlowImageAdapter,
  type ProviderProfile,
  type SyncMediaRequest,
  type WireResponse,
} from "../src";

const profile: ProviderProfile = {
  provider: "openai",
  baseUrl: "https://api.example.com/v1",
  apiKey: "secret",
};

describe("sync media adapters", () => {
  it("builds OpenAI image JSON and normalizes URL/base64 assets", async () => {
    const request: SyncMediaRequest = {
      kind: "image",
      model: "gpt-image-1",
      prompt: "draw a lighthouse",
      count: 2,
      size: "1024x1024",
      responseFormat: "b64_json",
    };
    const wire = openAiImageAdapter.buildRequest(profile, request);

    expect(wire).toMatchObject({
      url: "https://api.example.com/v1/images/generations",
      headers: { Authorization: "Bearer secret" },
      body: {
        kind: "json",
        value: {
          model: "gpt-image-1",
          prompt: "draw a lighthouse",
          output_format: "b64_json",
        },
      },
    });

    const parsed = await openAiImageAdapter.parseResponse(
      jsonResponse({
        data: [
          { url: "https://cdn.example.com/a.png", revised_prompt: "revised" },
          { b64_json: "aW1hZ2U=" },
        ],
        seed: 42,
      }),
      request
    );
    expect(parsed.assets).toEqual([
      {
        kind: "remote-url",
        url: "https://cdn.example.com/a.png",
        revisedPrompt: "revised",
      },
      {
        kind: "inline-base64",
        data: "aW1hZ2U=",
        contentType: "image/png",
        revisedPrompt: undefined,
      },
    ]);
    expect(parsed.metadata?.seed).toBe(42);
  });

  it("keeps local edit images as native multipart file refs", () => {
    const wire = openAiImageAdapter.buildRequest(profile, {
      kind: "image",
      model: "gpt-image-1",
      prompt: "edit",
      inputs: [
        {
          type: "image",
          source: {
            kind: "local-file",
            ref: {
              kind: "local-file-ref",
              path: "C:/large/reference.png",
              contentType: "image/png",
            },
          },
        },
      ],
    });

    expect(wire.url).toContain("images/edits");
    expect(wire.body).toMatchObject({
      kind: "multipart",
      parts: expect.arrayContaining([
        expect.objectContaining({
          name: "image[]",
          body: {
            kind: "file-ref",
            ref: expect.objectContaining({ path: "C:/large/reference.png" }),
          },
        }),
      ]),
    });
  });

  it("builds SiliconFlow and Gemini provider-specific payloads", () => {
    const silicon = siliconFlowImageAdapter.buildRequest(
      { ...profile, provider: "siliconflow" },
      {
        kind: "image",
        model: "Qwen/Qwen-Image-Edit-2509",
        prompt: "edit",
        size: "1024x1024",
        seed: -1,
        extensions: { cfg: 7 },
      }
    );
    expect(silicon.body).toEqual({
      kind: "json",
      value: expect.not.objectContaining({ image_size: expect.anything(), seed: expect.anything() }),
    });

    const gemini = geminiImageAdapter.buildRequest(
      {
        provider: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com",
        apiKey: "gemini-key",
      },
      {
        kind: "image",
        model: "gemini-2.5-flash-image",
        prompt: "draw",
        size: "2k",
        aspectRatio: "16:9",
      }
    );
    expect(gemini).toMatchObject({
      url: expect.stringContaining(
        "/v1beta/models/gemini-2.5-flash-image:generateContent"
      ),
      body: {
        kind: "json",
        value: {
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { imageSize: "2K", aspectRatio: "16:9" },
          },
        },
      },
    });
  });

  it("preserves binary TTS output", async () => {
    const request: SyncMediaRequest = {
      kind: "audio",
      model: "gpt-4o-mini-tts",
      prompt: "hello",
      audio: { voice: "alloy", format: "mp3" },
    };
    const wire = openAiAudioAdapter.buildRequest(profile, request);
    expect(wire.body).toMatchObject({
      kind: "json",
      value: { input: "hello", voice: "alloy", response_format: "mp3" },
    });

    const parsed = await openAiAudioAdapter.parseResponse(
      bytesResponse(new Uint8Array([1, 2, 3]), { "content-type": "audio/mpeg" }),
      request
    );
    expect(parsed.binary).toEqual(new Uint8Array([1, 2, 3]));
    expect(parsed.assets[0]).toMatchObject({
      kind: "inline-base64",
      data: "AQID",
      contentType: "audio/mpeg",
    });
  });
});

function jsonResponse(value: unknown): WireResponse {
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
