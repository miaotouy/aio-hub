/**
 * 报告生成器
 * 负责根据配置生成不同格式的 Git 分析报告
 */

import type { Ref } from "vue";
import type { GitCommit, ExportConfig, RepoStatistics } from "../types";
import {
  formatDate,
  escapeHtml,
  getContributorStats,
  generateTimelineData,
  generateChartData,
} from "./useGitProcessor";
import { generateHTML } from "../utils/htmlGenerator";

interface ReportGeneratorOptions {
  config: Ref<ExportConfig>;
  repoPath: Ref<string>;
  branch: Ref<string>;
  statistics: RepoStatistics;
  commits: GitCommit[];
  getCommitsToExport: () => GitCommit[];
}

export function useReportGenerator(options: ReportGeneratorOptions) {
  const { config, repoPath, branch, getCommitsToExport } = options;

  /**
   * 根据实际导出的提交列表计算统计信息
   */
  function calculateStatistics(commits: GitCommit[]): RepoStatistics {
    if (commits.length === 0) {
      return {
        totalCommits: 0,
        contributors: 0,
        timeSpan: 0,
        averagePerDay: 0,
      };
    }

    const authors = new Set(commits.map((c) => c.author));
    const dates = commits.map((c) => new Date(c.date).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const days = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));

    return {
      totalCommits: commits.length,
      contributors: authors.size,
      timeSpan: days,
      averagePerDay: commits.length / Math.max(days, 1),
    };
  }

  /**
   * 生成 Markdown 格式报告
   */
  function generateMarkdown(): string {
    const lines: string[] = [];
    const cfg = config.value;
    const commitsToExport = getCommitsToExport();
    const statistics = calculateStatistics(commitsToExport);

    lines.push(`# Git 仓库分析报告`);
    lines.push("");
    lines.push(`**仓库路径**: ${repoPath.value || "当前目录"}`);
    lines.push(`**分支**: ${branch.value}`);
    lines.push(`**生成时间**: ${new Date().toLocaleString("zh-CN")}`);
    lines.push("");

    // 统计信息
    if (cfg.includes.includes("statistics")) {
      lines.push("## 📊 统计信息");
      lines.push("");
      lines.push(`- **总提交数**: ${statistics.totalCommits}`);
      lines.push(`- **贡献者数**: ${statistics.contributors}`);
      lines.push(`- **时间跨度**: ${statistics.timeSpan} 天`);
      lines.push(`- **平均提交/天**: ${statistics.averagePerDay.toFixed(2)}`);
      lines.push("");
    }

    // 贡献者列表
    if (cfg.includes.includes("contributors")) {
      const contributors = getContributorStats(commitsToExport);
      lines.push("## 👥 贡献者统计");
      lines.push("");
      lines.push("| 贡献者 | 提交数 | 占比 |");
      lines.push("|--------|--------|------|");
      contributors.slice(0, 10).forEach((c) => {
        const percentage =
          commitsToExport.length > 0
            ? ((c.count / commitsToExport.length) * 100).toFixed(1)
            : "0.0";
        lines.push(`| ${c.name} | ${c.count} | ${percentage}% |`);
      });
      lines.push("");
    }

    // 时间线
    if (cfg.includes.includes("timeline")) {
      const timelineData = generateTimelineData(commitsToExport);
      lines.push("## 📅 提交时间线");
      lines.push("");
      lines.push("| 日期 | 提交数 |");
      lines.push("|------|--------|");
      timelineData.forEach((item) => {
        lines.push(`| ${item.date} | ${item.count} |`);
      });
      lines.push("");
    }

    // 图表数据
    if (cfg.includes.includes("charts")) {
      const chartData = generateChartData(commitsToExport);

      lines.push("## 📈 图表数据");
      lines.push("");

      // 提交频率趋势
      lines.push("### 提交频率");
      lines.push("");
      lines.push("| 日期 | 提交数 |");
      lines.push("|------|--------|");
      chartData.frequency.slice(0, 30).forEach((item) => {
        lines.push(`| ${item.date} | ${item.count} |`);
      });
      lines.push("");

      // 贡献者分布
      lines.push("### 贡献者分布");
      lines.push("");
      lines.push("| 贡献者 | 提交数 |");
      lines.push("|--------|--------|");
      chartData.contributors.slice(0, 10).forEach((item) => {
        lines.push(`| ${item.name} | ${item.count} |`);
      });
      lines.push("");

      // 提交热力图
      lines.push("### 提交热力图（周几×小时）");
      lines.push("");
      const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      lines.push("| 星期 | 小时 | 提交数 |");
      lines.push("|------|------|--------|");
      chartData.heatmap
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
        .forEach((item) => {
          lines.push(`| ${weekDays[item.day]} | ${item.hour}:00 | ${item.count} |`);
        });
      lines.push("");
    }

    // 提交记录
    if (cfg.includes.includes("commits")) {
      lines.push("## 📝 提交记录");
      lines.push("");
      lines.push(`共 ${commitsToExport.length} 条记录`);
      lines.push("");

      commitsToExport.forEach((commit) => {
        lines.push(
          `### ${commit.hash.substring(0, 7)} - ${formatDate(commit.date, cfg.dateFormat)}`
        );
        lines.push("");
        if (cfg.includeAuthor) {
          if (cfg.includeEmail) {
            lines.push(`**作者**: ${commit.author} <${commit.email}>`);
          } else {
            lines.push(`**作者**: ${commit.author}`);
          }
          lines.push("");
        }
        if (cfg.includeFullMessage && commit.full_message) {
          lines.push(`**提交信息**:`);
          lines.push("");
          lines.push(commit.full_message);
        } else {
          lines.push(`**提交信息**: ${commit.message}`);
        }

        if (cfg.includeTags && commit.tags && commit.tags.length > 0) {
          lines.push("");
          lines.push(`**标签**: ${commit.tags.join(", ")}`);
        }

        if (cfg.includeStats && commit.stats) {
          lines.push("");
          lines.push(
            `**统计**: +${commit.stats.additions} -${commit.stats.deletions} (${commit.stats.files} 文件)`
          );
        }

        if (cfg.includeFiles && commit.files && commit.files.length > 0) {
          lines.push("");
          lines.push("**文件变更**:");
          commit.files.forEach((file) => {
            lines.push(`  - ${file.path} (+${file.additions} -${file.deletions})`);
          });
        }

        lines.push("");
        lines.push("---");
        lines.push("");
      });
    }

    return lines.join("\n");
  }

  /**
   * 生成 JSON 格式报告
   */
  function generateJSON(): string {
    const commitsToExport = getCommitsToExport();
    const statistics = calculateStatistics(commitsToExport);

    const data: any = {
      repository: repoPath.value || "当前目录",
      branch: branch.value,
      generatedAt: new Date().toISOString(),
      statistics: statistics,
    };

    const cfg = config.value;

    if (cfg.includes.includes("contributors")) {
      data.contributors = getContributorStats(commitsToExport);
    }

    if (cfg.includes.includes("timeline")) {
      data.timeline = generateTimelineData(commitsToExport);
    }

    if (cfg.includes.includes("charts")) {
      data.charts = generateChartData(commitsToExport);
    }

    if (cfg.includes.includes("commits")) {
      data.commits = commitsToExport.map((commit) => ({
        hash: commit.hash,
        ...(cfg.includeAuthor ? { author: commit.author } : {}),
        ...(cfg.includeAuthor && cfg.includeEmail ? { email: commit.email } : {}),
        date: formatDate(commit.date, cfg.dateFormat),
        message: commit.message,
        ...(cfg.includeFullMessage && commit.full_message
          ? { full_message: commit.full_message }
          : {}),
        ...(cfg.includeTags && commit.tags ? { tags: commit.tags } : {}),
        ...(cfg.includeStats && commit.stats ? { stats: commit.stats } : {}),
        ...(cfg.includeFiles && commit.files ? { files: commit.files } : {}),
      }));
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * 生成 CSV 格式报告
   */
  function generateCSV(): string {
    const lines: string[] = [];
    const cfg = config.value;

    if (cfg.includes.includes("commits")) {
      const commitsToExport = getCommitsToExport();

      // 头部
      const headers = ["Hash"];
      if (cfg.includeAuthor) {
        headers.push("Author");
        if (cfg.includeEmail) {
          headers.push("Email");
        }
      }
      headers.push("Date", "Message");
      if (cfg.includeStats) {
        headers.push("Additions", "Deletions", "Files Changed");
      }
      if (cfg.includeTags) {
        headers.push("Tags");
      }
      lines.push(headers.join(","));

      // 数据行
      commitsToExport.forEach((commit) => {
        const row = [commit.hash.substring(0, 7)];

        if (cfg.includeAuthor) {
          row.push(`"${commit.author}"`);
          if (cfg.includeEmail) {
            row.push(commit.email);
          }
        }

        row.push(
          formatDate(commit.date, cfg.dateFormat),
          `"${commit.message.replace(/"/g, '""')}"`
        );

        if (cfg.includeStats && commit.stats) {
          row.push(String(commit.stats.additions));
          row.push(String(commit.stats.deletions));
          row.push(String(commit.stats.files));
        }

        if (cfg.includeTags) {
          row.push(commit.tags ? `"${commit.tags.join(", ")}"` : "");
        }

        lines.push(row.join(","));
      });
    }

    return lines.join("\n");
  }

  /**
   * 生成纯文本格式报告
   */
  function generateText(): string {
    const lines: string[] = [];
    const cfg = config.value;
    const commitsToExport = getCommitsToExport();
    const statistics = calculateStatistics(commitsToExport);

    lines.push("=".repeat(60));
    lines.push("Git 仓库分析报告");
    lines.push("=".repeat(60));
    lines.push("");
    lines.push(`仓库路径: ${repoPath.value || "当前目录"}`);
    lines.push(`分支: ${branch.value}`);
    lines.push(`生成时间: ${new Date().toLocaleString("zh-CN")}`);
    lines.push("");

    if (cfg.includes.includes("statistics")) {
      lines.push("-".repeat(40));
      lines.push("统计信息");
      lines.push("-".repeat(40));
      lines.push(`总提交数: ${statistics.totalCommits}`);
      lines.push(`贡献者数: ${statistics.contributors}`);
      lines.push(`时间跨度: ${statistics.timeSpan} 天`);
      lines.push(`平均提交/天: ${statistics.averagePerDay.toFixed(2)}`);
      lines.push("");
    }

    if (cfg.includes.includes("contributors")) {
      const contributors = getContributorStats(commitsToExport);
      lines.push("-".repeat(40));
      lines.push("贡献者统计");
      lines.push("-".repeat(40));
      contributors.slice(0, 10).forEach((c) => {
        const percentage =
          commitsToExport.length > 0
            ? ((c.count / commitsToExport.length) * 100).toFixed(1)
            : "0.0";
        lines.push(`${c.name}: ${c.count} 次提交 (${percentage}%)`);
      });
      lines.push("");
    }

    if (cfg.includes.includes("timeline")) {
      const timelineData = generateTimelineData(commitsToExport);
      lines.push("-".repeat(40));
      lines.push("提交时间线");
      lines.push("-".repeat(40));
      timelineData.forEach((item) => {
        lines.push(`${item.date}: ${item.count} 次提交`);
      });
      lines.push("");
    }

    if (cfg.includes.includes("charts")) {
      const chartData = generateChartData(commitsToExport);

      lines.push("-".repeat(40));
      lines.push("图表数据");
      lines.push("-".repeat(40));

      lines.push("\n提交频率 (最近30天):");
      chartData.frequency.slice(0, 30).forEach((item) => {
        lines.push(`  ${item.date}: ${item.count}`);
      });

      lines.push("\n贡献者分布 (Top 10):");
      chartData.contributors.slice(0, 10).forEach((item) => {
        lines.push(`  ${item.name}: ${item.count}`);
      });

      lines.push("\n提交热力图 (Top 20):");
      const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      chartData.heatmap
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
        .forEach((item) => {
          lines.push(`  ${weekDays[item.day]} ${item.hour}:00 - ${item.count} 次`);
        });
      lines.push("");
    }

    if (cfg.includes.includes("commits")) {
      lines.push("-".repeat(40));
      lines.push(`提交记录 (${commitsToExport.length} 条)`);
      lines.push("-".repeat(40));
      lines.push("");

      commitsToExport.forEach((commit) => {
        lines.push(`[${commit.hash.substring(0, 7)}] ${formatDate(commit.date, cfg.dateFormat)}`);
        if (cfg.includeAuthor) {
          if (cfg.includeEmail) {
            lines.push(`作者: ${commit.author} <${commit.email}>`);
          } else {
            lines.push(`作者: ${commit.author}`);
          }
        }
        if (cfg.includeFullMessage && commit.full_message) {
          lines.push(`提交信息:`);
          lines.push(commit.full_message);
        } else {
          lines.push(`提交信息: ${commit.message}`);
        }

        if (cfg.includeStats && commit.stats) {
          lines.push(
            `变更: +${commit.stats.additions} -${commit.stats.deletions} (${commit.stats.files} 文件)`
          );
        }

        if (cfg.includeTags && commit.tags && commit.tags.length > 0) {
          lines.push(`标签: ${commit.tags.join(", ")}`);
        }

        if (cfg.includeFiles && commit.files && commit.files.length > 0) {
          lines.push(`文件变更 (${commit.files.length}):`);
          commit.files.forEach((file) => {
            lines.push(`  - ${file.path} (+${file.additions} -${file.deletions})`);
          });
        }

        lines.push("");
      });
    }

    return lines.join("\n");
  }

  /**
   * 生成 HTML 格式报告
   */
  function generateHTMLReport(): string {
    const commitsToExport = getCommitsToExport();
    const statistics = calculateStatistics(commitsToExport);

    return generateHTML({
      config: config.value,
      repoPath: repoPath.value,
      branch: branch.value,
      statistics,
      commits: options.commits,
      getCommitsToExport,
      getContributorStats,
      formatDate,
      escapeHtml,
      generateTimelineData,
      generateChartData,
    });
  }

  /**
   * 根据配置生成相应格式的报告
   */
  function generateReport(): string {
    switch (config.value.format) {
      case "markdown":
        return generateMarkdown();
      case "json":
        return generateJSON();
      case "csv":
        return generateCSV();
      case "html":
        return generateHTMLReport();
      case "text":
        return generateText();
      default:
        return generateMarkdown();
    }
  }

  return {
    generateReport,
    generateMarkdown,
    generateJSON,
    generateCSV,
    generateText,
    generateHTMLReport,
  };
}
