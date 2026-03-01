/**
 * 报告生成器
 * 负责根据配置生成不同格式的 Git 分析报告
 */

import type { Ref } from "vue";
import type { GitCommit, ExportConfig } from "../types";
import {
  formatDate,
  escapeHtml,
  getContributorStats,
  generateTimelineData,
  generateChartData,
} from "./useGitProcessor";
import { calculateStatistics, formatCommitList, reportComponents } from "../formatters";
import { generateHTML } from "../utils/htmlGenerator";

interface ReportGeneratorOptions {
  config: Ref<ExportConfig>;
  repoPath: Ref<string>;
  branch: Ref<string>;
  getCommitsToExport: () => GitCommit[];
  filterSummary: Ref<string>;
  hasActiveFilters: Ref<boolean>;
}

export function useReportGenerator(options: ReportGeneratorOptions) {
  const { config, repoPath, branch, getCommitsToExport, filterSummary, hasActiveFilters } = options;

  // calculateStatistics 已提取到 formatters.ts 中作为公共纯函数

  /**
   * 生成 Markdown 格式报告
   */
  function generateMarkdown(): string {
    const lines: string[] = [];
    const cfg = config.value;
    const commitsToExport = getCommitsToExport();
    const statistics = calculateStatistics(commitsToExport);

    // 1. 头部 (积木1)
    lines.push(reportComponents.header("Git 仓库分析报告", repoPath.value || "当前目录", branch.value));

    // 2. 筛选信息 (积木2)
    if (cfg.includeFilterInfo && hasActiveFilters.value) {
      lines.push(reportComponents.section("🔍 筛选条件", filterSummary.value));
    }

    // 3. 统计信息 (积木3)
    if (cfg.includeStatistics) {
      lines.push(reportComponents.section("📊 统计信息", reportComponents.statistics(statistics)));
    }

    // 4. 贡献者列表 (积木4)
    if (cfg.includeContributors) {
      const contributors = getContributorStats(commitsToExport);
      lines.push(
        reportComponents.section("👥 贡献者统计", reportComponents.contributors(contributors, statistics.totalCommits))
      );
    }

    // 5. 时间线 (积木5)
    if (cfg.includeTimeline) {
      const timelineData = generateTimelineData(commitsToExport);
      lines.push(reportComponents.section("📅 提交时间线", reportComponents.timeline(timelineData)));
    }

    // 6. 图表数据 (积木6)
    if (cfg.includeCharts) {
      const chartData = generateChartData(commitsToExport);
      let chartContent = "";

      // 提交频率趋势
      chartContent += "### 提交频率\n\n" + reportComponents.timeline(chartData.frequency.slice(0, 30)) + "\n\n";

      // 贡献者分布
      chartContent +=
        "### 贡献者分布\n\n" +
        reportComponents.contributors(chartData.contributors.slice(0, 10), statistics.totalCommits) +
        "\n\n";

      // 提交热力图
      const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      const heatmapLines = ["| 星期 | 小时 | 提交数 |", "|------|------|--------|"];
      chartData.heatmap
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
        .forEach((item) => {
          heatmapLines.push(`| ${weekDays[item.day]} | ${item.hour}:00 | ${item.count} |`);
        });
      chartContent += "### 提交热力图（周几×小时）\n\n" + heatmapLines.join("\n");

      lines.push(reportComponents.section("📈 图表数据", chartContent));
    }

    // 7. 提交记录 (积木7)
    if (cfg.includeCommits) {
      lines.push(reportComponents.section("📝 提交记录", formatCommitList(commitsToExport, cfg)));
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

    if (config.value.includeFilterInfo && hasActiveFilters.value) {
      data.filterInfo = filterSummary.value;
    }

    const cfg = config.value;

    if (cfg.includeContributors) {
      data.contributors = getContributorStats(commitsToExport);
    }

    if (cfg.includeTimeline) {
      data.timeline = generateTimelineData(commitsToExport);
    }

    if (cfg.includeCharts) {
      data.charts = generateChartData(commitsToExport);
    }

    if (cfg.includeCommits) {
      data.commits = commitsToExport.map((commit) => ({
        hash: commit.hash,
        ...(cfg.includeAuthor ? { author: commit.author } : {}),
        ...(cfg.includeAuthor && cfg.includeEmail ? { email: commit.email } : {}),
        date: formatDate(commit.date, cfg.dateFormat),
        message: commit.message,
        ...(cfg.includeFullMessage && commit.full_message ? { full_message: commit.full_message } : {}),
        ...(cfg.includeBranches && commit.branches && commit.branches.length > 0 ? { branches: commit.branches } : {}),
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

    if (cfg.includeCommits) {
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
      if (cfg.includeBranches) {
        headers.push("Branches");
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

        row.push(formatDate(commit.date, cfg.dateFormat), `"${commit.message.replace(/"/g, '""')}"`);

        if (cfg.includeStats && commit.stats) {
          row.push(String(commit.stats.additions));
          row.push(String(commit.stats.deletions));
          row.push(String(commit.stats.files));
        }

        if (cfg.includeBranches) {
          row.push(commit.branches && commit.branches.length > 0 ? `"${commit.branches.join(", ")}"` : "");
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
    const fmt = "text" as const;

    // 1. 头部
    lines.push(reportComponents.header("Git 仓库分析报告", repoPath.value || "当前目录", branch.value, fmt));

    // 2. 筛选信息
    if (cfg.includeFilterInfo && hasActiveFilters.value) {
      lines.push(reportComponents.section("筛选条件", filterSummary.value, fmt));
    }

    // 3. 统计信息
    if (cfg.includeStatistics) {
      lines.push(reportComponents.section("统计信息", reportComponents.statistics(statistics, fmt), fmt));
    }

    // 4. 贡献者列表
    if (cfg.includeContributors) {
      const contributors = getContributorStats(commitsToExport);
      lines.push(
        reportComponents.section(
          "贡献者统计",
          reportComponents.contributors(contributors, statistics.totalCommits, fmt),
          fmt
        )
      );
    }

    // 5. 时间线
    if (cfg.includeTimeline) {
      const timelineData = generateTimelineData(commitsToExport);
      lines.push(reportComponents.section("提交时间线", reportComponents.timeline(timelineData, fmt), fmt));
    }

    // 6. 图表数据
    if (cfg.includeCharts) {
      const chartData = generateChartData(commitsToExport);
      let chartContent = "";

      chartContent += "提交频率 (最近30天):\n";
      chartData.frequency.slice(0, 30).forEach((item) => {
        chartContent += `  ${item.date}: ${item.count}\n`;
      });

      chartContent += "\n贡献者分布 (Top 10):\n";
      chartData.contributors.slice(0, 10).forEach((item) => {
        chartContent += `  ${item.name}: ${item.count}\n`;
      });

      chartContent += "\n提交热力图 (Top 20):\n";
      const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      chartData.heatmap
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
        .forEach((item) => {
          chartContent += `  ${weekDays[item.day]} ${item.hour}:00 - ${item.count} 次\n`;
        });

      lines.push(reportComponents.section("图表数据", chartContent, fmt));
    }

    // 7. 提交记录
    if (cfg.includeCommits) {
      lines.push(
        reportComponents.section(
          `提交记录 (${commitsToExport.length} 条)`,
          formatCommitList(commitsToExport, cfg, fmt),
          fmt
        )
      );
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
      commits: commitsToExport, // Changed from options.commits to commitsToExport
      getCommitsToExport,
      getContributorStats,
      formatDate,
      escapeHtml,
      generateTimelineData,
      generateChartData,
      filterSummary: filterSummary.value,
      hasActiveFilters: hasActiveFilters.value,
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
