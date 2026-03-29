/**
 * HTML 导出生成器
 * 用于生成 Git 仓库分析报告的 HTML 格式
 */

import type { GitCommit, ExportConfig, RepoStatistics } from "../types";

interface HtmlGeneratorOptions {
  config: ExportConfig;
  repoPath: string;
  branch: string;
  statistics: RepoStatistics;
  commits: GitCommit[];
  getCommitsToExport: () => GitCommit[];
  getContributorStats: (commits: GitCommit[]) => Array<{ name: string; count: number }>;
  formatDate: (date: string, format: string) => string;
  escapeHtml: (text: string) => string;
  generateTimelineData?: (commits: GitCommit[]) => Array<{ date: string; count: number }>;
  generateChartData?: (commits: GitCommit[]) => {
    frequency: Array<{ date: string; count: number }>;
    contributors: Array<{ name: string; count: number }>;
    heatmap: Array<{ day: number; hour: number; count: number }>;
  };
  filterSummary: string;
  hasActiveFilters: boolean;
}

/**
 * 生成 HTML 格式的报告
 */
export function generateHTML(options: HtmlGeneratorOptions): string {
  const {
    config,
    repoPath,
    branch,
    statistics,
    getCommitsToExport,
    getContributorStats,
    formatDate,
    escapeHtml,
    generateTimelineData,
    generateChartData,
    filterSummary,
    hasActiveFilters,
  } = options;

  // 生成独特的 CSS 类前缀，避免样式污染
  const cssPrefix = "git-export-" + Date.now();

  // 生成主题样式（DRY 原则：定义一次，多处使用）
  const getThemeStyles = () => {
    // 主题变量定义
    const themeVars = {
      light: {
        "--bg-primary": "#f5f5f5",
        "--bg-secondary": "#ffffff",
        "--bg-card": "#ffffff",
        "--text-primary": "#333333",
        "--text-secondary": "#7f8c8d",
        "--border-color": "#ecf0f1",
        "--accent-color": "#3498db",
        "--success-color": "#27ae60",
        "--danger-color": "#e74c3c",
        "--hover-bg": "#f8f9fa",
      },
      dark: {
        "--bg-primary": "#1a1a1a",
        "--bg-secondary": "#2d2d2d",
        "--bg-card": "#2d2d2d",
        "--text-primary": "#e0e0e0",
        "--text-secondary": "#b0b0b0",
        "--border-color": "#404040",
        "--accent-color": "#4a9eff",
        "--success-color": "#4caf50",
        "--danger-color": "#f44336",
        "--hover-bg": "#3a3a3a",
      },
    };

    // 转换为 CSS 字符串
    const lightVarsStr = Object.entries(themeVars.light)
      .map(([key, value]) => `${key}: ${value};`)
      .join("\n      ");

    const darkVarsStr = Object.entries(themeVars.dark)
      .map(([key, value]) => `${key}: ${value};`)
      .join("\n      ");

    // 基础样式：总是包含浅色和深色两套，让浏览器自动选择
    let styles = `
    :root {
      color-scheme: light dark;
    }
    
    /* 默认浅色主题 */
    .${cssPrefix}-root {
      ${lightVarsStr}
    }
    
    /* 深色主题（通过媒体查询自动切换） */
    @media (prefers-color-scheme: dark) {
      .${cssPrefix}-root {
        ${darkVarsStr}
      }
    }`;

    // 如果用户强制选择了特定主题，添加覆盖规则
    if (config.htmlTheme === "dark") {
      styles += `
    
    /* 强制深色主题 */
    html[data-theme="dark"] .${cssPrefix}-root {
      ${darkVarsStr}
    }`;
    } else if (config.htmlTheme === "light") {
      styles += `
    
    /* 强制浅色主题 */
    html[data-theme="light"] .${cssPrefix}-root {
      ${lightVarsStr}
    }`;
    }

    return styles;
  };

  // 根据主题配置决定是否添加 data-theme 属性
  const htmlThemeAttr =
    config.htmlTheme === "dark" || config.htmlTheme === "light" ? ` data-theme="${config.htmlTheme}"` : "";

  let html = `<!DOCTYPE html>
<html lang="zh-CN"${htmlThemeAttr}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Git 仓库分析报告</title>
  <style>
    /* 重置样式，使用独特的类名避免污染 */
    .${cssPrefix}-root * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    ${getThemeStyles()}
    
    /* 通用样式 */
    .${cssPrefix}-root {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: var(--text-primary);
      background: var(--bg-primary);
      min-height: 100vh;
    }
    
    .${cssPrefix}-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .${cssPrefix}-h1 {
      color: var(--text-primary);
      border-bottom: 3px solid var(--accent-color);
      padding-bottom: 10px;
      margin-bottom: 20px;
      font-size: 2em;
    }
    
    .${cssPrefix}-h2 {
      color: var(--text-primary);
      margin-top: 30px;
      margin-bottom: 15px;
      font-size: 1.5em;
    }
    
    .${cssPrefix}-info {
      background: var(--bg-card);
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
      border: var(--border-width) solid var(--border-color);
    }
    
    .${cssPrefix}-info p {
      margin: 5px 0;
      color: var(--text-primary);
    }
    
    .${cssPrefix}-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }
    
    .${cssPrefix}-stat-card {
      background: var(--bg-card);
      padding: 20px;
      border-radius: 5px;
      text-align: center;
      border: var(--border-width) solid var(--border-color);
    }
    
    .${cssPrefix}-stat-value {
      font-size: 2em;
      font-weight: bold;
      color: var(--accent-color);
    }
    
    .${cssPrefix}-stat-label {
      color: var(--text-secondary);
      margin-top: 5px;
    }
    
    .${cssPrefix}-table {
      width: 100%;
      background: var(--bg-card);
      border-collapse: collapse;
      margin: 20px 0;
      border: var(--border-width) solid var(--border-color);
      border-radius: 5px;
      overflow: hidden;
    }
    
    .${cssPrefix}-table th,
    .${cssPrefix}-table td {
      padding: 12px;
      text-align: left;
      border-bottom: var(--border-width) solid var(--border-color);
      color: var(--text-primary);
    }
    
    .${cssPrefix}-table th {
      background: var(--accent-color);
      color: white;
      font-weight: 600;
    }
    
    .${cssPrefix}-table tr:hover {
      background: var(--hover-bg);
    }
    
    .${cssPrefix}-table tr:last-child td {
      border-bottom: none;
    }
    
    .${cssPrefix}-commit {
      background: var(--bg-card);
      padding: 15px;
      margin: 15px 0;
      border-radius: 5px;
      border: var(--border-width) solid var(--border-color);
    }
    
    .${cssPrefix}-commit p {
      margin: 8px 0;
      color: var(--text-primary);
    }
    
    .${cssPrefix}-commit-hash {
      display: inline-block;
      padding: 2px 8px;
      background: var(--danger-color);
      color: white;
      border-radius: 3px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 0.9em;
    }
    
    .${cssPrefix}-commit-date {
      float: right;
      color: var(--text-secondary);
    }
    
    .${cssPrefix}-commit pre {
      white-space: pre-wrap;
      font-family: inherit;
      color: var(--text-primary);
      margin: 10px 0;
    }
    
    .${cssPrefix}-additions {
      color: var(--success-color);
      font-weight: 500;
    }
    
    .${cssPrefix}-deletions {
      color: var(--danger-color);
      font-weight: 500;
      margin-left: 10px;
    }
    
    .${cssPrefix}-files-count {
      color: var(--text-secondary);
      margin-left: 10px;
    }
  </style>
</head>
<body class="${cssPrefix}-root" data-managed-theme="true">
  <div class="${cssPrefix}-container">
    <h1 class="${cssPrefix}-h1">Git 仓库分析报告</h1>
    
    <div class="${cssPrefix}-info">
      <p><strong>仓库路径:</strong> ${repoPath || "当前目录"}</p>
      <p><strong>分支:</strong> ${branch}</p>
      <p><strong>生成时间:</strong> ${new Date().toLocaleString("zh-CN")}</p>
      ${
        config.includeFilterInfo && hasActiveFilters
          ? `<p><strong>筛选条件:</strong> ${escapeHtml(filterSummary)}</p>`
          : ""
      }
    </div>`;

  // 统计信息
  if (config.includeStatistics) {
    html += `
    <h2 class="${cssPrefix}-h2">📊 统计信息</h2>
    <div class="${cssPrefix}-stats">
      <div class="${cssPrefix}-stat-card">
        <div class="${cssPrefix}-stat-value">${statistics.totalCommits}</div>
        <div class="${cssPrefix}-stat-label">总提交数</div>
      </div>
      <div class="${cssPrefix}-stat-card">
        <div class="${cssPrefix}-stat-value">${statistics.contributors}</div>
        <div class="${cssPrefix}-stat-label">贡献者数</div>
      </div>
      <div class="${cssPrefix}-stat-card">
        <div class="${cssPrefix}-stat-value">${statistics.timeSpan}</div>
        <div class="${cssPrefix}-stat-label">时间跨度(天)</div>
      </div>
      <div class="${cssPrefix}-stat-card">
        <div class="${cssPrefix}-stat-value">${statistics.averagePerDay.toFixed(2)}</div>
        <div class="${cssPrefix}-stat-label">平均提交/天</div>
      </div>
    </div>`;
  }

  // 贡献者列表
  if (config.includeContributors) {
    const commitsToExport = getCommitsToExport();
    const contributors = getContributorStats(commitsToExport);
    html += `
    <h2 class="${cssPrefix}-h2">👥 贡献者统计</h2>
    <table class="${cssPrefix}-table">
      <thead>
        <tr>
          <th>贡献者</th>
          <th>提交数</th>
          <th>占比</th>
        </tr>
      </thead>
      <tbody>`;

    contributors.slice(0, 10).forEach((c) => {
      const percentage = commitsToExport.length > 0 ? ((c.count / commitsToExport.length) * 100).toFixed(1) : "0.0";
      html += `
        <tr>
          <td>${escapeHtml(c.name)}</td>
          <td>${c.count}</td>
          <td>${percentage}%</td>
        </tr>`;
    });

    html += `
      </tbody>
    </table>`;
  }

  // 时间线
  if (config.includeTimeline && generateTimelineData) {
    const commitsToExport = getCommitsToExport();
    const timelineData = generateTimelineData(commitsToExport);
    html += `
    <h2 class="${cssPrefix}-h2">📅 提交时间线</h2>
    <table class="${cssPrefix}-table">
      <thead>
        <tr>
          <th>日期</th>
          <th>提交数</th>
        </tr>
      </thead>
      <tbody>`;

    timelineData.forEach((item) => {
      html += `
        <tr>
          <td>${item.date}</td>
          <td>${item.count}</td>
        </tr>`;
    });

    html += `
      </tbody>
    </table>`;
  }

  // 图表数据
  if (config.includeCharts && generateChartData) {
    const commitsToExport = getCommitsToExport();
    const chartData = generateChartData(commitsToExport);
    const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

    html += `
    <h2 class="${cssPrefix}-h2">📈 图表数据</h2>
    
    <h3 class="${cssPrefix}-h2" style="font-size: 1.2em; margin-top: 20px;">提交频率</h3>
    <table class="${cssPrefix}-table">
      <thead>
        <tr>
          <th>日期</th>
          <th>提交数</th>
        </tr>
      </thead>
      <tbody>`;

    chartData.frequency.slice(0, 30).forEach((item) => {
      html += `
        <tr>
          <td>${item.date}</td>
          <td>${item.count}</td>
        </tr>`;
    });

    html += `
      </tbody>
    </table>
    
    <h3 class="${cssPrefix}-h2" style="font-size: 1.2em; margin-top: 20px;">贡献者分布</h3>
    <table class="${cssPrefix}-table">
      <thead>
        <tr>
          <th>贡献者</th>
          <th>提交数</th>
        </tr>
      </thead>
      <tbody>`;

    chartData.contributors.slice(0, 10).forEach((item) => {
      html += `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${item.count}</td>
        </tr>`;
    });

    html += `
      </tbody>
    </table>
    
    <h3 class="${cssPrefix}-h2" style="font-size: 1.2em; margin-top: 20px;">提交热力图（周几×小时）</h3>
    <table class="${cssPrefix}-table">
      <thead>
        <tr>
          <th>星期</th>
          <th>小时</th>
          <th>提交数</th>
        </tr>
      </thead>
      <tbody>`;

    chartData.heatmap
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .forEach((item) => {
        html += `
        <tr>
          <td>${weekDays[item.day]}</td>
          <td>${item.hour}:00</td>
          <td>${item.count}</td>
        </tr>`;
      });

    html += `
      </tbody>
    </table>`;
  }

  // 提交记录
  if (config.includeCommits) {
    const commits = getCommitsToExport();
    html += `
    <h2 class="${cssPrefix}-h2">📝 提交记录 (${commits.length} 条)</h2>`;

    commits.slice(0, 100).forEach((commit) => {
      html += `
    <div class="${cssPrefix}-commit">
      <p>
        <span class="${cssPrefix}-commit-hash">${commit.hash.substring(0, 7)}</span>
        ${config.includeAuthor ? `<strong>${escapeHtml(commit.author)}</strong>${config.includeEmail ? ` &lt;${escapeHtml(commit.email)}&gt;` : ""}` : ""}
        <span class="${cssPrefix}-commit-date">${formatDate(commit.date, config.dateFormat)}</span>
      </p>`;

      if (config.includeFullMessage && commit.full_message) {
        html += `<pre>${escapeHtml(commit.full_message)}</pre>`;
      } else {
        html += `<p>${escapeHtml(commit.message)}</p>`;
      }

      if (config.includeStats && commit.stats) {
        html += `
      <p>
        <span class="${cssPrefix}-additions">+${commit.stats.additions}</span>
        <span class="${cssPrefix}-deletions">-${commit.stats.deletions}</span>
        <span class="${cssPrefix}-files-count">${commit.stats.files} 文件</span>
      </p>`;
      }

      if (config.includeBranches && commit.branches && commit.branches.length > 0) {
        html += `
      <p><strong>分支:</strong> ${commit.branches.map((b) => escapeHtml(b)).join(", ")}</p>`;
      }

      if (config.includeTags && commit.tags && commit.tags.length > 0) {
        html += `
      <p><strong>标签:</strong> ${commit.tags.map((t) => escapeHtml(t)).join(", ")}</p>`;
      }

      if (config.includeFiles && commit.files && commit.files.length > 0) {
        html += `
      <p><strong>文件变更 (${commit.files.length}):</strong></p>
      <ul style="margin: 10px 0; padding-left: 20px;">`;
        commit.files.forEach((file) => {
          html += `
        <li>
          <code style="background: var(--bg-primary); padding: 2px 6px; border-radius: 3px;">${escapeHtml(file.path)}</code>
          <span class="${cssPrefix}-additions">+${file.additions}</span>
          <span class="${cssPrefix}-deletions">-${file.deletions}</span>
        </li>`;
        });
        html += `
      </ul>`;
      }

      html += `
    </div>`;
    });
  }

  html += `
  </div>
</body>
</html>`;

  return html;
}
