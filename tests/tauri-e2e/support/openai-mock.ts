import fs from "node:fs";
import path from "node:path";
import { recallChatScenarios } from "../fixtures/recall-scenarios";
import type { RecallChatScenario } from "../fixtures/recall-scenarios";
import {
  createSsePayload,
  deterministicVector,
  extractMessageText,
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
  writeDecisionSummary?: (summary: Record<string, unknown>) => void;
}

/** JEV 决策模型标记：出现在用户消息中，用于决定模拟裁决。 */
const JEV_MARKER_PATTERN = /\[e2e:jev:([a-z-]+)\]/;
const JEV_TOOL_RESULT_MARKER = "[[AIO工具调用结果信息汇总:";

/** 后台任务派发标记：调度方用户消息携带，触发 sub-agent.ask 工具调用。 */
const BACKGROUND_MARKER_PATTERN = /\[e2e:bg:([a-z-]+)\]/;

/** 后台任务审批 e2e 固定的子智能体 ID（与 fixture 一致）。 */
const BACKGROUND_CHILD_AGENT_ID = "e2e-bg-child";

/** 后台派发标记 → 委托给子智能体的 JEV 标记。 */
const BACKGROUND_CHILD_MARKERS: Record<string, string> = {
  approve: "approve",
  escalate: "escalate",
};

function extractBackgroundMarker(messages: MockChatMessage[]): string | null {
  for (const message of messages) {
    const match = BACKGROUND_MARKER_PATTERN.exec(
      extractMessageText(message.content)
    );
    if (match) return match[1];
  }
  return null;
}

/** 构造调度方派发后台子任务的 VCP 工具调用块。 */
function buildBackgroundDispatchToolCall(childMarker: string): string {
  return [
    "<<<[TOOL_REQUEST]>>>",
    "tool_name:「始」sub-agent「末」,",
    "command:「始」ask「末」,",
    `agentId:「始」${BACKGROUND_CHILD_AGENT_ID}「末」,`,
    "mode:「始」background「末」,",
    `message:「始」执行后台任务 [e2e:jev:${childMarker}]「末」`,
    "<<<[END_TOOL_REQUEST]>>>",
  ].join("\n");
}

type JevMarker =
  | "approve"
  | "deny"
  | "escalate"
  | "contradiction"
  | "danger"
  | "force"
  | "fail";

interface JevAnswerSpec {
  risk: number;
  intent: number;
  verdict: "approve" | "deny" | "escalate";
  confidence: number;
}

/** 每个标记对应的模拟裁决（fail 走 HTTP 500，这里给出占位）。 */
const JEV_DECISIONS: Record<string, JevAnswerSpec> = {
  approve: { risk: 0.1, intent: 0.9, verdict: "approve", confidence: 0.95 },
  deny: { risk: 0.9, intent: 0.1, verdict: "deny", confidence: 0.95 },
  escalate: { risk: 0.5, intent: 0.5, verdict: "escalate", confidence: 0.95 },
  contradiction: {
    risk: 0.9,
    intent: 0.9,
    verdict: "approve",
    confidence: 0.95,
  },
  fail: { risk: 0.1, intent: 0.9, verdict: "approve", confidence: 0.95 },
};

function extractJevMarker(messages: MockChatMessage[]): string | null {
  for (const message of messages) {
    const match = JEV_MARKER_PATTERN.exec(extractMessageText(message.content));
    if (match) return match[1];
  }
  return null;
}

function hasToolResult(messages: MockChatMessage[]): boolean {
  return messages.some((message) =>
    extractMessageText(message.content).includes(JEV_TOOL_RESULT_MARKER)
  );
}

/** 构造第一轮的 VCP 工具调用块（危险 / 强制审批标记使用不同工具）。 */
function buildJevToolCall(marker: string, agentId: string): string {
  if (marker === "danger") {
    return [
      "<<<[TOOL_REQUEST]>>>",
      "tool_name:「始」json-formatter「末」,",
      "command:「始」formatJson「末」,",
      'text:「始」{"cmd":"sudo rm -rf /"}「末」',
      "<<<[END_TOOL_REQUEST]>>>",
    ].join("\n");
  }
  if (marker === "force") {
    return [
      "<<<[TOOL_REQUEST]>>>",
      "tool_name:「始」llm-chat-agent-mgmt「末」,",
      "command:「始」set_agent_field「末」,",
      `agentId:「始」${agentId}「末」,`,
      "path:「始」toolCallConfig.decisionArbitration.enabled「末」,",
      "value:「始」true「末」",
      "<<<[END_TOOL_REQUEST]>>>",
    ].join("\n");
  }
  return [
    "<<<[TOOL_REQUEST]>>>",
    "tool_name:「始」json-formatter「末」,",
    "command:「始」formatJson「末」,",
    `text:「始」{"e2e":"${marker}"}「末」`,
    "<<<[END_TOOL_REQUEST]>>>",
  ].join("\n");
}

function buildJevSystemOneResponse(
  marker: string | null,
  model: string
): unknown {
  const spec = JEV_DECISIONS[marker ?? ""] ?? JEV_DECISIONS.escalate;
  return {
    model,
    answers: {
      risk: { type: "noul", noul: spec.risk },
      intent: { type: "noul", noul: spec.intent },
      verdict: {
        type: "choice",
        choice: spec.verdict,
        probabilities: {},
        confidence: spec.confidence,
      },
    },
    usage: { input_tokens: 12, output_tokens: 0 },
  };
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
          { id: "e2e-jev", object: "model", owned_by: "aiohub-e2e" },
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

    if (request.method === "POST" && url.pathname === "/v1/systemone") {
      const model = typeof body.model === "string" ? body.model : "e2e-jev";
      const stateText = JSON.stringify(body.state ?? {});
      const markerMatch = JEV_MARKER_PATTERN.exec(stateText);
      const marker = markerMatch ? markerMatch[1] : null;
      const base = {
        requestId,
        at: new Date().toISOString(),
        endpoint: url.pathname,
        model,
        marker,
      };
      if (marker === "fail") {
        const summary = {
          ...base,
          status: 500,
          durationMs: Number((performance.now() - startedAt).toFixed(3)),
        };
        requests.push({ type: "systemone", ...summary });
        options.writeDecisionSummary?.(summary);
        return json(
          { error: { message: "e2e injected decision failure" } },
          500
        );
      }
      const response = buildJevSystemOneResponse(marker, model) as {
        answers: {
          risk: { noul: number };
          verdict: { choice: string };
        };
      };
      const summary = {
        ...base,
        status: 200,
        verdict: response.answers.verdict.choice,
        risk: response.answers.risk.noul,
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
      };
      requests.push({ type: "systemone", ...summary });
      options.writeDecisionSummary?.(summary);
      return json(response);
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      const messages = Array.isArray(body.messages)
        ? (body.messages as MockChatMessage[])
        : [];
      const stream = body.stream === true;
      rawChatRequests.push({ requestId, messages });

      // 后台任务审批 E2E：调度方按 bg 标记派发 sub-agent.ask（background）。
      const backgroundMarker = extractBackgroundMarker(messages);
      if (backgroundMarker) {
        const toolResultPresent = hasToolResult(messages);
        const childMarker =
          BACKGROUND_CHILD_MARKERS[backgroundMarker] ?? "escalate";
        const content = toolResultPresent
          ? "E2E 后台任务已派发。"
          : buildBackgroundDispatchToolCall(childMarker);
        const backgroundSummary = {
          requestId,
          at: new Date().toISOString(),
          endpoint: url.pathname,
          model: typeof body.model === "string" ? body.model : "e2e-chat",
          stream,
          messages: summarizeMessages(messages),
          scenarioId: `e2e:bg:${backgroundMarker}${toolResultPresent ? ":result" : ""}`,
          scenarioMatch: true,
          status: 200,
          durationMs: Number((performance.now() - startedAt).toFixed(3)),
        };
        requests.push({ type: "chat", ...backgroundSummary });
        options.writeChatSummary?.(backgroundSummary);
        if (stream) {
          return new Response(createSsePayload([content], "stop"), {
            headers: {
              "content-type": "text/event-stream",
              "cache-control": "no-cache",
              "access-control-allow-origin": "*",
              "x-e2e-request-id": requestId,
            },
          });
        }
        return json({
          id: "chatcmpl-e2e",
          object: "chat.completion",
          model: body.model ?? "e2e-chat",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }

      // JEV 决策仲裁 E2E：按用户消息标记返回 VCP 工具调用或收尾文本。
      const jevMarker = extractJevMarker(messages);
      if (jevMarker) {
        const toolResultPresent = hasToolResult(messages);
        const content = toolResultPresent
          ? "E2E JEV 工具执行完成。"
          : buildJevToolCall(jevMarker, "e2e-decision-agent");
        const jevSummary = {
          requestId,
          at: new Date().toISOString(),
          endpoint: url.pathname,
          model: typeof body.model === "string" ? body.model : "e2e-chat",
          stream,
          messages: summarizeMessages(messages),
          scenarioId: `e2e:jev:${jevMarker}${toolResultPresent ? ":result" : ""}`,
          scenarioMatch: true,
          status: 200,
          durationMs: Number((performance.now() - startedAt).toFixed(3)),
        };
        requests.push({ type: "chat", ...jevSummary });
        options.writeChatSummary?.(jevSummary);
        if (stream) {
          return new Response(createSsePayload([content], "stop"), {
            headers: {
              "content-type": "text/event-stream",
              "cache-control": "no-cache",
              "access-control-allow-origin": "*",
              "x-e2e-request-id": requestId,
            },
          });
        }
        return json({
          id: "chatcmpl-e2e",
          object: "chat.completion",
          model: body.model ?? "e2e-chat",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }

      const match = matchChatScenario(messages, stream, scenarios);
      const status = match.ok ? 200 : 422;
      const scenarioId = match.ok ? match.scenario.id : match.scenarioIds[0];
      const matchedScenario = scenarios.find(
        (scenario) => scenario.id === scenarioId
      );
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
          : (matchedScenario?.requiredEvidence?.map((item) => item.entryId) ??
            []),
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
  const decisionLogPath = path.join(
    options.artifactDir,
    "decision-requests.jsonl"
  );
  fs.writeFileSync(embeddingLogPath, "", "utf8");
  fs.writeFileSync(chatLogPath, "", "utf8");
  fs.writeFileSync(decisionLogPath, "", "utf8");

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
    writeDecisionSummary: (summary) =>
      fs.appendFileSync(
        decisionLogPath,
        `${JSON.stringify(summary)}\n`,
        "utf8"
      ),
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
