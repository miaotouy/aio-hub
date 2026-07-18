import type {
  ServiceMetadata,
  ToolConfig,
  ToolContext,
  ToolMethodResult,
  ToolRegistry,
} from "@/services/types";
import { markRaw } from "vue";
import { BookOpenText } from "lucide-vue-next";
import { KnowledgeAccessError } from "./access";
import {
  listKnowledgeForAgent,
  parseKnowledgeToolReadRequest,
  parseKnowledgeToolSearchRequest,
  readKnowledgeForAgent,
  resolveKnowledgeApplicationContext,
  searchKnowledgeForAgent,
} from "./application";
import {
  createKnowledgeResearchTask,
  parseKnowledgeResearchRequest,
} from "./research";
import type { KnowledgeResearchTask } from "./research";
import type {
  KnowledgeLibrarySummary,
  KnowledgeToolReadResponse,
  KnowledgeToolSearchResponse,
} from "./types";

export const toolConfig: ToolConfig = {
  name: "知识资料库",
  path: "/knowledge-base",
  icon: markRaw(BookOpenText),
  component: () => import("./KnowledgeBase.vue"),
  description: "导入、索引并检索带来源回溯的本地文档资料。",
  category: ["AI 工具"],
  version: "2.0.0",
};

const knowledgeRegistry: ToolRegistry = {
  id: "knowledge",
  name: "Knowledge",
  description:
    "发现、搜索和继续阅读当前 Agent 获授权的资料库。资料授权不会自动触发查询。",

  getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "listLibraries",
          displayName: "列出授权资料库",
          description:
            "列出当前 Agent 获授权的资料库、来源数量、索引状态和检索能力。授权不等于自动查询。",
          parameters: [],
          returnType: "Promise<KnowledgeLibrarySummary[]>",
          agentCallable: true,
        },
        {
          name: "search",
          displayName: "搜索资料库",
          description:
            "在当前 Agent 获授权的资料库中执行快速检索，返回结构化 chunk 命中、原始分数、信号、实际策略和降级原因。",
          parameters: [
            {
              name: "query",
              type: "string",
              description: "非空查询文本",
              required: true,
              uiHint: "textarea",
            },
            {
              name: "libraryIds",
              type: "string[]",
              description:
                "稳定资料库 ID；省略时仅在 allowSearchAll 开启后搜索全部授权库",
              required: false,
            },
            {
              name: "strategy",
              type: "string",
              description: "auto、keyword、semantic 或 hybrid",
              required: false,
              defaultValue: "auto",
            },
            {
              name: "topK",
              type: "number",
              description: "最终命中数量，1 到 50",
              required: false,
              defaultValue: 8,
            },
            {
              name: "filters",
              type: "object",
              description:
                "可选 JSON 过滤：documentIds、sourceTypes、pathPrefixes",
              required: false,
              uiHint: "json",
            },
            {
              name: "includeAdjacent",
              type: "boolean",
              description: "是否补充命中 chunk 的相邻分块",
              required: false,
              defaultValue: false,
            },
            {
              name: "maxChars",
              type: "number",
              description: "结果总字符预算，1000 到 50000",
              required: false,
              defaultValue: 12000,
            },
          ],
          returnType: "Promise<KnowledgeToolSearchResponse>",
          agentCallable: true,
        },
        {
          name: "read",
          displayName: "继续读取资料",
          description:
            "按 chunk、chunk 邻域、heading 或字符范围继续读取已授权资料，必须提供字符预算。",
          parameters: [
            {
              name: "libraryId",
              type: "string",
              description: "稳定资料库 ID",
              required: true,
            },
            {
              name: "chunkId",
              type: "string",
              description: "直接读取指定 chunk",
              required: false,
            },
            {
              name: "documentId",
              type: "string",
              description: "按位置读取时的文档 ID",
              required: false,
            },
            {
              name: "chunkIndex",
              type: "number",
              description: "文档内 chunk 索引",
              required: false,
            },
            {
              name: "neighborCount",
              type: "number",
              description: "chunkIndex 两侧补充数量，0 到 3",
              required: false,
              defaultValue: 0,
            },
            {
              name: "heading",
              type: "string",
              description: "精确匹配的章节标题",
              required: false,
            },
            {
              name: "startOffset",
              type: "number",
              description: "文档字符范围起点",
              required: false,
            },
            {
              name: "endOffset",
              type: "number",
              description: "文档字符范围终点",
              required: false,
            },
            {
              name: "maxChars",
              type: "number",
              description: "强制读取字符预算，1 到 50000",
              required: true,
            },
          ],
          returnType: "Promise<KnowledgeToolReadResponse>",
          agentCallable: true,
        },
        {
          name: "research",
          displayName: "研究资料库",
          description:
            "创建带轮次、工具调用数、证据字符预算和可取消进度的多轮研究任务；结果保留引用、空缺、冲突和终止原因。",
          parameters: [
            { name: "question", type: "string", description: "研究问题", required: true, uiHint: "textarea" },
            { name: "libraryIds", type: "string[]", description: "稳定资料库 ID；省略时遵守 allowSearchAll", required: false },
            { name: "maxRounds", type: "number", description: "最大研究轮次，1 到 8", required: false, defaultValue: 3 },
            { name: "maxToolCalls", type: "number", description: "最大 search/read 调用数，1 到 40", required: false, defaultValue: 12 },
            { name: "evidenceBudget", type: "number", description: "证据字符预算，1000 到 100000", required: false, defaultValue: 24000 },
            { name: "output", type: "string", description: "brief、report 或 comparison", required: false, defaultValue: "report" },
          ],
          returnType: "Promise<KnowledgeResearchTask>",
          agentCallable: true,
        },
      ],
    };
  },

  async listLibraries(
    _args: Record<string, unknown>,
    context?: ToolContext
  ): Promise<ToolMethodResult<{ libraries: KnowledgeLibrarySummary[] }>> {
    const applicationContext = resolveKnowledgeApplicationContext(context);
    const libraries = await listKnowledgeForAgent(applicationContext);
    return {
      result: { libraries },
      executionMetadata: {
        agentId: applicationContext.agentId,
        sourceCount: libraries.length,
        sources: libraries.map((library) => ({
          libraryId: library.id,
          availability: library.availability,
        })),
      },
    };
  },

  async search(
    args: Record<string, unknown>,
    context?: ToolContext
  ): Promise<ToolMethodResult<KnowledgeToolSearchResponse>> {
    const applicationContext = resolveKnowledgeApplicationContext(context);
    const response = await searchKnowledgeForAgent(
      applicationContext,
      parseKnowledgeToolSearchRequest(args)
    );
    return {
      result: response,
      executionMetadata: {
        agentId: applicationContext.agentId,
        requestedStrategy: response.requestedStrategy,
        actualStrategies: response.traces.map((trace) => ({
          libraryIds: trace.libraryIds,
          strategy: trace.actualStrategy,
          degradationReason: trace.degradationReason,
        })),
        resultCount: response.hits.length,
        sources: response.hits.map((hit) => ({
          libraryId: hit.libraryId,
          documentId: hit.documentId,
          chunkId: hit.chunkId,
          sourcePath: hit.sourcePath,
          chunkIndex: hit.chunkIndex,
        })),
      },
    };
  },

  async read(
    args: Record<string, unknown>,
    context?: ToolContext
  ): Promise<ToolMethodResult<KnowledgeToolReadResponse>> {
    const applicationContext = resolveKnowledgeApplicationContext(context);
    const response = await readKnowledgeForAgent(
      applicationContext,
      parseKnowledgeToolReadRequest(args)
    );
    return {
      result: response,
      executionMetadata: {
        agentId: applicationContext.agentId,
        resultCount: response.chunks.length,
        sources: response.chunks.map((chunk) => ({
          libraryId: chunk.libraryId,
          documentId: chunk.documentId,
          chunkId: chunk.chunkId,
          sourcePath: chunk.sourcePath,
          chunkIndex: chunk.chunkIndex,
        })),
      },
    };
  },

  async research(
    args: Record<string, unknown>,
    context?: ToolContext
  ): Promise<ToolMethodResult<KnowledgeResearchTask>> {
    const applicationContext = resolveKnowledgeApplicationContext(context);
    if (!applicationContext.access.allowResearch) {
      throw new KnowledgeAccessError(
        "RESEARCH_FORBIDDEN",
        "当前 Agent 未获授权启动 Knowledge 研究任务"
      );
    }
    const request = parseKnowledgeResearchRequest(args);
    const handle = createKnowledgeResearchTask(applicationContext, request);
    const task = await handle.task;
    return {
      result: task,
      executionMetadata: {
        agentId: applicationContext.agentId,
        taskId: task.id,
        status: task.status,
        terminationReason: task.result?.terminationReason,
        resultCount: task.result?.citations.length ?? 0,
        sources: task.result?.citations.map((citation) => ({
          libraryId: citation.libraryId,
          documentId: citation.documentId,
          chunkId: citation.chunkId,
          sourcePath: citation.sourcePath,
          chunkIndex: citation.chunkIndex,
        })) ?? [],
      },
    };
  },
};

export default knowledgeRegistry;
