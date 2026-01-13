import type { ToolRegistry, ToolConfig } from "@/services/types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler, ErrorLevel } from "@/utils/errorHandler";
import { formatDateTime } from "@/utils/time";
import { fetchBranches, fetchBranchCommits, fetchCommitDetail } from "./composables/useGitLoader";
import { getContributorStats } from "./composables/useGitProcessor";
import type { GitCommit, RepoStatistics } from "./types";
import { markRaw } from 'vue';
import GitBranchIcon from '@/components/icons/GitBranchIcon.vue';

const logger = createModuleLogger("tools/git-analyzer");
const errorHandler = createModuleErrorHandler("tools/git-analyzer");

// ==================== Agent 调用接口类型 ====================

/**
 * 仓库分析选项
 */
export interface AnalyzeRepositoryOptions {
  /** Git 仓库路径 */
  path: string;
  /** （可选）指定分析的分支，默认为当前分支 */
  branch?: string;
  /** （可选）限制分析的提交数量，默认 100 */
  limit?: number;
  /** （可选）日期格式，默认 'iso' */
  dateFormat?: 'iso' | 'local' | 'relative' | 'timestamp';
  /** （可选）包含的内容类型，默认全部 */
  includes?: Array<'statistics' | 'commits' | 'contributors' | 'timeline' | 'charts'>;
  /** （可选）是否包含作者信息，默认 true */
  includeAuthor?: boolean;
  /** （可选）是否包含作者邮箱，默认 false */
  includeEmail?: boolean;
  /** （可选）是否包含完整提交消息，默认 false */
  includeFullMessage?: boolean;
  /** （可选）是否包含文件变更列表，默认 false */
  includeFiles?: boolean;
  /** （可选）是否包含标签信息，默认 false */
  includeTags?: boolean;
  /** （可选）是否包含代码统计，默认 false */
  includeStats?: boolean;
}

/**
 * 格式化的仓库分析摘要
 */
export interface FormattedRepoAnalysis {
  /** 简短摘要 */
  summary: string;
  /** 详细信息 */
  details: {
    /** 仓库路径 */
    path: string;
    /** 当前分支 */
    branch: string;
    /** 统计信息 */
    statistics?: RepoStatistics;
    /** 贡献者排行 */
    topContributors: Array<{ name: string; count: number }>;
    /** 最近的提交 */
    recentCommits: Array<{
      hash: string;
      author: string;
      date: string;
      message: string;
    }>;
  };
}

/**
 * 获取作者提交选项
 */
export interface GetAuthorCommitsOptions {
  /** Git 仓库路径 */
  path: string;
  /** 作者名称（支持部分匹配） */
  author: string;
  /** （可选）指定分支 */
  branch?: string;
  /** （可选）限制提交数量 */
  limit?: number;
  /** （可选）日期格式，默认 'iso' */
  dateFormat?: 'iso' | 'local' | 'relative' | 'timestamp';
  /** （可选）是否包含作者邮箱，默认 false */
  includeEmail?: boolean;
  /** （可选）是否包含完整提交消息，默认 false */
  includeFullMessage?: boolean;
  /** （可选）是否包含文件变更列表，默认 false */
  includeFiles?: boolean;
  /** （可选）是否包含标签信息，默认 false */
  includeTags?: boolean;
  /** （可选）是否包含代码统计，默认 false */
  includeStats?: boolean;
}

/**
 * 获取指定提交选项
 */
export interface GetCommitDetailOptions {
  /** Git 仓库路径 */
  path: string;
  /** 提交哈希值 */
  hash: string;
}

// ==================== 注册器类 ====================

/**
 * Git 仓库分析注册器
 *
 * 提供无状态的 Git 仓库分析接口：
 * 1. `getFormattedAnalysis`: 获取仓库的格式化分析摘要
 * 2. `getAuthorCommits`: 获取指定作者的提交记录
 * 3. `getCommitDetail`: 获取指定提交的详细信息
 * 4. `getBranchList`: 获取仓库的分支列表
 *
 * UI 层通过 useGitAnalyzerState 和 useGitAnalyzerRunner composables 管理状态和业务逻辑
 */
export default class GitAnalyzerRegistry implements ToolRegistry {
  public readonly id = "git-analyzer";
  public readonly name = "Git 分析器";
  public readonly description = "分析 Git 仓库的提交历史、贡献者统计和活跃度";

  // ==================== 高级封装方法 (Agent 调用接口) ====================

  /**
   * [Agent Friendly] 获取仓库的格式化分析摘要
   * 一次性调用，返回仓库的核心统计和关键提交信息
   */
  public async getFormattedAnalysis(
    options: AnalyzeRepositoryOptions
  ): Promise<FormattedRepoAnalysis | null> {
    const {
      path,
      branch,
      limit = 100,
      dateFormat = 'iso',
      includes = ['statistics', 'commits', 'contributors'],
      includeAuthor = true,
      includeEmail = false,
      includeFullMessage = false,
      includeFiles = false,
      includeTags = false,
      includeStats = false,
    } = options;
    logger.info("开始分析仓库 (Agent 调用)", { path, branch, limit, includes });

    return await errorHandler.wrapAsync(
      async () => {
        // 1. 获取分支信息
        const branches = await fetchBranches(path);
        const targetBranch =
          branch || branches.find((b) => b.current)?.name || "main";

        // 2. 获取提交记录
        const commits = await fetchBranchCommits(path, targetBranch, limit);

        if (commits.length === 0) {
          return {
            summary: `仓库 ${path} 在分支 ${targetBranch} 上没有提交记录`,
            details: {
              path,
              branch: targetBranch,
              statistics: {
                totalCommits: 0,
                contributors: 0,
                timeSpan: 0,
                averagePerDay: 0,
              },
              topContributors: [],
              recentCommits: [],
            },
          };
        }

        // 3. 计算统计信息
        const authors = new Set(commits.map((c) => c.author));
        const dates = commits.map((c) => new Date(c.date).getTime());
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        const days = Math.ceil(
          (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        const statistics: RepoStatistics = {
          totalCommits: commits.length,
          contributors: authors.size,
          timeSpan: days,
          averagePerDay: commits.length / Math.max(days, 1),
        };

        // 4. 获取贡献者排行（前 5 名）
        const topContributors = includes.includes('contributors')
          ? getContributorStats(commits).slice(0, 5)
          : [];

        // 5. 格式化日期函数
        const formatCommitDate = (date: string) => {
          switch (dateFormat) {
            case 'local':
              return formatDateTime(date, 'yyyy-MM-dd HH:mm:ss');
            case 'relative': {
              const now = Date.now();
              const commitTime = new Date(date).getTime();
              const diff = now - commitTime;
              const days = Math.floor(diff / (1000 * 60 * 60 * 24));
              if (days === 0) return '今天';
              if (days === 1) return '昨天';
              if (days < 7) return `${days} 天前`;
              if (days < 30) return `${Math.floor(days / 7)} 周前`;
              if (days < 365) return `${Math.floor(days / 30)} 月前`;
              return `${Math.floor(days / 365)} 年前`;
            }
            case 'timestamp':
              return String(new Date(date).getTime());
            default:
              return date;
          }
        };

        // 6. 获取最近的提交（前 10 条）
        const recentCommits = includes.includes('commits')
          ? commits.slice(0, 10).map((c) => {
              const commit: any = {
                hash: c.hash,
                date: formatCommitDate(c.date),
                message: includeFullMessage && c.full_message ? c.full_message : c.message,
              };
              if (includeAuthor) {
                commit.author = c.author;
                if (includeEmail) {
                  commit.email = c.email;
                }
              }
              if (includeTags && c.tags) {
                commit.tags = c.tags;
              }
              if (includeStats && c.stats) {
                commit.stats = c.stats;
              }
              if (includeFiles && c.files) {
                commit.files = c.files;
              }
              return commit;
            })
          : [];

        // 7. 生成摘要
        const summary = `仓库分析完成: ${statistics.totalCommits} 个提交，${statistics.contributors} 位贡献者，跨度 ${statistics.timeSpan} 天`;

        logger.info("仓库分析完成", { summary });

        return {
          summary,
          details: {
            path,
            branch: targetBranch,
            statistics: includes.includes('statistics') ? statistics : undefined,
            topContributors,
            recentCommits,
          },
        };
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: "仓库分析失败",
        context: options,
      }
    );
  }

  /**
   * [Agent Friendly] 获取指定作者的提交记录
   */
  public async getAuthorCommits(
    options: GetAuthorCommitsOptions
  ): Promise<GitCommit[] | null> {
    const {
      path,
      author,
      branch,
      limit = 100,
      dateFormat = 'iso',
      includeEmail = false,
      includeFullMessage = false,
      includeFiles = false,
      includeTags = false,
      includeStats = false,
    } = options;
    logger.info("获取作者提交记录 (Agent 调用)", { path, author, branch, limit });

    return await errorHandler.wrapAsync(
      async () => {
        // 1. 获取分支信息
        const branches = await fetchBranches(path);
        const targetBranch =
          branch || branches.find((b) => b.current)?.name || "main";

        // 2. 获取提交记录
        const commits = await fetchBranchCommits(path, targetBranch, limit);

        // 3. 筛选指定作者的提交
        const authorLower = author.toLowerCase();
        const filtered = commits.filter((c) =>
          c.author.toLowerCase().includes(authorLower)
        );

        // 4. 格式化日期函数
        const formatCommitDate = (date: string) => {
          switch (dateFormat) {
            case 'local':
              return formatDateTime(date, 'yyyy-MM-dd HH:mm:ss');
            case 'relative': {
              const now = Date.now();
              const commitTime = new Date(date).getTime();
              const diff = now - commitTime;
              const days = Math.floor(diff / (1000 * 60 * 60 * 24));
              if (days === 0) return '今天';
              if (days === 1) return '昨天';
              if (days < 7) return `${days} 天前`;
              if (days < 30) return `${Math.floor(days / 7)} 周前`;
              if (days < 365) return `${Math.floor(days / 30)} 月前`;
              return `${Math.floor(days / 365)} 年前`;
            }
            case 'timestamp':
              return String(new Date(date).getTime());
            defaultValue:
              return date;
          }
        };

        // 5. 处理提交数据，根据选项过滤字段
        const processedCommits = filtered.map((c) => {
          const commit: any = {
            hash: c.hash,
            author: c.author,
            date: formatCommitDate(c.date),
            message: includeFullMessage && c.full_message ? c.full_message : c.message,
          };
          if (includeEmail) {
            commit.email = c.email;
          }
          if (includeFullMessage && c.full_message) {
            commit.full_message = c.full_message;
          }
          if (includeTags && c.tags) {
            commit.tags = c.tags;
          }
          if (includeStats && c.stats) {
            commit.stats = c.stats;
          }
          if (includeFiles && c.files) {
            commit.files = c.files;
          }
          return commit;
        });

        logger.info(`找到 ${processedCommits.length} 条作者 "${author}" 的提交`);
        return processedCommits;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: "获取作者提交记录失败",
        context: options,
      }
    );
  }

  /**
   * [Agent Friendly] 获取指定提交的详细信息
   */
  public async getCommitDetail(
    options: GetCommitDetailOptions
  ): Promise<GitCommit | null> {
    const { path, hash } = options;
    logger.info("获取提交详情 (Agent 调用)", { path, hash });

    return await errorHandler.wrapAsync(
      async () => {
        const commit = await fetchCommitDetail(path, hash);
        logger.info(`成功获取提交 ${hash} 的详情`);
        return commit;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: "获取提交详情失败",
        context: options,
      }
    );
  }

  /**
   * 获取仓库的分支列表
   */
  public async getBranchList(path: string): Promise<string[] | null> {
    logger.info("获取分支列表", { path });

    return await errorHandler.wrapAsync(
      async () => {
        const branches = await fetchBranches(path);
        return branches.map((b) => b.name);
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: "获取分支列表失败",
        context: { path },
      }
    );
  }

  // ==================== 元数据 ====================

  /**
   * 获取服务元数据
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: "getFormattedAnalysis",
          description:
            "[Agent 调用] 获取仓库的格式化分析摘要，包含统计信息、贡献者排行和最近提交",
          parameters: [
            {
              name: "options",
              type: "AnalyzeRepositoryOptions",
              description: "分析选项",
              properties: [
                {
                  name: "path",
                  type: "string",
                  description: "Git 仓库路径",
                  required: true,
                },
                {
                  name: "branch",
                  type: "string",
                  description: "（可选）指定分析的分支",
                  required: false,
                  defaultValue: "当前分支或 'main'",
                },
                {
                  name: "limit",
                  type: "number",
                  description: "（可选）限制分析的提交数量",
                  required: false,
                  defaultValue: 100,
                },
                {
                  name: "dateFormat",
                  type: "'iso' | 'local' | 'relative' | 'timestamp'",
                  description: "（可选）日期格式",
                  required: false,
                  defaultValue: "iso",
                },
                {
                  name: "includes",
                  type: "Array<'statistics' | 'commits' | 'contributors' | 'timeline' | 'charts'>",
                  description: "（可选）包含的内容类型",
                  required: false,
                  defaultValue: "['statistics', 'commits', 'contributors']",
                },
                {
                  name: "includeAuthor",
                  type: "boolean",
                  description: "（可选）是否包含作者信息",
                  required: false,
                  defaultValue: true,
                },
                {
                  name: "includeEmail",
                  type: "boolean",
                  description: "（可选）是否包含作者邮箱",
                  required: false,
                  defaultValue: false,
                },
                {
                  name: "includeFullMessage",
                  type: "boolean",
                  description: "（可选）是否包含完整提交消息",
                  required: false,
                  defaultValue: false,
                },
                {
                  name: "includeFiles",
                  type: "boolean",
                  description: "（可选）是否包含文件变更列表",
                  required: false,
                  defaultValue: false,
                },
                {
                  name: "includeTags",
                  type: "boolean",
                  description: "（可选）是否包含标签信息",
                  required: false,
                  defaultValue: false,
                },
                {
                  name: "includeStats",
                  type: "boolean",
                  description: "（可选）是否包含代码统计",
                  required: false,
                  defaultValue: false,
                },
              ],
            },
          ],
          returnType: "Promise<FormattedRepoAnalysis | null>",
          example: `
const analysis = await service.getFormattedAnalysis({
  path: '/path/to/repo',
  branch: 'main',
  limit: 200,
  dateFormat: 'local',
  includes: ['statistics', 'commits', 'contributors'],
  includeAuthor: true,
  includeEmail: true,
  includeFiles: true,
  includeTags: true,
  includeStats: true
});

if (analysis) {
  console.log(analysis.summary);
  // "仓库分析完成: 150 个提交，5 位贡献者，跨度 90 天"
  
  console.log(analysis.details.statistics);
  // { totalCommits: 150, contributors: 5, timeSpan: 90, averagePerDay: 1.67 }
  
  console.log(analysis.details.topContributors);
  // [{ name: "Alice", count: 80 }, { name: "Bob", count: 50 }, ...]
  
  console.log(analysis.details.recentCommits[0]);
  // { hash: "abc1234", author: "Alice", email: "alice@example.com",
  //   date: "2024/1/15 14:30:00", message: "...", files: [...], tags: [...], stats: {...} }
}`,
        },
        {
          name: "getAuthorCommits",
          description: "[Agent 调用] 获取指定作者的提交记录",
          parameters: [
            {
              name: "options",
              type: "GetAuthorCommitsOptions",
              description: "查询选项",
              properties: [
                {
                  name: "path",
                  type: "string",
                  description: "Git 仓库路径",
                  required: true,
                },
                {
                  name: "author",
                  type: "string",
                  description: "作者名称（支持部分匹配）",
                  required: true,
                },
                {
                  name: "branch",
                  type: "string",
                  description: "（可选）指定分支",
                  required: false,
                  defaultValue: "当前分支或 'main'",
                },
                {
                  name: "limit",
                  type: "number",
                  description: "（可选）限制提交数量",
                  required: false,
                  defaultValue: 100,
                },
                {
                  name: "dateFormat",
                  type: "'iso' | 'local' | 'relative' | 'timestamp'",
                  description: "（可选）日期格式",
                  required: false,
                  defaultValue: "iso",
                },
                {
                  name: "includeEmail",
                  type: "boolean",
                  description: "（可选）是否包含作者邮箱",
                  required: false,
                  defaultValue: false,
                },
                {
                  name: "includeFullMessage",
                  type: "boolean",
                  description: "（可选）是否包含完整提交消息",
                  required: false,
                  defaultValue: false,
                },
                {
                  name: "includeFiles",
                  type: "boolean",
                  description: "（可选）是否包含文件变更列表",
                  required: false,
                  defaultValue: false,
                },
                {
                  name: "includeTags",
                  type: "boolean",
                  description: "（可选）是否包含标签信息",
                  required: false,
                  defaultValue: false,
                },
                {
                  name: "includeStats",
                  type: "boolean",
                  description: "（可选）是否包含代码统计",
                  required: false,
                  defaultValue: false,
                },
              ],
            },
          ],
          returnType: "Promise<GitCommit[] | null>",
          example: `
const commits = await service.getAuthorCommits({
  path: '/path/to/repo',
  author: 'Alice',
  limit: 50,
  dateFormat: 'relative',
  includeEmail: true,
  includeFullMessage: true,
  includeFiles: true,
  includeTags: true,
  includeStats: true
});

if (commits) {
  console.log(\`找到 \${commits.length} 条 Alice 的提交\`);
  commits.forEach(c => {
    console.log(\`\${c.hash.slice(0, 7)} - \${c.date} - \${c.message}\`);
    // "abc1234 - 3 天前 - Fix bug in user service"
    if (c.stats) {
      console.log(\`  变更: +\${c.stats.additions} -\${c.stats.deletions}\`);
    }
  });
}`,
        },
        {
          name: "getCommitDetail",
          description: "[Agent 调用] 获取指定提交的详细信息，包含完整的提交消息、文件变更列表、代码统计和标签信息",
          parameters: [
            {
              name: "options",
              type: "GetCommitDetailOptions",
              description: "查询选项",
              properties: [
                {
                  name: "path",
                  type: "string",
                  description: "Git 仓库路径",
                  required: true,
                },
                {
                  name: "hash",
                  type: "string",
                  description: "提交哈希值（完整或短格式均可）",
                  required: true,
                },
              ],
            },
          ],
          returnType: "Promise<GitCommit | null>",
          example: `
const commit = await service.getCommitDetail({
  path: '/path/to/repo',
  hash: 'abc1234' // 或完整哈希 'abc1234567890...'
});

if (commit) {
  console.log(commit.hash);        // "abc1234567890..."
  console.log(commit.author);      // "Alice"
  console.log(commit.email);       // "alice@example.com"
  console.log(commit.date);        // "2024-01-15T14:30:00+08:00"
  console.log(commit.message);     // "Fix bug in user service"
  console.log(commit.full_message); // 完整提交消息（包含正文）
  console.log(commit.parents);     // ["parent1", "parent2"]
  console.log(commit.tags);        // ["v1.0.0", "release"]
  console.log(commit.stats);       // { additions: 10, deletions: 5, files: 3 }
  console.log(commit.files);       // [{ path: "src/user.ts", status: "M", additions: 5, deletions: 2 }, ...]
}`,
        },
        {
          name: "getBranchList",
          description: "获取仓库的分支列表",
          parameters: [
            {
              name: "path",
              type: "string",
              description: "Git 仓库路径",
              required: true,
            },
          ],
          returnType: "Promise<string[] | null>",
          example: `
const branches = await service.getBranchList('/path/to/repo');

if (branches) {
  console.log(branches);
  // ["main", "develop", "feature/new-ui", ...]
}`,
        },
      ],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: 'Git 分析器',
  path: '/git-analyzer',
  icon: markRaw(GitBranchIcon),
  component: () => import('./GitAnalyzer.vue'),
  description: 'Git提交记录分析和可视化处理工具',
  category: '开发工具'
};