import type {
  ServiceMetadata,
  ToolContext,
  ToolRegistry,
} from "@/services/types";
import {
  routeRetrieval,
  type RetrievalMode,
  type RetrievalRouterRequest,
  type RetrievalRouterResponse,
} from "@/services/retrievalRouter";
import type { KnowledgeSearchStrategy } from "@/tools/knowledge-base/types";
import type { RecallProfile } from "@/tools/recall/types/search";
import {
  authorizeKnowledgeLibraryScope,
  resolveKnowledgeApplicationContext,
} from "@/tools/knowledge-base/application";

const RETRIEVAL_MODES = new Set<RetrievalMode>([
  "recall",
  "knowledge",
  "mixed",
]);
const RECALL_PROFILES = new Set<RecallProfile>(["semantic", "associative"]);
const KNOWLEDGE_STRATEGIES = new Set<KnowledgeSearchStrategy>([
  "auto",
  "keyword",
  "semantic",
  "hybrid",
]);

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value !== "string" || !value.trim()) return [];
  const raw = value.trim();
  if (raw.startsWith("[")) {
    try {
      return parseStringArray(JSON.parse(raw));
    } catch {
      throw new Error("检索 ID 列表必须是字符串数组或逗号分隔文本");
    }
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumber(
  value: unknown,
  name: string,
  fallback: number,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY
): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} 必须在 ${minimum} 到 ${maximum} 之间`);
  }
  return parsed;
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: Set<T>,
  name: string,
  fallback: T
): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new Error(`${name} 参数无效: ${String(value)}`);
  }
  return value as T;
}

export function buildRetrievalRequest(
  args: Record<string, unknown>
): RetrievalRouterRequest {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) throw new Error("query 不能为空");

  const recallIds = parseStringArray(args.recallIds);
  const libraryIds = parseStringArray(args.libraryIds);
  const inferredMode: RetrievalMode =
    recallIds.length > 0 && libraryIds.length > 0
      ? "mixed"
      : libraryIds.length > 0
        ? "knowledge"
        : "recall";
  const mode = parseEnum(args.mode, RETRIEVAL_MODES, "mode", inferredMode);
  const limit = Math.trunc(parseNumber(args.limit, "limit", 8, 1, 100));
  const minScore = parseNumber(args.minScore, "minScore", 0, 0, 1);
  const recallQuota = Math.trunc(
    parseNumber(args.recallQuota, "recallQuota", Math.ceil(limit / 2), 0, 100)
  );
  const knowledgeQuota = Math.trunc(
    parseNumber(
      args.knowledgeQuota,
      "knowledgeQuota",
      Math.floor(limit / 2),
      0,
      100
    )
  );

  return {
    mode,
    limit,
    recallQuota,
    knowledgeQuota,
    recall:
      mode === "knowledge"
        ? undefined
        : {
            primaryQuery: query,
            recallIds,
            tags: parseStringArray(args.tags),
            profile: parseEnum(
              args.recallProfile,
              RECALL_PROFILES,
              "recallProfile",
              "semantic"
            ),
            minScore,
          },
    knowledge:
      mode === "recall"
        ? undefined
        : {
            query,
            libraryIds,
            strategy: parseEnum(
              args.knowledgeStrategy,
              KNOWLEDGE_STRATEGIES,
              "knowledgeStrategy",
              "auto"
            ),
            limit,
            minScore,
          },
  };
}

export async function executeRetrieval(
  args: Record<string, unknown>,
  context?: ToolContext
): Promise<RetrievalRouterResponse> {
  const request = buildRetrievalRequest(args);
  if (request.knowledge) {
    const applicationContext = resolveKnowledgeApplicationContext(context);
    request.knowledge.libraryIds = await authorizeKnowledgeLibraryScope(
      applicationContext,
      request.knowledge.libraryIds
    );
  }
  return routeRetrieval(request);
}

const retrievalRegistry: ToolRegistry = {
  id: "retrieval",
  name: "检索",
  description: "按 Recall、Knowledge 或 mixed 模式主动检索内容",

  getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "search",
          displayName: "检索内容",
          description:
            "从思绪、知识资料或两个域中检索内容。mixed 模式保留分域配额并使用 RRF 融合。",
          agentCallable: true,
          parameters: [
            {
              name: "query",
              type: "string",
              description: "检索查询文本",
              required: true,
            },
            {
              name: "mode",
              type: "string",
              description:
                "检索域 (recall/knowledge/mixed)，省略时根据 ID 推断",
              required: false,
            },
            {
              name: "recallIds",
              type: "string[]",
              description: "限定的思绪集稳定 ID",
              required: false,
            },
            {
              name: "libraryIds",
              type: "string[]",
              description: "限定的知识资料库稳定 ID",
              required: false,
            },
            {
              name: "recallProfile",
              type: "string",
              description: "Recall profile (semantic/associative)",
              required: false,
              defaultValue: "semantic",
            },
            {
              name: "knowledgeStrategy",
              type: "string",
              description: "Knowledge 策略 (auto/keyword/semantic/hybrid)",
              required: false,
              defaultValue: "auto",
            },
            {
              name: "tags",
              type: "string[]",
              description: "Recall 标签过滤",
              required: false,
            },
            {
              name: "limit",
              type: "number",
              description: "最终结果数量，最大 100",
              required: false,
              defaultValue: 8,
            },
            {
              name: "minScore",
              type: "number",
              description: "最低分数阈值 (0-1)",
              required: false,
              defaultValue: 0,
            },
            {
              name: "recallQuota",
              type: "number",
              description: "mixed 模式的 Recall 配额",
              required: false,
            },
            {
              name: "knowledgeQuota",
              type: "number",
              description: "mixed 模式的 Knowledge 配额",
              required: false,
            },
          ],
          returnType: "Promise<RetrievalRouterResponse>",
        },
      ],
    };
  },

  async search(args: Record<string, unknown>, context?: ToolContext) {
    return executeRetrieval(args, context);
  },
};

export default retrievalRegistry;
