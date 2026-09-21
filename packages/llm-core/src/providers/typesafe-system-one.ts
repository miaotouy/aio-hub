import type { JsonValue, WireJsonValue } from "../types/json";
import type { ProviderProfile } from "../types/provider";
import type {
  SystemOneAnswer,
  SystemOneChoiceAnswer,
  SystemOneProviderAdapter,
  SystemOneRequest,
  SystemOneResponse,
  SystemOneScoreAnswer,
} from "../types/system-one";
import type { WireRequest, WireResponse } from "../types/transport";
import { readWireResponseJson } from "../utils/wire-response";

type JsonObject = Record<string, JsonValue>;

export const typeSafeSystemOneAdapter: SystemOneProviderAdapter = {
  id: "typesafe-system-one",
  buildRequest: buildTypeSafeSystemOneRequest,
  parseResponse: parseTypeSafeSystemOneResponse,
};

export function buildTypeSafeSystemOneRequest(
  profile: ProviderProfile,
  request: SystemOneRequest
): WireRequest {
  if (!request.model.trim()) {
    throw new Error("TypeSafe System One 请求缺少模型名称");
  }
  if (Object.keys(request.questions).length === 0) {
    throw new Error("TypeSafe System One 请求至少需要一个问题");
  }

  const body: Record<string, WireJsonValue> = {
    state: request.state,
    model: request.model,
    questions: request.questions as unknown as WireJsonValue,
    ...request.extensions,
  };

  return {
    method: "POST",
    url: resolveTypeSafeSystemOneEndpoint(profile),
    headers: {
      "Content-Type": "application/json",
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
      ...(request.requestId ? { "X-Request-ID": request.requestId } : {}),
      ...profile.headers,
    },
    body: { kind: "json", value: body },
    streaming: false,
  };
}

export async function parseTypeSafeSystemOneResponse(
  response: WireResponse,
  request: SystemOneRequest
): Promise<SystemOneResponse> {
  const value = await readWireResponseJson(response);
  const root = asObject(value, "TypeSafe System One 响应");
  const model = readString(root.model, "model");
  const rawAnswers = asObject(root.answers, "answers");
  const rawUsage = asObject(root.usage, "usage");
  const answers: Record<string, SystemOneAnswer> = {};

  for (const [questionId, question] of Object.entries(request.questions)) {
    if (!(questionId in rawAnswers)) {
      throw new Error(`TypeSafe System One 响应缺少问题 ${questionId} 的答案`);
    }
    answers[questionId] = parseAnswer(
      questionId,
      rawAnswers[questionId],
      question.type
    );
  }

  return {
    model,
    answers,
    usage: {
      inputTokens: readNonNegativeNumber(
        rawUsage.input_tokens,
        "usage.input_tokens"
      ),
      outputTokens: readNonNegativeNumber(
        rawUsage.output_tokens,
        "usage.output_tokens"
      ),
    },
  };
}

export function resolveTypeSafeSystemOneEndpoint(
  profile: ProviderProfile
): string {
  const explicit = profile.endpoints?.systemOne;
  if (explicit) {
    return resolveEndpoint(profile.baseUrl, explicit);
  }

  const baseUrl = profile.baseUrl.replace(/\/+$/, "");
  if (/\/v1\/systemone$/i.test(baseUrl)) return baseUrl;
  if (/\/v1$/i.test(baseUrl)) return `${baseUrl}/systemone`;
  return `${baseUrl}/v1/systemone`;
}

function resolveEndpoint(baseUrl: string, endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const base = baseUrl.replace(/\/+$/, "");
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
}

function parseAnswer(
  questionId: string,
  value: JsonValue,
  expectedType: "noul" | "choice" | "score"
): SystemOneAnswer {
  const answer = asObject(value, `answers.${questionId}`);
  const type = readString(answer.type, `answers.${questionId}.type`);
  if (type !== expectedType) {
    throw new Error(
      `TypeSafe System One 问题 ${questionId} 的答案类型应为 ${expectedType}，实际为 ${type}`
    );
  }

  if (type === "noul") {
    return {
      type,
      noul: readProbability(answer.noul, `answers.${questionId}.noul`),
    };
  }

  if (type === "choice") {
    const result: SystemOneChoiceAnswer = {
      type,
      choice: readString(answer.choice, `answers.${questionId}.choice`),
      probabilities: readNumberMap(
        answer.probabilities,
        `answers.${questionId}.probabilities`,
        true
      ),
      confidence: readProbability(
        answer.confidence,
        `answers.${questionId}.confidence`
      ),
    };
    return result;
  }

  const result: SystemOneScoreAnswer = {
    type,
    score: readFiniteNumber(answer.score, `answers.${questionId}.score`),
    legend: readStringMap(answer.legend, `answers.${questionId}.legend`),
    probabilities: readNumberMap(
      answer.probabilities,
      `answers.${questionId}.probabilities`,
      true
    ),
    confidence: readProbability(
      answer.confidence,
      `answers.${questionId}.confidence`
    ),
  };
  return result;
}

function asObject(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`TypeSafe System One 响应字段 ${path} 应为对象`);
  }
  return value as JsonObject;
}

function readString(value: JsonValue | undefined, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`TypeSafe System One 响应字段 ${path} 应为非空字符串`);
  }
  return value;
}

function readFiniteNumber(value: JsonValue | undefined, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`TypeSafe System One 响应字段 ${path} 应为有限数字`);
  }
  return value;
}

function readNonNegativeNumber(
  value: JsonValue | undefined,
  path: string
): number {
  const result = readFiniteNumber(value, path);
  if (result < 0) {
    throw new Error(`TypeSafe System One 响应字段 ${path} 不应小于 0`);
  }
  return result;
}

function readProbability(value: JsonValue | undefined, path: string): number {
  const result = readFiniteNumber(value, path);
  if (result < 0 || result > 1) {
    throw new Error(`TypeSafe System One 响应字段 ${path} 应位于 0 到 1 之间`);
  }
  return result;
}

function readNumberMap(
  value: JsonValue | undefined,
  path: string,
  probabilities = false
): Record<string, number> {
  const source = asObject(value, path);
  return Object.fromEntries(
    Object.entries(source).map(([key, item]) => [
      key,
      probabilities
        ? readProbability(item, `${path}.${key}`)
        : readFiniteNumber(item, `${path}.${key}`),
    ])
  );
}

function readStringMap(
  value: JsonValue | undefined,
  path: string
): Record<string, string> {
  const source = asObject(value, path);
  return Object.fromEntries(
    Object.entries(source).map(([key, item]) => [
      key,
      readString(item, `${path}.${key}`),
    ])
  );
}
