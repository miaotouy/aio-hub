import type { ToolRegistry, ToolConfig, ServiceMetadata } from "@/services/types";
import type { SettingItem } from "@/types/settings-renderer";
import { markRaw } from "vue";
import GitBranchIcon from "@/components/icons/GitBranchIcon.vue";
import {
  analyzeRepository,
  getAuthorCommits,
  getCommitDetail,
  getBranchList,
  type AnalyzeRepositoryOptions,
  type GetAuthorCommitsOptions,
  type GetCommitDetailOptions,
} from "./actions";
import { reportComponents, formatCommitList, formatBranchList, createAgentExportConfig } from "./formatters";

/**
 * Git 仓库 analysis 注册器
 */
export default class GitAnalyzerRegistry implements ToolRegistry {
  public readonly id = "git-analyzer";
  public readonly name = "Git 分析器";
  public readonly description = "分析 Git 仓库的提交历史、贡献者统计和活跃度";

  public readonly settingsSchema: SettingItem[] = [
    {
      id: "ga-default-limit",
      label: "默认提交数量",
      component: "ElInputNumber",
      modelPath: "defaultLimit",
      hint: "分析时默认加载的提交数量",
      keywords: "提交 数量 限制",
      defaultValue: 100,
      props: { min: 10, max: 1000, step: 10 },
    },
    {
      id: "ga-default-date-format",
      label: "默认日期格式",
      component: "ElSelect",
      modelPath: "defaultDateFormat",
      hint: "分析结果中日期的显示格式",
      keywords: "日期 格式",
      defaultValue: "iso",
      props: {
        options: [
          { label: "ISO 8601", value: "iso" },
          { label: "本地时间", value: "local" },
          { label: "相对时间", value: "relative" },
          { label: "时间戳", value: "timestamp" },
        ],
      },
    },
    {
      id: "ga-include-author",
      label: "默认包含作者",
      component: "ElSwitch",
      modelPath: "includeAuthor",
      hint: "分析结果中是否默认包含作者信息",
      keywords: "作者",
      defaultValue: true,
    },
    {
      id: "ga-include-email",
      label: "默认包含邮箱",
      component: "ElSwitch",
      modelPath: "includeEmail",
      hint: "分析结果中是否默认包含作者邮箱",
      keywords: "邮箱",
      defaultValue: false,
    },
  ];

  /**
   * 获取仓库格式化分析摘要（Agent facade）
   * 通过 reportComponents 积木拼装，与手动导出路径一致
   */
  public async getFormattedAnalysis(args: Record<string, unknown>): Promise<string> {
    const options: AnalyzeRepositoryOptions = {
      path: String(args.path || ""),
      branch: args.branch ? String(args.branch) : undefined,
      limit: args.limit !== undefined ? Number(args.limit) : 100,
      dateFormat: (args.dateFormat as AnalyzeRepositoryOptions["dateFormat"]) || "iso",
      includeStatistics: args.includeStatistics !== false && args.includeStatistics !== "false",
      includeCommits: args.includeCommits !== false && args.includeCommits !== "false",
      includeContributors: args.includeContributors !== false && args.includeContributors !== "false",
      includeTimeline: args.includeTimeline === true || args.includeTimeline === "true",
      includeCharts: args.includeCharts === true || args.includeCharts === "true",
      includeAuthor: args.includeAuthor !== false && args.includeAuthor !== "false",
      includeEmail: args.includeEmail === true || args.includeEmail === "true",
      includeFullMessage: args.includeFullMessage === true || args.includeFullMessage === "true",
      includeFiles: args.includeFiles === true || args.includeFiles === "true",
      includeTags: args.includeTags === true || args.includeTags === "true",
      includeStats: args.includeStats === true || args.includeStats === "true",
    };

    let result: Awaited<ReturnType<typeof analyzeRepository>>;
    try {
      result = await analyzeRepository(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `❌ 仓库分析失败: ${message}`;
    }

    // 使用 reportComponents 积木拼装，与手动导出路径统一
    const lines: string[] = [];
    lines.push(reportComponents.header("Git 仓库分析摘要", result.details.path, result.details.branch));

    if (result.details.statistics) {
      lines.push(reportComponents.section("📊 统计概览", reportComponents.statistics(result.details.statistics)));
    }

    if (result.details.topContributors && result.details.topContributors.length > 0) {
      const totalCommits = result.details.statistics?.totalCommits || 0;
      lines.push(
        reportComponents.section(
          "👥 主要贡献者",
          reportComponents.contributors(result.details.topContributors, totalCommits)
        )
      );
    }

    if (result.details.recentCommits && result.details.recentCommits.length > 0) {
      const recentLines = result.details.recentCommits.map(
        (c) => `- **${String(c.hash).substring(0, 7)}** [${c.date}] (${c.author}): ${c.message}`
      );
      lines.push(reportComponents.section("📝 最近提交", recentLines.join("\n")));
    }

    return lines.join("\n").trim();
  }

  /**
   * 获取指定作者的提交记录（Agent facade）
   */
  public async getAuthorCommits(args: Record<string, unknown>): Promise<string> {
    const options: GetAuthorCommitsOptions = {
      path: String(args.path || ""),
      author: String(args.author || ""),
      branch: args.branch ? String(args.branch) : undefined,
      limit: args.limit !== undefined ? Number(args.limit) : 100,
      dateFormat: (args.dateFormat as GetAuthorCommitsOptions["dateFormat"]) || "iso",
      includeEmail: args.includeEmail === true || args.includeEmail === "true",
      includeFullMessage: args.includeFullMessage === true || args.includeFullMessage === "true",
      includeFiles: args.includeFiles === true || args.includeFiles === "true",
      includeTags: args.includeTags === true || args.includeTags === "true",
      includeStats: args.includeStats === true || args.includeStats === "true",
    };

    let result: Awaited<ReturnType<typeof getAuthorCommits>>;
    try {
      result = await getAuthorCommits(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `❌ 获取作者提交记录失败: ${message}`;
    }
    const agentConfig = createAgentExportConfig({
      dateFormat: options.dateFormat || "iso",
      includeAuthor: true,
      includeEmail: options.includeEmail || false,
      includeFullMessage: options.includeFullMessage || false,
      includeFiles: options.includeFiles || false,
      includeTags: options.includeTags || false,
      includeStats: options.includeStats || false,
    });
    return formatCommitList(result || [], agentConfig);
  }

  /**
   * 获取指定提交的详细信息（Agent facade）
   * 使用 reportComponents.commitItem，与导出路径统一
   */
  public async getCommitDetail(args: Record<string, unknown>): Promise<string> {
    const options: GetCommitDetailOptions = {
      path: String(args.path || ""),
      hash: String(args.hash || ""),
    };

    let result: Awaited<ReturnType<typeof getCommitDetail>>;
    try {
      result = await getCommitDetail(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `❌ 获取提交详情失败: ${message}`;
    }
    // Agent 场景下全量展示所有字段
    const agentConfig = createAgentExportConfig();
    return reportComponents.commitItem(result, agentConfig);
  }

  /**
   * 获取仓库分支列表（Agent facade）
   */
  public async getBranchList(args: Record<string, unknown>): Promise<string> {
    try {
      const result = await getBranchList(String(args.path || ""));
      return formatBranchList(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `❌ 获取分支列表失败: ${message}`;
    }
  }

  /**
   * 获取服务元数据
   */
  public getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "getFormattedAnalysis",
          displayName: "分析 Git 仓库",
          description: "获取仓库的格式化分析摘要，包含统计信息、贡献者排行和最近提交",
          agentCallable: true,
          parameters: [
            { name: "path", type: "string", uiHint: "directory", description: "Git 仓库路径", required: true },
            { name: "branch", type: "string", description: "指定分析的分支，默认为当前分支", required: false },
            { name: "limit", type: "number", description: "限制分析的提交数量", required: false, defaultValue: 100 },
            {
              name: "dateFormat",
              type: "'iso' | 'local' | 'relative' | 'timestamp'",
              description: "日期格式",
              required: false,
              defaultValue: "iso",
            },
            {
              name: "includeStatistics",
              type: "boolean",
              description: "是否包含统计信息",
              required: false,
              defaultValue: true,
            },
            {
              name: "includeCommits",
              type: "boolean",
              description: "是否包含提交记录",
              required: false,
              defaultValue: true,
            },
            {
              name: "includeContributors",
              type: "boolean",
              description: "是否包含贡献者列表",
              required: false,
              defaultValue: true,
            },
            {
              name: "includeTimeline",
              type: "boolean",
              description: "是否包含时间线数据",
              required: false,
              defaultValue: false,
            },
            {
              name: "includeCharts",
              type: "boolean",
              description: "是否包含图表数据",
              required: false,
              defaultValue: false,
            },
            {
              name: "includeAuthor",
              type: "boolean",
              description: "是否包含作者信息",
              required: false,
              defaultValue: true,
            },
            {
              name: "includeEmail",
              type: "boolean",
              description: "是否包含作者邮箱",
              required: false,
              defaultValue: false,
            },
            {
              name: "includeFullMessage",
              type: "boolean",
              description: "是否包含完整提交消息",
              required: false,
              defaultValue: true,
            },
            {
              name: "includeFiles",
              type: "boolean",
              description: "是否包含文件变更列表",
              required: false,
              defaultValue: true,
            },
            {
              name: "includeTags",
              type: "boolean",
              description: "是否包含标签信息",
              required: false,
              defaultValue: false,
            },
            {
              name: "includeStats",
              type: "boolean",
              description: "是否包含代码统计",
              required: false,
              defaultValue: false,
            },
          ],
          returnType: "string",
        },
        {
          name: "getAuthorCommits",
          displayName: "获取作者提交",
          description: "获取指定作者的提交记录，支持部分名称匹配",
          agentCallable: true,
          parameters: [
            { name: "path", type: "string", uiHint: "directory", description: "Git 仓库路径", required: true },
            { name: "author", type: "string", description: "作者名称（支持部分匹配）", required: true },
            { name: "branch", type: "string", description: "指定分支", required: false },
            { name: "limit", type: "number", description: "限制提交数量", required: false, defaultValue: 100 },
            {
              name: "dateFormat",
              type: "'iso' | 'local' | 'relative' | 'timestamp'",
              description: "日期格式",
              required: false,
              defaultValue: "iso",
            },
            {
              name: "includeEmail",
              type: "boolean",
              description: "是否包含作者邮箱",
              required: false,
              defaultValue: false,
            },
            {
              name: "includeFullMessage",
              type: "boolean",
              description: "是否包含完整提交消息",
              required: false,
              defaultValue: false,
            },
            {
              name: "includeFiles",
              type: "boolean",
              description: "是否包含文件变更列表",
              required: false,
              defaultValue: false,
            },
            {
              name: "includeTags",
              type: "boolean",
              description: "是否包含标签信息",
              required: false,
              defaultValue: false,
            },
            {
              name: "includeStats",
              type: "boolean",
              description: "是否包含代码统计",
              required: false,
              defaultValue: false,
            },
          ],
          returnType: "string",
        },
        {
          name: "getCommitDetail",
          displayName: "获取提交详情",
          description: "获取指定提交的详细信息，包含完整消息、文件变更、代码统计和标签",
          agentCallable: true,
          parameters: [
            { name: "path", type: "string", uiHint: "directory", description: "Git 仓库路径", required: true },
            { name: "hash", type: "string", description: "提交哈希值（完整或短格式均可）", required: true },
          ],
          returnType: "string",
        },
        {
          name: "getBranchList",
          displayName: "获取分支列表",
          description: "获取仓库的所有分支名称",
          agentCallable: true,
          parameters: [
            { name: "path", type: "string", uiHint: "directory", description: "Git 仓库路径", required: true },
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
  name: "Git 分析器",
  path: "/git-analyzer",
  icon: markRaw(GitBranchIcon),
  component: () => import("./GitAnalyzer.vue"),
  description: "Git提交记录分析和可视化处理工具",
  category: "开发工具",
};
