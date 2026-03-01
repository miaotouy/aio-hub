import type { GitCommit, RepoStatistics, ExportConfig } from "./types";
import { formatDateTime } from "@/utils/time";
import { formatDate } from "./composables/useGitProcessor";

// ==================== 纯函数工具 ====================

/**
 * 根据提交列表计算统计信息（公用纯函数）
 * 统一供 actions.ts（Agent）和 useReportGenerator.ts（手动导出）使用
 */
export function calculateStatistics(commits: GitCommit[]): RepoStatistics {
  if (commits.length === 0) {
    return { totalCommits: 0, contributors: 0, timeSpan: 0, averagePerDay: 0 };
  }
  const authors = new Set(commits.map((c) => c.author));
  const dates = commits.map((c) => new Date(c.date).getTime());
  const days = Math.ceil((Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24));
  return {
    totalCommits: commits.length,
    contributors: authors.size,
    timeSpan: days,
    averagePerDay: commits.length / Math.max(days, 1),
  };
}

/**
 * 创建 Agent 场景的默认 ExportConfig（全量包含）
 * 避免 registry.ts 中手动构造不相关字段
 */
export function createAgentExportConfig(overrides?: Partial<ExportConfig>): ExportConfig {
  return {
    format: "markdown",
    includeStatistics: true,
    includeCommits: true,
    includeContributors: true,
    includeTimeline: false,
    includeCharts: false,
    commitRange: "all",
    customCount: 100,
    dateFormat: "iso",
    includeAuthor: true,
    includeEmail: true,
    includeFullMessage: true,
    includeFiles: true,
    includeTags: true,
    includeBranches: true,
    includeStats: true,
    includeFilterInfo: false,
    htmlTheme: "auto",
    ...overrides,
  };
}

// ==================== 原子格式化函数 ====================

/**
 * 原子格式化函数 - 积木式拼装的基础
 */
export const formatters = {
  hash: (hash: string, short = true) => (short ? hash.substring(0, 7) : hash),

  date: (date: string, format: ExportConfig["dateFormat"]) => formatDate(date, format),

  author: (name: string, email?: string) => (email ? `${name} <${email}>` : name),

  stats: (stats: { additions: number; deletions: number; files?: number }) => {
    const parts = [`+${stats.additions}`, `-${stats.deletions}`];
    if (stats.files !== undefined) parts.push(`(${stats.files} 文件)`);
    return parts.join(" ");
  },

  message: (msg: string, fullMsg?: string, useFull = false) => (useFull && fullMsg ? fullMsg : msg),

  branches: (branches: string[]) => (branches?.length ? branches.join(", ") : ""),

  tags: (tags: string[]) => (tags?.length ? tags.join(", ") : ""),

  fileChange: (file: { path: string; status?: string; additions: number; deletions: number }) =>
    `\`${file.path}\`${file.status ? ` (${file.status})` : ""} +${file.additions} -${file.deletions}`,
};

// ==================== 报告组件格式化器 ====================

/**
 * 报告组件格式化器 - 积木式拼装报告的核心构件
 * 所有路径（Agent / 手动导出）统一通过此处生成文本
 */
export const reportComponents = {
  header: (title: string, path: string, branch: string, format: "md" | "text" = "md") => {
    const time = formatDateTime(new Date(), "yyyy-MM-dd HH:mm:ss");
    if (format === "md") {
      return [`# ${title}`, "", `- **仓库路径**: ${path}`, `- **分支**: ${branch}`, `- **生成时间**: ${time}`, ""].join(
        "\n"
      );
    }
    const line = "=".repeat(60);
    return [line, title, line, "", `仓库路径: ${path}`, `分支: ${branch}`, `生成时间: ${time}`, ""].join("\n");
  },

  section: (title: string, content: string, format: "md" | "text" = "md") => {
    if (format === "md") {
      return [`## ${title}`, "", content, ""].join("\n");
    }
    const line = "-".repeat(40);
    return [line, title, line, content, ""].join("\n");
  },

  statistics: (stats: RepoStatistics, format: "md" | "text" = "md") => {
    const items = [
      `总提交数: ${stats.totalCommits}`,
      `贡献者数: ${stats.contributors}`,
      `时间跨度: ${stats.timeSpan} 天`,
      `平均提交/天: ${stats.averagePerDay.toFixed(2)}`,
    ];
    if (format === "md") {
      return items.map((i) => `- **${i.split(": ")[0]}**: ${i.split(": ")[1]}`).join("\n");
    }
    return items.join("\n");
  },

  contributors: (
    data: Array<{ name: string; count: number }>,
    totalCommits: number,
    format: "md" | "text" = "md",
    showPercentage = true
  ) => {
    if (format === "md") {
      if (showPercentage) {
        const lines = ["| 贡献者 | 提交数 | 占比 |", "|--------|--------|------|"];
        data.forEach((c) => {
          const percentage = totalCommits > 0 ? ((c.count / totalCommits) * 100).toFixed(1) : "0.0";
          lines.push(`| ${c.name} | ${c.count} | ${percentage}% |`);
        });
        return lines.join("\n");
      } else {
        const lines = ["| 贡献者 | 提交数 |", "|--------|--------|"];
        data.forEach((c) => {
          lines.push(`| ${c.name} | ${c.count} |`);
        });
        return lines.join("\n");
      }
    }
    return data
      .map((c) => {
        if (showPercentage) {
          const percentage = totalCommits > 0 ? ((c.count / totalCommits) * 100).toFixed(1) : "0.0";
          return `${c.name}: ${c.count} 次提交 (${percentage}%)`;
        }
        return `${c.name}: ${c.count} 次提交`;
      })
      .join("\n");
  },

  timeline: (data: Array<{ date: string; count: number }>, format: "md" | "text" = "md") => {
    if (format === "md") {
      const lines = ["| 日期 | 提交数 |", "|------|--------|"];
      data.forEach((item) => lines.push(`| ${item.date} | ${item.count} |`));
      return lines.join("\n");
    }
    return data.map((item) => `${item.date}: ${item.count} 次提交`).join("\n");
  },

  /**
   * 格式化单条提交的详细信息（积木块）
   * Agent 和手动导出统一使用此函数
   */
  commitItem: (commit: GitCommit, options: ExportConfig, format: "md" | "text" = "md") => {
    const lines: string[] = [];
    const {
      dateFormat,
      includeAuthor,
      includeEmail,
      includeFullMessage,
      includeBranches,
      includeTags,
      includeStats,
      includeFiles,
    } = options;

    const hashStr = formatters.hash(commit.hash);
    const dateStr = formatters.date(commit.date, dateFormat);

    if (format === "md") {
      lines.push(`### ${hashStr} - ${dateStr}`);
      lines.push("");

      if (includeAuthor) {
        lines.push(`**作者**: ${formatters.author(commit.author, includeEmail ? commit.email : undefined)}`);
        lines.push("");
      }

      const msg = formatters.message(commit.message, commit.full_message, includeFullMessage);
      if (includeFullMessage && commit.full_message) {
        lines.push(`**提交信息**:`);
        lines.push("");
        lines.push(msg);
      } else {
        lines.push(`**提交信息**: ${msg}`);
      }

      if (includeBranches && commit.branches && commit.branches.length > 0) {
        lines.push("");
        lines.push(`**分支**: ${formatters.branches(commit.branches)}`);
      }

      if (includeTags && commit.tags && commit.tags.length > 0) {
        lines.push("");
        lines.push(`**标签**: ${formatters.tags(commit.tags)}`);
      }

      if (includeStats && commit.stats) {
        lines.push("");
        lines.push(`**统计**: ${formatters.stats(commit.stats)}`);
      }

      if (includeFiles && commit.files && commit.files.length > 0) {
        lines.push("");
        lines.push("**文件变更**:");
        commit.files.forEach((file) => {
          lines.push(`  - ${formatters.fileChange(file)}`);
        });
      }

      lines.push("");
      lines.push("---");
    } else {
      // 纯文本格式
      lines.push(`[${hashStr}] ${dateStr}`);

      if (includeAuthor) {
        lines.push(`作者: ${formatters.author(commit.author, includeEmail ? commit.email : undefined)}`);
      }

      const msg = formatters.message(commit.message, commit.full_message, includeFullMessage);
      if (includeFullMessage && commit.full_message) {
        lines.push(`提交信息:`);
        lines.push(msg);
      } else {
        lines.push(`提交信息: ${msg}`);
      }

      if (includeStats && commit.stats) {
        lines.push(`变更: ${formatters.stats(commit.stats)}`);
      }

      if (includeBranches && commit.branches && commit.branches.length > 0) {
        lines.push(`分支: ${formatters.branches(commit.branches)}`);
      }

      if (includeTags && commit.tags && commit.tags.length > 0) {
        lines.push(`标签: ${formatters.tags(commit.tags)}`);
      }

      if (includeFiles && commit.files && commit.files.length > 0) {
        lines.push(`文件变更 (${commit.files.length}):`);
        commit.files.forEach((file) => {
          lines.push(`  - ${file.path} (+${file.additions} -${file.deletions})`);
        });
      }

      lines.push("");
    }

    return lines.join("\n");
  },
};

// ==================== 组合格式化函数 ====================

/**
 * 格式化提交记录列表（根据配置生成对应详情）
 * Agent 和手动导出统一使用
 */
export function formatCommitList(commits: GitCommit[], options: ExportConfig, format: "md" | "text" = "md"): string {
  if (commits.length === 0) {
    return "没有找到匹配的提交记录。";
  }

  const lines: string[] = [];
  lines.push(`共 ${commits.length} 条记录`);
  lines.push("");

  commits.forEach((c) => {
    lines.push(reportComponents.commitItem(c, options, format));
    lines.push("");
  });

  return lines.join("\n").trim();
}

/**
 * 格式化分支列表
 */
export function formatBranchList(branches: string[]): string {
  if (branches.length === 0) {
    return "该仓库没有任何分支。";
  }
  return `## 分支列表\n\n${branches.map((b) => `- ${b}`).join("\n")}`;
}
