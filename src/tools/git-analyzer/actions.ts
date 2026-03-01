import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { fetchBranches, fetchBranchCommits, fetchCommitDetail } from "./composables/useGitLoader";
import { getContributorStats, formatDate } from "./composables/useGitProcessor";
import { calculateStatistics } from "./formatters";
import type { GitCommit, RepoStatistics } from "./types";

const logger = createModuleLogger("tools/git-analyzer/actions");
const errorHandler = createModuleErrorHandler("tools/git-analyzer/actions");

// ==================== 类型定义 ====================

export type DateFormat = "iso" | "local" | "relative" | "timestamp";

export interface AnalyzeRepositoryOptions {
  path: string;
  branch?: string;
  limit?: number;
  dateFormat?: DateFormat;
  includeStatistics?: boolean;
  includeCommits?: boolean;
  includeContributors?: boolean;
  includeTimeline?: boolean;
  includeCharts?: boolean;
  includeAuthor?: boolean;
  includeEmail?: boolean;
  includeFullMessage?: boolean;
  includeFiles?: boolean;
  includeTags?: boolean;
  includeStats?: boolean;
}

export interface FormattedRepoAnalysis {
  summary: string;
  details: {
    path: string;
    branch: string;
    statistics?: RepoStatistics;
    topContributors: Array<{ name: string; count: number }>;
    recentCommits: GitCommit[];
  };
}

export interface GetAuthorCommitsOptions {
  path: string;
  author: string;
  branch?: string;
  limit?: number;
  dateFormat?: DateFormat;
  includeEmail?: boolean;
  includeFullMessage?: boolean;
  includeFiles?: boolean;
  includeTags?: boolean;
  includeStats?: boolean;
}

export interface GetCommitDetailOptions {
  path: string;
  hash: string;
}

// ==================== 核心函数 ====================

/**
 * 获取仓库的格式化分析摘要
 */
export async function analyzeRepository(options: AnalyzeRepositoryOptions): Promise<FormattedRepoAnalysis> {
  const {
    path,
    branch,
    limit = 100,
    includeStatistics = true,
    includeCommits = true,
    includeContributors = true,
    includeTimeline: _includeTimeline = false,
    includeCharts: _includeCharts = false,
  } = options;
  logger.info("开始分析仓库", { path, branch, limit, includeStatistics, includeCommits, includeContributors });

  try {
    const branches = await fetchBranches(path);
    const targetBranch = branch || branches.find((b) => b.current)?.name || "main";
    const commits = await fetchBranchCommits(path, targetBranch, limit);

    if (commits.length === 0) {
      return {
        summary: `仓库 ${path} 在分支 ${targetBranch} 上没有提交记录`,
        details: {
          path,
          branch: targetBranch,
          statistics: { totalCommits: 0, contributors: 0, timeSpan: 0, averagePerDay: 0 },
          topContributors: [],
          recentCommits: [],
        },
      };
    }

    const statistics = calculateStatistics(commits);

    const topContributors = includeContributors ? getContributorStats(commits).slice(0, 5) : [];
    const recentCommits = includeCommits ? commits.slice(0, 10) : [];

    const summary = `仓库分析完成: ${statistics.totalCommits} 个提交，${statistics.contributors} 位贡献者，跨度 ${statistics.timeSpan} 天`;
    logger.info("仓库分析完成", { summary });

    return {
      summary,
      details: {
        path,
        branch: targetBranch,
        statistics: includeStatistics ? statistics : undefined,
        topContributors,
        recentCommits,
      },
    };
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: "仓库分析失败", context: options, showToUser: false });
    throw error;
  }
}

/**
 * 获取指定作者的提交记录
 */
export async function getAuthorCommits(options: GetAuthorCommitsOptions): Promise<GitCommit[]> {
  const {
    path,
    author,
    branch,
    limit = 100,
    dateFormat = "iso",
    includeEmail = false,
    includeFullMessage = false,
    includeFiles = false,
    includeTags = false,
    includeStats = false,
  } = options;
  logger.info("获取作者提交记录", { path, author, branch, limit });

  try {
    const branches = await fetchBranches(path);
    const targetBranch = branch || branches.find((b) => b.current)?.name || "main";
    const commits = await fetchBranchCommits(path, targetBranch, limit);

    const authorLower = author.toLowerCase();
    const filtered = commits.filter((c) => c.author.toLowerCase().includes(authorLower));

    const processedCommits = filtered.map((c) => {
      const commit: Record<string, unknown> = {
        hash: c.hash,
        author: c.author,
        date: formatDate(c.date, dateFormat),
        message: includeFullMessage && c.full_message ? c.full_message : c.message,
      };
      if (includeEmail) commit.email = c.email;
      if (includeFullMessage && c.full_message) commit.full_message = c.full_message;
      if (includeTags && c.tags) commit.tags = c.tags;
      if (includeStats && c.stats) commit.stats = c.stats;
      if (includeFiles && c.files) commit.files = c.files;
      return commit as unknown as GitCommit;
    });

    logger.info(`找到 ${processedCommits.length} 条作者 "${author}" 的提交`);
    return processedCommits;
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: "获取作者提交记录失败", context: options, showToUser: false });
    throw error;
  }
}

/**
 * 获取指定提交的详细信息
 */
export async function getCommitDetail(options: GetCommitDetailOptions): Promise<GitCommit> {
  const { path, hash } = options;
  logger.info("获取提交详情", { path, hash });

  try {
    const commit = await fetchCommitDetail(path, hash);
    logger.info(`成功获取提交 ${hash} 的详情`);
    return commit;
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: "获取提交详情失败", context: options, showToUser: false });
    throw error;
  }
}

/**
 * 获取仓库的分支列表
 */
export async function getBranchList(path: string): Promise<string[]> {
  logger.info("获取分支列表", { path });

  try {
    const branches = await fetchBranches(path);
    return branches.map((b) => b.name);
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: "获取分支列表失败", context: { path }, showToUser: false });
    throw error;
  }
}
