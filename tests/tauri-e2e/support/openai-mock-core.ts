import { createHash } from "node:crypto";
import type { RecallChatScenario } from "../fixtures/recall-scenarios";
import { embeddingTopics } from "../fixtures/recall-scenarios";

export interface MockChatMessage {
  role?: unknown;
  content?: unknown;
}

export interface EvidenceCheck {
  markerHash: string;
  matched: boolean;
}

export type ChatScenarioMatch =
  | {
      ok: true;
      scenario: RecallChatScenario;
      requiredEvidence: EvidenceCheck[];
      requiredContext: EvidenceCheck[];
      forbiddenEvidence: EvidenceCheck[];
    }
  | {
      ok: false;
      reason:
        | "scenario_not_found"
        | "multiple_scenarios"
        | "stream_mismatch"
        | "required_evidence_missing"
        | "required_context_missing"
        | "forbidden_evidence_present";
      scenarioIds: string[];
      requiredEvidence: EvidenceCheck[];
      requiredContext: EvidenceCheck[];
      forbiddenEvidence: EvidenceCheck[];
    };

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const value = part as Record<string, unknown>;
      return typeof value.text === "string" ? value.text : "";
    })
    .join("\n");
}

function checks(markers: string[], context: string): EvidenceCheck[] {
  return markers.map((marker) => ({
    markerHash: sha256(marker),
    matched: context.includes(marker),
  }));
}

export function matchChatScenario(
  messages: MockChatMessage[],
  stream: boolean,
  scenarios: RecallChatScenario[]
): ChatScenarioMatch {
  const lastUserIndex = messages
    .map((message) => message.role)
    .lastIndexOf("user");
  const lastUserText = extractMessageText(messages[lastUserIndex]?.content);
  const candidates = scenarios.filter((scenario) =>
    lastUserText.includes(scenario.userMarker)
  );

  const emptyChecks = {
    requiredEvidence: [],
    requiredContext: [],
    forbiddenEvidence: [],
  };
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "scenario_not_found",
      scenarioIds: [],
      ...emptyChecks,
    };
  }
  if (candidates.length !== 1) {
    return {
      ok: false,
      reason: "multiple_scenarios",
      scenarioIds: candidates.map((scenario) => scenario.id),
      ...emptyChecks,
    };
  }

  const scenario = candidates[0];
  const contextText = messages
    .filter((_, index) => index !== lastUserIndex)
    .map((message) => extractMessageText(message.content))
    .join("\n");
  const requiredEvidence = checks(
    scenario.requiredEvidence?.map((item) => item.contentMarker) ?? [],
    contextText
  );
  const requiredContext = checks(
    scenario.requiredContextMarkers ?? [],
    contextText
  );
  const forbiddenEvidence = checks(
    scenario.forbiddenEvidence ?? [],
    contextText
  );
  const resultBase = {
    scenarioIds: [scenario.id],
    requiredEvidence,
    requiredContext,
    forbiddenEvidence,
  };

  if (
    scenario.expectedStream !== undefined &&
    scenario.expectedStream !== stream
  ) {
    return { ok: false, reason: "stream_mismatch", ...resultBase };
  }
  if (requiredEvidence.some((item) => !item.matched)) {
    return {
      ok: false,
      reason: "required_evidence_missing",
      ...resultBase,
    };
  }
  if (requiredContext.some((item) => !item.matched)) {
    return {
      ok: false,
      reason: "required_context_missing",
      ...resultBase,
    };
  }
  if (forbiddenEvidence.some((item) => item.matched)) {
    return {
      ok: false,
      reason: "forbidden_evidence_present",
      ...resultBase,
    };
  }
  return {
    ok: true,
    scenario,
    requiredEvidence,
    requiredContext,
    forbiddenEvidence,
  };
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0)
  );
  if (magnitude === 0) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

function hashVector(input: string, dimensions: number): number[] {
  const digest = createHash("sha256").update(input).digest();
  return normalize(
    Array.from({ length: dimensions }, (_, index) =>
      Number((digest[index % digest.length] / 127.5 - 1 || 0.01).toFixed(8))
    )
  );
}

export function deterministicVector(
  input: string,
  dimensions = 8
): { vector: number[]; topicId: string | null } {
  const normalizedInput = input.toLocaleLowerCase();
  const topic = embeddingTopics.find((candidate) =>
    candidate.markers.some((marker) =>
      normalizedInput.includes(marker.toLocaleLowerCase())
    )
  );
  if (!topic || topic.axis >= dimensions) {
    return { vector: hashVector(input, dimensions), topicId: null };
  }
  const vector = Array.from({ length: dimensions }, () => 0);
  vector[topic.axis] = 1;
  return { vector, topicId: topic.id };
}

export function summarizeMessages(messages: MockChatMessage[]) {
  return messages.map((message) => {
    const content = extractMessageText(message.content);
    return {
      role: typeof message.role === "string" ? message.role : "unknown",
      contentHash: sha256(content),
      contentLength: content.length,
    };
  });
}

export function createSsePayload(
  chunks: string[],
  finishReason: "stop",
  id = "chatcmpl-e2e"
): string {
  const events = chunks.map((content, index) => ({
    id,
    object: "chat.completion.chunk",
    choices: [
      {
        index: 0,
        delta: {
          ...(index === 0 ? { role: "assistant" } : {}),
          content,
        },
        finish_reason: null,
      },
    ],
  }));
  events.push({
    id,
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
  });
  return `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
}
