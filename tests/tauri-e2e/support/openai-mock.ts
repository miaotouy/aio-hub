import fs from "node:fs";
import path from "node:path";
import { recallChatScenarios } from "../fixtures/recall-scenarios";
import type { RecallChatScenario } from "../fixtures/recall-scenarios";
import {
  createSsePayload,
  deterministicVector,
  matchChatScenario,
  sha256,
  summarizeMessages,
} from "./openai-mock-core";
import type { MockChatMessage } from "./openai-mock-core";

interface OpenAiMockOptions {
  artifactDir: string;
  port?: number;
  scenarios?: RecallChatScenario[];
}

interface OpenAiMockHandlerOptions {
  scenarios?: RecallChatScenario[];
  writeEmbeddingSummary?: (summary: Record<string, unknown>) => void;
  writeChatSummary?: (summary: Record<string, unknown>) => void;
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

function readDimensions(value: unknown): number {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 4096
  ) {
    return value;
  }
  return 8;
}

export function createOpenAiMockHandler(
  options: OpenAiMockHandlerOptions = {}
) {
  const scenarios = options.scenarios ?? recallChatScenarios;
  const requests: Array<Record<string, unknown>> = [];
  const rawChatRequests: Array<{
    requestId: string;
    messages: MockChatMessage[];
  }> = [];
  let requestSequence = 0;

  const fetch = async (request: Request): Promise<Response> => {
    const startedAt = performance.now();
    const requestId = `e2e-${String(++requestSequence).padStart(6, "0")}`;
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({ ok: true });
    if (url.pathname === "/health") return json({ ok: true });
    if (url.pathname === "/__requests") return json({ requests });

    let body: Record<string, unknown> = {};
    if (request.method === "POST") {
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: { message: "Invalid JSON body" } }, 400);
      }
    }

    if (request.method === "GET" && url.pathname === "/v1/models") {
      return json({
        object: "list",
        data: [
          { id: "e2e-chat", object: "model", owned_by: "aiohub-e2e" },
          {
            id: "e2e-embedding",
            object: "model",
            owned_by: "aiohub-e2e",
          },
        ],
      });
    }

    if (request.method === "POST" && url.pathname === "/v1/embeddings") {
      const rawInput = Array.isArray(body.input)
        ? body.input
        : [body.input ?? ""];
      const inputs = rawInput.map((item) => String(item));
      const dimensions = readDimensions(body.dimensions);
      const generated = inputs.map((input) =>
        deterministicVector(input, dimensions)
      );
      const summary = {
        requestId,
        at: new Date().toISOString(),
        endpoint: url.pathname,
        model: typeof body.model === "string" ? body.model : "e2e-embedding",
        inputCount: inputs.length,
        inputs: inputs.map((input, index) => ({
          index,
          inputHash: sha256(input),
          inputLength: input.length,
          topicId: generated[index].topicId,
        })),
        responseCount: generated.length,
        dimension: dimensions,
        status: 200,
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
      };
      requests.push({ type: "embedding", ...summary });
      options.writeEmbeddingSummary?.(summary);
      return json({
        object: "list",
        model: body.model ?? "e2e-embedding",
        data: generated.map((item, index) => ({
          object: "embedding",
          index,
          embedding: item.vector,
        })),
        usage: {
          prompt_tokens: inputs.length,
          total_tokens: inputs.length,
        },
      });
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      const messages = Array.isArray(body.messages)
        ? (body.messages as MockChatMessage[])
        : [];
      const stream = body.stream === true;
      rawChatRequests.push({ requestId, messages });
      const match = matchChatScenario(messages, stream, scenarios);
      const status = match.ok ? 200 : 422;
      const scenarioId = match.ok ? match.scenario.id : match.scenarioIds[0];
      const summary = {
        requestId,
        at: new Date().toISOString(),
        endpoint: url.pathname,
        model: typeof body.model === "string" ? body.model : "e2e-chat",
        stream,
        messages: summarizeMessages(messages),
        scenarioId: scenarioId ?? null,
        scenarioMatch: match.ok,
        mismatchReason: match.ok ? null : match.reason,
        expectedEntryIds: match.ok
          ? (match.scenario.requiredEvidence?.map((item) => item.entryId) ?? [])
          : [],
        requiredEvidence: match.requiredEvidence,
        requiredContext: match.requiredContext,
        forbiddenEvidence: match.forbiddenEvidence,
        status,
        sseChunkCount:
          match.ok && stream ? match.scenario.response.chunks.length : 0,
        finishReason: match.ok ? match.scenario.response.finishReason : null,
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
      };
      requests.push({ type: "chat", ...summary });
      options.writeChatSummary?.(summary);

      if (!match.ok) {
        return json(
          {
            error: {
              code: "e2e_scenario_mismatch",
              message: "Chat request did not satisfy its E2E scenario",
              reason: match.reason,
              scenarioIds: match.scenarioIds,
              requestId,
            },
          },
          422
        );
      }

      const content = match.scenario.response.chunks.join("");
      if (stream) {
        return new Response(
          createSsePayload(
            match.scenario.response.chunks,
            match.scenario.response.finishReason
          ),
          {
            headers: {
              "content-type": "text/event-stream",
              "cache-control": "no-cache",
              "access-control-allow-origin": "*",
              "x-e2e-request-id": requestId,
            },
          }
        );
      }
      return json({
        id: "chatcmpl-e2e",
        object: "chat.completion",
        model: body.model ?? "e2e-chat",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finish_reason: match.scenario.response.finishReason,
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }

    return json(
      { error: { message: `Unhandled mock route: ${url.pathname}` } },
      404
    );
  };

  return { fetch, requests, rawChatRequests };
}

export function startOpenAiMock(options: OpenAiMockOptions) {
  fs.mkdirSync(options.artifactDir, { recursive: true });
  const embeddingLogPath = path.join(
    options.artifactDir,
    "embedding-requests.jsonl"
  );
  const chatLogPath = path.join(options.artifactDir, "chat-requests.jsonl");
  fs.writeFileSync(embeddingLogPath, "", "utf8");
  fs.writeFileSync(chatLogPath, "", "utf8");

  const handler = createOpenAiMockHandler({
    scenarios: options.scenarios,
    writeEmbeddingSummary: (summary) =>
      fs.appendFileSync(
        embeddingLogPath,
        `${JSON.stringify(summary)}\n`,
        "utf8"
      ),
    writeChatSummary: (summary) =>
      fs.appendFileSync(chatLogPath, `${JSON.stringify(summary)}\n`, "utf8"),
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    fetch: handler.fetch,
  });

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    port: server.port,
    requests: handler.requests,
    rawChatRequests: handler.rawChatRequests,
    stop: () => server.stop(true),
  };
}
