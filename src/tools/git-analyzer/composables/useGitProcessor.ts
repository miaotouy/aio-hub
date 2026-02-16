import type { GitCommit } from "../types";
import { formatDateTime } from "@/utils/time";

/**
 * Git 数据处理器
 * 提供一系列纯函数，用于从原始 GitCommit 数组中派生出各类统计数据
 */

// ==================== 日期处理 ====================

/**
 * 格式化日期
 */
export function formatDate(date: string, format: string): string {
  const d = new Date(date);

  switch (format) {
    case "iso":
      return d.toISOString();
    case "local":
      return formatDateTime(d, 'yyyy-MM-dd HH:mm:ss');
    case "relative":
      return getRelativeTime(d);
    case "timestamp":
      return String(d.getTime());
    default:
      return formatDateTime(d, 'yyyy-MM-dd HH:mm:ss');
  }
}

/**
 * 获取相对时间
 */
export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 月前`;
  return `${Math.floor(days / 365)} 年前`;
}

// ==================== 文本处理 ====================

/**
 * HTML 转义函数，防止 XSS
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// ==================== 统计分析 ====================

/**
 * 获取贡献者统计
 */
export function getContributorStats(commits: GitCommit[]): Array<{ name: string; count: number }> {
  const authorCounts = commits.reduce(
    (acc, c) => {
      acc[c.author] = (acc[c.author] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return Object.entries(authorCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 生成时间线数据（按日期统计提交数）
 */
export function generateTimelineData(commits: GitCommit[]): Array<{ date: string; count: number }> {
  const dateCounts = commits.reduce(
    (acc, c) => {
      const date = c.date.split("T")[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return Object.entries(dateCounts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 生成提交热力图数据（按星期几和小时统计）
 */
export function generateHeatmapData(
  commits: GitCommit[]
): Array<{ day: number; hour: number; count: number }> {
  const heatmapData: Array<{ day: number; hour: number; count: number }> = [];
  const dayMap = new Map<string, number>();

  commits.forEach((c) => {
    const date = new Date(c.date);
    const day = date.getDay();
    const hour = date.getHours();
    const key = `${day}-${hour}`;
    dayMap.set(key, (dayMap.get(key) || 0) + 1);
  });

  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const count = dayMap.get(`${day}-${hour}`) || 0;
      if (count > 0) {
        heatmapData.push({ day, hour, count });
      }
    }
  }

  return heatmapData;
}

/**
 * 生成完整的图表数据
 */
export function generateChartData(commits: GitCommit[]) {
  return {
    frequency: generateTimelineData(commits),
    contributors: getContributorStats(commits),
    heatmap: generateHeatmapData(commits),
  };
}

// ==================== 数据筛选 ====================

/**
 * 根据条件筛选提交
 */
export interface FilterOptions {
  searchQuery?: string;
  authorFilter?: string;
  dateRange?: [Date, Date] | null;
  commitTypeFilter?: string[];
  reverseOrder?: boolean;
}

export function filterCommits(commits: GitCommit[], options: FilterOptions): GitCommit[] {
  let filtered = [...commits];

  // 搜索筛选（支持 hash、首行摘要、完整提交消息）
  if (options.searchQuery) {
    const query = options.searchQuery.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.message.toLowerCase().includes(query) ||
        c.hash.toLowerCase().includes(query) ||
        (c.full_message && c.full_message.toLowerCase().includes(query))
    );
  }

  // 作者筛选
  if (options.authorFilter) {
    const author = options.authorFilter.toLowerCase();
    filtered = filtered.filter((c) => c.author.toLowerCase().includes(author));
  }

  // 日期筛选
  if (options.dateRange) {
    const [start, end] = options.dateRange;
    filtered = filtered.filter((c) => {
      const date = new Date(c.date);
      return date >= start && date <= end;
    });
  }

  // 提交类型筛选
  if (options.commitTypeFilter && options.commitTypeFilter.length > 0) {
    filtered = filtered.filter((c) => {
      const message = c.message.trim();
      // 提取提交类型 (格式: type: message 或 type(scope): message)
      const match = message.match(/^(\w+)(\(.+?\))?:/);
      if (match) {
        const type = match[1].toLowerCase();
        return options.commitTypeFilter!.includes(type);
      }
      // 如果没有匹配到类型，当选择了 "other" 时显示
      return options.commitTypeFilter!.includes("other");
    });
  }

  // 倒序排列
  if (options.reverseOrder) {
    filtered = [...filtered].reverse();
  }

  return filtered;
}