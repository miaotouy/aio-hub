import { describe, expect, it } from "vitest";
import {
  anthropicMessagesAdapter,
  buildAnthropicMessagesRequest,
  buildOpenAiCompatibleRequest,
  buildOpenAiResponsesRequest,
  openAiCompatibleAdapter,
  type LlmRequest,
  type ProviderProfile,
  type WireRequest,
} from "../src";
import {
  audioInputFormat,
  documentFilename,
} from "../src/providers/media-input";

const openAiProfile: ProviderProfile = {
  provider: "openai-compatible",
  baseUrl: "https://api.example.com",
  apiKey: "secret-key",
};

const anthropicProfile: ProviderProfile = {
  provider: "claude",
  baseUrl: "https://api.anthropic.com",
  apiKey: "secret-key",
};

const responsesProfile: ProviderProfile = {
  provider: "openai-responses",
  baseUrl: "https://api.example.com",
  apiKey: "secret-key",
};

function singlePartRequest(
  part: LlmRequest["messages"][number]["content"]
): LlmRequest {
  return {
    model: "test-model",
    maxTokens: 64,
    messages: [{ role: "user", content: part }],
  };
}

function jsonBody<T>(wire: WireRequest): T {
  if (!wire.body || wire.body.kind !== "json") {
    throw new Error("expected a json wire body");
  }
  return wire.body.value as unknown as T;
}

type MessageContent = Array<Record<string, unknown>>;

function openAiMessageContent(wire: WireRequest): MessageContent {
  return jsonBody<{ messages: Array<{ content: MessageContent }> }>(wire)
    .messages[0].content;
}

function responsesInputContent(wire: WireRequest): MessageContent {
  return jsonBody<{ input: Array<{ content: MessageContent }> }>(wire).input[0]
    .content;
}

function anthropicMessageContent(wire: WireRequest): MessageContent {
  return jsonBody<{ messages: Array<{ content: MessageContent }> }>(wire)
    .messages[0].content;
}

describe("media input wire normalization", () => {
  it("maps audio MIME types to their real input_audio encodings", () => {
    expect(audioInputFormat("audio/wav")).toBe("wav");
    expect(audioInputFormat("audio/x-wav")).toBe("wav");
    expect(audioInputFormat("audio/mpeg")).toBe("mp3");
    expect(audioInputFormat("audio/ogg; codecs=opus")).toBe("ogg");
    expect(audioInputFormat("audio/flac")).toBe("flac");
    expect(audioInputFormat("audio/webm")).toBe("webm");
    expect(audioInputFormat(undefined)).toBe("mp3");
    expect(audioInputFormat("application/octet-stream")).toBe("octet-stream");
  });

  it("derives document filenames from explicit names or MIME types", () => {
    expect(documentFilename({ filename: "notes.txt" }, "text/plain")).toBe(
      "notes.txt"
    );
    expect(documentFilename(undefined, "application/pdf")).toBe("document.pdf");
    expect(
      documentFilename(
        undefined,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe("document.docx");
    expect(documentFilename(undefined, "text/csv")).toBe("document.csv");
    expect(documentFilename(undefined, "application/x-custom")).toBe(
      "document.x-custom"
    );
  });

  it("sends OpenAI-compatible audio with its real encoding, not a forced mp3 label", () => {
    const wire = buildOpenAiCompatibleRequest(
      openAiProfile,
      singlePartRequest([
        {
          type: "audio",
          mediaType: "audio/ogg",
          source: { type: "base64", data: "b2dn", contentType: "audio/ogg" },
        },
      ])
    );
    const content = openAiMessageContent(wire);

    expect(content).toEqual([
      {
        type: "input_audio",
        input_audio: { data: "b2dn", format: "ogg" },
      },
    ]);
  });

  it("emits the standard OpenAI file shape for non-PDF documents with a MIME-derived filename", () => {
    const wire = buildOpenAiCompatibleRequest(
      openAiProfile,
      singlePartRequest([
        {
          type: "document",
          mediaType: "text/csv",
          source: {
            type: "base64",
            media_type: "text/csv",
            data: "aGVsbG8=",
            filename: "data.csv",
          },
        },
      ])
    );
    const content = openAiMessageContent(wire);

    expect(content).toEqual([
      {
        type: "file",
        file: {
          filename: "data.csv",
          file_data: "data:text/csv;base64,aGVsbG8=",
        },
      },
    ]);
  });

  it("keeps image-typed document parts as image_url", () => {
    const wire = buildOpenAiCompatibleRequest(
      openAiProfile,
      singlePartRequest([
        {
          type: "document",
          mediaType: "image/png",
          source: {
            type: "base64",
            media_type: "image/png",
            data: "aW1n",
          },
        },
      ])
    );
    const content = openAiMessageContent(wire);

    expect(content).toEqual([
      { type: "image_url", image_url: { url: "data:image/png;base64,aW1n" } },
    ]);
  });

  it("no longer drops Anthropic audio and video parts silently", () => {
    const wire = buildAnthropicMessagesRequest(
      anthropicProfile,
      singlePartRequest([
        {
          type: "text",
          text: "listen",
        },
        {
          type: "audio",
          mediaType: "audio/wav",
          source: {
            type: "base64",
            media_type: "audio/wav",
            data: "d2F2",
          },
        },
        {
          type: "video",
          mediaType: "video/mp4",
          source: {
            type: "base64",
            media_type: "video/mp4",
            data: "bXA0",
          },
        },
      ])
    );
    const blocks = anthropicMessageContent(wire);

    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toEqual({
      type: "text",
      text: "[content omitted: audio input (audio/wav) is not supported by anthropic-messages]",
    });
    expect(blocks[2]).toEqual({
      type: "text",
      text: "[content omitted: video input (video/mp4) is not supported by anthropic-messages]",
    });
  });

  it("normalizes Responses input_audio to the { data, format } shape", () => {
    const wire = buildOpenAiResponsesRequest(
      responsesProfile,
      singlePartRequest([
        {
          type: "audio",
          mediaType: "audio/wav",
          source: {
            type: "base64",
            media_type: "audio/wav",
            data: "d2F2",
          },
        },
      ])
    );
    const content = responsesInputContent(wire);

    expect(content).toEqual([
      {
        type: "input_audio",
        input_audio: { data: "d2F2", format: "wav" },
      },
    ]);
  });

  it("strips data URL prefixes for Responses audio sources", () => {
    const wire = buildOpenAiResponsesRequest(
      responsesProfile,
      singlePartRequest([
        {
          type: "audio",
          source: "data:audio/mpeg;base64,bXAz",
        },
      ])
    );
    const content = responsesInputContent(wire);

    expect(content).toEqual([
      {
        type: "input_audio",
        input_audio: { data: "bXAz", format: "mp3" },
      },
    ]);
  });

  it("derives Responses input_file filenames from MIME instead of assuming PDF", () => {
    const wire = buildOpenAiResponsesRequest(
      responsesProfile,
      singlePartRequest([
        {
          type: "document",
          mediaType: "text/markdown",
          source: {
            data: "IyBIZWxsbw==",
            contentType: "text/markdown",
            displayName: "readme.md",
          },
        },
      ])
    );
    const content = responsesInputContent(wire);

    expect(content).toEqual([
      {
        type: "input_file",
        filename: "readme.md",
        file_data: "data:text/markdown;base64,IyBIZWxsbw==",
      },
    ]);
  });

  it("keeps provider adapters exported for request building", () => {
    expect(openAiCompatibleAdapter.buildRequest).toBeDefined();
    expect(anthropicMessagesAdapter.buildRequest).toBeDefined();
  });
});
