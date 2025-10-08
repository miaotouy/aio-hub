/**
 * Git 数据处理器
 * 提供一系列纯函数，用于从原始 GitCommit 数组中派生出各类统计数据
 */

import type { GitCommit } from '../types'

/**
 * 格式化日期
 */
export function formatDate(date: string, format: string): string {
  const d = new Date(date)

  switch (format) {
    case 'iso':
      return d.toISOString()
    case 'local':
      return d.toLocaleString('zh-CN')
    case 'relative':
      return getRelativeTime(d)
    case 'timestamp':
      return String(d.getTime())
    default:
      return d.toLocaleString('zh-CN')
  }
}

/**
 * 获取相对时间
 */
export function getRelativeTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 周前`
  if (days < 365) return `${Math.floor(days / 30)} 月前`
  return `${Math.floor(days / 365)} 年前`
}

/**
 * HTML 转义函数，防止 XSS
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

/**
 * 获取贡献者统计
 */
export function getContributorStats(commits: GitCommit[]): Array<{ name: string; count: number }> {
  const authorCounts = commits.reduce(
    (acc, c) => {
      acc[c.author] = (acc[c.author] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return Object.entries(authorCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * 生成时间线数据（按日期统计提交数）
 */
export function generateTimelineData(commits: GitCommit[]): Array<{ date: string; count: number }> {
  const dateCounts = commits.reduce(
    (acc, c) => {
      const date = c.date.split('T')[0]
      acc[date] = (acc[date] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return Object.entries(dateCounts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 生成提交热力图数据（按星期几和小时统计）
 */
export function generateHeatmapData(
  commits: GitCommit[]
): Array<{ day: number; hour: number; count: number }> {
  const heatmapData: Array<{ day: number; hour: number; count: number }> = []
  const dayMap = new Map<string, number>()

  commits.forEach((c) => {
    const date = new Date(c.date)
    const day = date.getDay()
    const hour = date.getHours()
    const key = `${day}-${hour}`
    dayMap.set(key, (dayMap.get(key) || 0) + 1)
  })

  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const count = dayMap.get(`${day}-${hour}`) || 0
      if (count > 0) {
        heatmapData.push({ day, hour, count })
      }
    }
  }

  return heatmapData
}

/**
 * 生成完整的图表数据
 */
export function generateChartData(commits: GitCommit[]) {
  return {
    frequency: generateTimelineData(commits),
    contributors: getContributorStats(commits),
    heatmap: generateHeatmapData(commits),
  }
}