import type { ToolRegistry, ToolConfig, ServiceMetadata } from "@/services/types";
import { markRaw } from "vue";
import { Database } from "lucide-vue-next";
import * as agentActions from "./actions/agentActions";

class KnowledgeBaseRegistry implements ToolRegistry {
  public readonly id = "knowledge-base";
  public readonly name = "知识库";
  public readonly description = "管理和检索结构化知识，支持 RAG 向量化";

  public getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "upsertEntry",
          displayName: "创建或更新条目",
          description: "创建新条目或更新已存在条目的完整内容。推荐使用 kbName 定位知识库。",
          agentCallable: true,
          parameters: [
            { name: "kbName", type: "string", description: "知识库名称 (推荐)", required: false },
            { name: "kbId", type: "string", description: "知识库 ID", required: false },
            { name: "key", type: "string", description: "条目标识（标题），用于定位或创建", required: true },
            { name: "content", type: "string", description: "Markdown 格式的内容", required: true },
            { name: "tags", type: "string[]", description: "标签列表", required: false },
            { name: "priority", type: "number", description: "优先级", required: false, defaultValue: 100 },
            { name: "enabled", type: "boolean", description: "是否启用", required: false, defaultValue: true },
            {
              name: "autoVectorize",
              type: "boolean",
              description: "是否自动向量化",
              required: false,
              defaultValue: false,
            },
          ],
          returnType: "Promise<UpsertEntryResult>",
        },
        {
          name: "updateEntryContent",
          displayName: "更新条目内容",
          description:
            "更新条目内容。支持精确片段替换（推荐）或整体替换。精确替换至少需要 15 个字符。标题支持模糊匹配。",
          agentCallable: true,
          parameters: [
            { name: "kbName", type: "string", description: "知识库名称", required: false },
            { name: "kbId", type: "string", description: "知识库 ID", required: false },
            { name: "entryId", type: "string", description: "条目 ID", required: false },
            { name: "key", type: "string", description: "条目标题 (支持模糊匹配)", required: false },
            { name: "searchQuery", type: "string", description: "搜索词定位条目", required: false },
            { name: "targetContent", type: "string", description: "要替换的原文片段 (至少 15 字符)", required: false },
            { name: "replaceWith", type: "string", description: "替换为的新内容片段", required: false },
            { name: "replaceContent", type: "string", description: "替换整个条目的内容", required: false },
            { name: "replaceKey", type: "string", description: "替换条目的标题", required: false },
            { name: "replaceTags", type: "string[]", description: "替换标签", required: false },
            { name: "dryRun", type: "boolean", description: "仅预览不执行", required: false },
            { name: "autoVectorize", type: "boolean", description: "是否自动重新向量化", required: false },
          ],
          returnType: "Promise<UpdateEntryContentResult>",
        },
        {
          name: "deleteEntry",
          displayName: "删除条目",
          description: "删除指定的知识库条目。需要显式确认。",
          agentCallable: true,
          parameters: [
            { name: "kbName", type: "string", description: "知识库名称", required: false },
            { name: "kbId", type: "string", description: "知识库 ID", required: false },
            { name: "entryId", type: "string", description: "条目 ID", required: false },
            { name: "key", type: "string", description: "条目标题", required: false },
            { name: "confirm", type: "boolean", description: "确认删除", required: true },
          ],
          returnType: "Promise<DeleteEntryResult>",
        },
        {
          name: "searchEntries",
          displayName: "搜索条目",
          description: "在知识库中搜索条目。支持关键词或向量搜索。结果包含 index 序号方便后续操作引用。",
          agentCallable: true,
          parameters: [
            { name: "kbNames", type: "string[]", description: "知识库名称列表", required: false },
            { name: "query", type: "string", description: "搜索查询词", required: true },
            { name: "engineId", type: "string", description: "检索引擎 (keyword/vector)", required: false },
            { name: "limit", type: "number", description: "结果数量", required: false },
            { name: "tags", type: "string[]", description: "标签过滤", required: false },
          ],
          returnType: "Promise<SearchEntriesResult>",
        },
        {
          name: "batchUpdateMetadata",
          displayName: "批量更新元数据",
          description: "批量更新条目的元数据（不修改内容）。",
          agentCallable: true,
          parameters: [
            { name: "kbName", type: "string", description: "知识库名称", required: false },
            { name: "entryIds", type: "string[]", description: "条目 ID 列表", required: true },
            { name: "enabled", type: "boolean", description: "启用状态", required: false },
            { name: "addTags", type: "string[]", description: "添加标签", required: false },
            { name: "removeTags", type: "string[]", description: "移除标签", required: false },
          ],
          returnType: "Promise<BatchUpdateMetadataResult>",
        },
        {
          name: "listEntriesMetadata",
          displayName: "查询条目元数据",
          description:
            "列出并筛选知识库条目的元数据（不含完整内容）。支持标题搜索、标签过滤、分页和排序。适用于批量管理场景，配合 batchUpdateMetadata 使用。",
          agentCallable: true,
          parameters: [
            { name: "kbName", type: "string", description: "知识库名称", required: false },
            { name: "kbId", type: "string", description: "知识库 ID", required: false },
            { name: "query", type: "string", description: "标题关键词搜索（模糊匹配）", required: false },
            { name: "tags", type: "string[]", description: "标签过滤（AND 逻辑）", required: false },
            { name: "enabled", type: "boolean", description: "启用状态过滤", required: false },
            {
              name: "vectorStatus",
              type: "string",
              description: "向量状态过滤 (none/pending/ready/error)",
              required: false,
            },
            { name: "limit", type: "number", description: "每页数量 (最大 200)", required: false, defaultValue: 50 },
            { name: "offset", type: "number", description: "分页偏移", required: false, defaultValue: 0 },
            { name: "sortBy", type: "string", description: "排序字段 (updatedAt/key/priority)", required: false },
            { name: "sortOrder", type: "string", description: "排序顺序 (asc/desc)", required: false },
          ],
          returnType: "Promise<ListEntriesMetadataResult>",
        },
        {
          name: "listKnowledgeBases",
          displayName: "列出知识库列表",
          description: "列出所有知识库及其基本信息和统计数据。支持名称搜索和统计信息开关。",
          agentCallable: true,
          parameters: [
            { name: "query", type: "string", description: "知识库名称关键词搜索（模糊匹配）", required: false },
            {
              name: "includeStats",
              type: "boolean",
              description: "是否包含统计信息",
              required: false,
              defaultValue: true,
            },
          ],
          returnType: "Promise<ListKnowledgeBasesResult>",
        },
      ],
    };
  }

  public async upsertEntry(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return (await agentActions.upsertEntry(args as any)) as any;
  }

  public async updateEntryContent(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return (await agentActions.updateEntryContent(args as any)) as any;
  }

  public async deleteEntry(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return (await agentActions.deleteEntry(args as any)) as any;
  }

  public async searchEntries(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return (await agentActions.searchEntries(args as any)) as any;
  }

  public async batchUpdateMetadata(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return (await agentActions.batchUpdateMetadata(args as any)) as any;
  }

  public async listEntriesMetadata(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return (await agentActions.listEntriesMetadata(args as any)) as any;
  }

  public async listKnowledgeBases(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return (await agentActions.listKnowledgeBases(args as any)) as any;
  }
}

export default KnowledgeBaseRegistry;

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "知识库",
  path: "/knowledge-base",
  icon: markRaw(Database),
  component: () => import("./KnowledgeBase.vue"),
  description: "管理和检索结构化知识，支持 RAG 向量化",
  category: "生产力",
};
