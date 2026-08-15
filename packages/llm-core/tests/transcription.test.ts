import { describe, expect, it } from "vitest";
import {
  openAiTranscriptionAdapter,
  type ProviderProfile,
  type TranscriptionRequest,
  type WireResponse,
} from "../src";

const profile: ProviderProfile = {
  provider: "audiocpp",
  baseUrl: "http://127.0.0.1:8080",
};

describe("openai transcription adapter", () => {
  it("builds multipart /v1/audio/transcriptions with a base64 file part", () => {
    const request: TranscriptionRequest = {
      model: "qwen3-asr",
      audio: {
        type: "audio",
        source: {
          kind: "inline-base64",
          data: "UklGRg==",
          contentType: "audio/wav",
        },
        filename: "clip.wav",
      },
      language: "zh",
    };
    const wire = openAiTranscriptionAdapter.buildRequest(profile, request);

    expect(wire).toMatchObject({
      method: "POST",
      url: "http://127.0.0.1:8080/v1/audio/transcriptions",
    });
    expect(wire.headers["content-type"]).toBeUndefined();
    expect(wire.body).toMatchObject({
      kind: "multipart",
      parts: expect.arrayContaining([
        { name: "model", body: { kind: "text", value: "qwen3-asr" } },
        { name: "language", body: { kind: "text", value: "zh" } },
        expect.objectContaining({
          name: "file",
          filename: "clip.wav",
          body: {
            kind: "bytes",
            value: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
          },
        }),
      ]),
    });
  });

  it("keeps local audio as a native multipart file ref", () => {
    const wire = openAiTranscriptionAdapter.buildRequest(profile, {
      model: "qwen3-asr",
      audio: {
        type: "audio",
        source: {
          kind: "local-file",
          ref: {
            kind: "local-file-ref",
            path: "C:/large/clip.wav",
            contentType: "audio/wav",
          },
        },
        filename: "clip.wav",
      },
    });

    expect(wire.body).toMatchObject({
      kind: "multipart",
      parts: expect.arrayContaining([
        expect.objectContaining({
          name: "file",
          filename: "clip.wav",
          body: {
            kind: "file-ref",
            ref: expect.objectContaining({ path: "C:/large/clip.wav" }),
          },
        }),
      ]),
    });
  });

  it("parses plain-text transcripts", async () => {
    const parsed = await openAiTranscriptionAdapter.parseResponse(
      textResponse("hello world\n", { "content-type": "text/plain" }),
      sttRequest()
    );
    expect(parsed.text).toBe("hello world");
    expect(parsed.segments).toBeUndefined();
  });

  it("parses JSON transcripts with segments (verbose_json)", async () => {
    const parsed = await openAiTranscriptionAdapter.parseResponse(
      jsonResponse({
        text: "hello world",
        language: "en",
        duration: 2.5,
        segments: [
          { id: 0, start: 0, end: 1.2, text: "hello" },
          { id: 1, start: 1.2, end: 2.5, text: "world" },
        ],
      }),
      sttRequest()
    );
    expect(parsed.text).toBe("hello world");
    expect(parsed.language).toBe("en");
    expect(parsed.duration).toBe(2.5);
    expect(parsed.segments).toHaveLength(2);
    expect(parsed.segments?.[0]).toMatchObject({ text: "hello", start: 0 });
  });
});

function sttRequest(): TranscriptionRequest {
  return {
    model: "qwen3-asr",
    audio: {
      type: "audio",
      source: {
        kind: "bytes",
        data: new Uint8Array(),
        contentType: "audio/wav",
      },
    },
  };
}

function jsonResponse(value: unknown): WireResponse {
  return bytesResponse(new TextEncoder().encode(JSON.stringify(value)), {
    "content-type": "application/json",
  });
}

function textResponse(
  text: string,
  headers: Record<string, string> = {}
): WireResponse {
  return bytesResponse(new TextEncoder().encode(text), headers);
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
