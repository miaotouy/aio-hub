import type { ToolRegistry, ToolConfig, ServiceMetadata, ToolContext } from "@/services/types";
import { FolderSearch } from "lucide-vue-next";
import { markRaw } from "vue";
import { searchDirectory, replaceInDirectory } from "./actions";
import type { AgentSearchArgs, AgentReplaceArgs } from "./actions";

/**
 * 目录搜索工具注册器
 *
 * 向 LLM Agent 暴露目录内容搜索与替换能力。
 * 搜索采用流式收集模式：监听 Rust 后端的 batch 事件，
 * 搜索完成后格式化为结构化文本返回。
 */
export default class DirSearchRegistry implements ToolRegistry {
  public readonly id = "dir-search";
  public readonly runMode = "any";
  public readonly name = "目录搜索";
  public readonly description = "在指定目录中搜索文件内容，支持正则表达式、全词匹配和批量替换";

  /**
   * 搜索目录内容（Agent Facade）
   */
  public async searchDirectory(args: Record<string, unknown>, context?: ToolContext): Promise<string> {
    const searchArgs: AgentSearchArgs = {
      path: String(args.path || ""),
      pattern: String(args.pattern || ""),
      isRegex: args.isRegex === true || args.isRegex === "true",
      caseSensitive: args.caseSensitive === true || args.caseSensitive === "true",
      wholeWord: args.wholeWord === true || args.wholeWord === "true",
      includeGlobs: args.includeGlobs ? String(args.includeGlobs) : undefined,
      excludeGlobs: args.excludeGlobs ? String(args.excludeGlobs) : undefined,
      useGitignore: args.useGitignore !== false && args.useGitignore !== "false",
      maxResults: args.maxResults !== undefined ? Number(args.maxResults) : 200,
      contextLines: args.contextLines !== undefined ? Number(args.contextLines) : 0,
    };
    return searchDirectory(searchArgs, context);
  }

  /**
   * 批量替换目录中的文件内容（Agent Facade）
   */
  public async replaceInDirectory(args: Record<string, unknown>, context?: ToolContext): Promise<string> {
    const replaceArgs: AgentReplaceArgs = {
      path: String(args.path || ""),
      pattern: String(args.pattern || ""),
      replacement: String(args.replacement ?? ""),
      isRegex: args.isRegex === true || args.isRegex === "true",
      caseSensitive: args.caseSensitive === true || args.caseSensitive === "true",
      wholeWord: args.wholeWord === true || args.wholeWord === "true",
      preserveCase: args.preserveCase === true || args.preserveCase === "true",
      includeGlobs: args.includeGlobs ? String(args.includeGlobs) : undefined,
      excludeGlobs: args.excludeGlobs ? String(args.excludeGlobs) : undefined,
      useGitignore: args.useGitignore !== false && args.useGitignore !== "false",
    };
    return replaceInDirectory(replaceArgs, context);
  }

  public getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "searchDirectory",
          displayName: "搜索目录内容",
          description:
            "在指定目录中搜索文件内容。支持纯文本和正则表达式模式，返回匹配的文件列表及行内容。适用于代码搜索、日志分析、批量查找等场景。",
          agentCallable: true,
          parameters: [
            {
              name: "path",
              type: "string",
              uiHint: "directory",
              description: "要搜索的目标目录绝对路径",
              required: true,
            },
            {
              name: "pattern",
              type: "string",
              description: "搜索模式（纯文本或正则表达式）",
              required: true,
            },
            {
              name: "isRegex",
              type: "boolean",
              description: "是否将 pattern 作为正则表达式处理",
              required: false,
              defaultValue: false,
            },
            {
              name: "caseSensitive",
              type: "boolean",
              description: "是否区分大小写",
              required: false,
              defaultValue: false,
            },
            {
              name: "wholeWord",
              type: "boolean",
              description: "是否全词匹配",
              required: false,
              defaultValue: false,
            },
            {
              name: "includeGlobs",
              type: "string",
              description: "包含的文件 glob 模式，多个用逗号分隔（如 '*.ts,*.vue'）",
              required: false,
            },
            {
              name: "excludeGlobs",
              type: "string",
              description: "排除的文件 glob 模式，多个用逗号分隔（如 'node_modules,dist'）",
              required: false,
            },
            {
              name: "useGitignore",
              type: "boolean",
              description: "是否尊重目录内的 .gitignore 规则",
              required: false,
              defaultValue: true,
            },
            {
              name: "maxResults",
              type: "number",
              description: "最大返回匹配数（0 表示无限制，默认 200）",
              required: false,
              defaultValue: 200,
            },
            {
              name: "contextLines",
              type: "number",
              description: "每个匹配项显示的上下文行数",
              required: false,
              defaultValue: 0,
            },
          ],
          returnType: "string",
        },
        {
          name: "replaceInDirectory",
          displayName: "批量替换目录内容",
          description:
            "在指定目录中搜索并替换文件内容。先搜索确认影响范围，再执行替换。支持正则替换和大小写保持。⚠️ 此操作会直接修改磁盘文件，不可撤销。",
          agentCallable: true,
          parameters: [
            {
              name: "path",
              type: "string",
              uiHint: "directory",
              description: "要搜索替换的目标目录绝对路径",
              required: true,
            },
            {
              name: "pattern",
              type: "string",
              description: "搜索模式（纯文本或正则表达式）",
              required: true,
            },
            {
              name: "replacement",
              type: "string",
              description: "替换文本（正则模式下支持 $1, $2 等捕获组引用）",
              required: true,
            },
            {
              name: "isRegex",
              type: "boolean",
              description: "是否将 pattern 作为正则表达式处理",
              required: false,
              defaultValue: false,
            },
            {
              name: "caseSensitive",
              type: "boolean",
              description: "是否区分大小写",
              required: false,
              defaultValue: false,
            },
            {
              name: "wholeWord",
              type: "boolean",
              description: "是否全词匹配",
              required: false,
              defaultValue: false,
            },
            {
              name: "preserveCase",
              type: "boolean",
              description: "是否保持原始文本的大小写风格（如 FOO→BAR, foo→bar, Foo→Bar）",
              required: false,
              defaultValue: false,
            },
            {
              name: "includeGlobs",
              type: "string",
              description: "包含的文件 glob 模式，多个用逗号分隔",
              required: false,
            },
            {
              name: "excludeGlobs",
              type: "string",
              description: "排除的文件 glob 模式，多个用逗号分隔",
              required: false,
            },
            {
              name: "useGitignore",
              type: "boolean",
              description: "是否尊重目录内的 .gitignore 规则",
              required: false,
              defaultValue: true,
            },
          ],
          returnType: "string",
        },
      ],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "目录搜索",
  path: "/dir-search",
  runMode: "any",
  icon: markRaw(FolderSearch),
  description: "在指定目录中搜索文件内容，支持正则、全词匹配和批量替换",
  category: ["文件管理"],
  component: () => import("./DirSearch.vue"),
};
