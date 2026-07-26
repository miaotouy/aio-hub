import { createHash } from "node:crypto";
import {
  createSsePayload,
  sha256,
} from "../../tauri-e2e/support/openai-mock-core";
import type { ArtifactManager } from "./artifacts";

export const MOBILE_E2E_MODEL_ID = "e2e-mobile-attachment";
export const MOBILE_E2E_HTTP_ERROR_MODEL_ID = "e2e-mobile-http-error";
export const MOBILE_E2E_INTERRUPTED_MODEL_ID = "e2e-mobile-interrupted-stream";
export const MOBILE_E2E_DELAYED_MODEL_ID = "e2e-mobile-delayed-stream";
export const MOBILE_E2E_TIMEOUT_MODEL_ID = "e2e-mobile-timeout";

export const MOBILE_E2E_MODEL_IDS = [
  MOBILE_E2E_MODEL_ID,
  MOBILE_E2E_HTTP_ERROR_MODEL_ID,
  MOBILE_E2E_INTERRUPTED_MODEL_ID,
  MOBILE_E2E_DELAYED_MODEL_ID,
  MOBILE_E2E_TIMEOUT_MODEL_ID,
];

export type MobileE2eResponseMode =
  | "attachment"
  | "http-error"
  | "interrupted-stream"
  | "delayed-stream"
  | "timeout";

export function responseModeForModel(
  model: string | null
): MobileE2eResponseMode {
  if (model === MOBILE_E2E_HTTP_ERROR_MODEL_ID) return "http-error";
  if (model === MOBILE_E2E_INTERRUPTED_MODEL_ID) return "interrupted-stream";
  if (model === MOBILE_E2E_DELAYED_MODEL_ID) return "delayed-stream";
  if (model === MOBILE_E2E_TIMEOUT_MODEL_ID) return "timeout";
  return "attachment";
}

export function sseEventCountForMode(
  mode: MobileE2eResponseMode,
  streaming: boolean,
  attachmentMatch: boolean
): number {
  if (!streaming || !attachmentMatch || mode === "timeout") return 0;
  if (mode === "interrupted-stream" || mode === "delayed-stream") return 1;
  return 4;
}

export interface AttachmentSummary {
  mimeType: string;
  bytes: number;
  sha256: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readDataUrl(value: unknown): AttachmentSummary | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=_-]+)$/s);
  if (!match) return null;
  const bytes = Buffer.from(
    match[2].replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  );
  return {
    mimeType: match[1],
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function summarizeGenerationParameters(body: Record<string, unknown>) {
  const readNumber = (key: string): number | null => {
    const value = body[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const stop = body.stop;
  return {
    temperature: readNumber("temperature"),
    maxTokens: readNumber("max_tokens") ?? readNumber("max_completion_tokens"),
    topP: readNumber("top_p"),
    frequencyPenalty: readNumber("frequency_penalty"),
    presencePenalty: readNumber("presence_penalty"),
    stopCount: Array.isArray(stop)
      ? stop.filter((item) => typeof item === "string").length
      : 0,
  };
}

export function hasUserProfileTag(messages: unknown): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some((message) => {
    const content = asRecord(message)?.content;
    return (
      typeof content === "string" &&
      /<user_profile\s+name="[^"]+">/.test(content)
    );
  });
}

export function summarizeOpenAiAttachments(
  messages: unknown
): AttachmentSummary[] {
  if (!Array.isArray(messages)) return [];
  const summaries: AttachmentSummary[] = [];
  for (const message of messages) {
    const content = asRecord(message)?.content;
    if (!Array.isArray(content)) continue;
    for (const rawPart of content) {
      const part = asRecord(rawPart);
      if (!part) continue;
      const imageUrl = asRecord(part.image_url)?.url ?? part.image_url;
      const inputAudio = asRecord(part.input_audio)?.data;
      const fileData = asRecord(part.file)?.file_data ?? part.file_data;
      const candidates = [imageUrl, fileData, inputAudio];
      for (const candidate of candidates) {
        const summary = readDataUrl(candidate);
        if (summary) summaries.push(summary);
      }
    }
  }
  return summaries;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

function sseEvent(id: string, content: string): Uint8Array {
  return new TextEncoder().encode(
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content },
          finish_reason: null,
        },
      ],
    })}\n\n`
  );
}

function sseHeaders(requestId: string): HeadersInit {
  return {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "access-control-allow-origin": "*",
    "x-e2e-request-id": requestId,
  };
}

export function startMobileOpenAiConformanceServer(options: {
  artifacts: ArtifactManager;
  expectedAttachment?: AttachmentSummary;
  port?: number;
}) {
  let sequence = 0;
  const requests: Array<Record<string, unknown>> = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    idleTimeout: 120,
    async fetch(request) {
      const requestId = `mobile-e2e-${String(++sequence).padStart(4, "0")}`;
      const url = new URL(request.url);
      if (request.method === "OPTIONS") return json({ ok: true });
      if (request.method === "GET" && url.pathname === "/v1/models") {
        return json({
          object: "list",
          data: MOBILE_E2E_MODEL_IDS.map((id) => ({
            id,
            object: "model",
            owned_by: "aiohub-e2e",
          })),
        });
      }
      if (
        request.method !== "POST" ||
        url.pathname !== "/v1/chat/completions"
      ) {
        return json({ error: { message: "Unhandled E2E route" } }, 404);
      }
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: { message: "Invalid JSON body" } }, 400);
      }
      const attachments = summarizeOpenAiAttachments(body.messages);
      const model = typeof body.model === "string" ? body.model : null;
      const mode =
        body.stream === true ? responseModeForModel(model) : "attachment";
      const expected = options.expectedAttachment;
      const attachmentRequired = Boolean(
        expected && body.stream === true && mode === "attachment"
      );
      const attachmentMatch =
        !attachmentRequired ||
        attachments.some(
          (attachment) =>
            expected &&
            attachment.mimeType === expected.mimeType &&
            attachment.bytes === expected.bytes &&
            attachment.sha256 === expected.sha256
        );
      const responseStatus =
        mode === "http-error" ? 429 : attachmentMatch ? 200 : 422;
      const summary = {
        requestId,
        at: new Date().toISOString(),
        endpoint: url.pathname,
        model,
        mode,
        stream: body.stream === true,
        messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
        messageDigest: sha256(JSON.stringify(body.messages ?? [])),
        attachments,
        generationParameters: summarizeGenerationParameters(body),
        hasUserProfileTag: hasUserProfileTag(body.messages),
        attachmentRequired,
        attachmentMatch,
        status: responseStatus,
        sseEventCount: sseEventCountForMode(
          mode,
          body.stream === true,
          attachmentMatch
        ),
      };
      requests.push(summary);
      options.artifacts.appendRequestSummary(summary);
      if (!attachmentMatch) {
        return json(
          {
            error: {
              code: "attachment_mismatch",
              message: "Attachment did not match the deterministic fixture.",
              requestId,
            },
          },
          422
        );
      }
      if (mode === "http-error") {
        return json(
          {
            error: {
              code: "e2e_rate_limited",
              message: "Injected Android E2E HTTP failure.",
              requestId,
            },
          },
          429
        );
      }
      if (mode === "interrupted-stream") {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(sseEvent(requestId, "Partial response"));
              controller.close();
            },
          }),
          { headers: sseHeaders(requestId) }
        );
      }
      if (mode === "delayed-stream") {
        let cancelled = false;
        return new Response(
          new ReadableStream({
            async start(controller) {
              controller.enqueue(sseEvent(requestId, "Still generating"));
              await Bun.sleep(30_000);
              if (cancelled) return;
              controller.enqueue(
                new TextEncoder().encode(
                  createSsePayload([" after delay"], "stop", requestId)
                )
              );
              controller.close();
            },
            cancel() {
              cancelled = true;
            },
          }),
          { headers: sseHeaders(requestId) }
        );
      }
      if (mode === "timeout") {
        await Bun.sleep(90_000);
        return new Response(
          createSsePayload(["Late response"], "stop", requestId),
          {
            headers: sseHeaders(requestId),
          }
        );
      }
      const chunks = attachmentRequired
        ? ["Attachment ", "verified ", "by Android E2E."]
        : ["Android E2E Chat"];
      if (body.stream === true) {
        return new Response(createSsePayload(chunks, "stop", requestId), {
          headers: sseHeaders(requestId),
        });
      }
      return json({
        id: requestId,
        object: "chat.completion",
        model: body.model ?? MOBILE_E2E_MODEL_ID,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: chunks.join("") },
            finish_reason: "stop",
          },
        ],
      });
    },
  });
  return {
    port: server.port,
    baseUrl: `http://127.0.0.1:${server.port}/v1`,
    deviceBaseUrl: `http://127.0.0.1:${server.port}/v1`,
    requests,
    stop: () => server.stop(true),
  };
}
