import { ref, onUnmounted, type Ref } from 'vue'
import * as echarts from 'echarts'
import type { GitCommit } from '../types'

export function useCharts(filteredCommits: Ref<GitCommit[]>) {
  // 图表 DOM 引用
  const frequencyChart = ref<HTMLDivElement>()
  const contributorChart = ref<HTMLDivElement>()
  const heatmapChart = ref<HTMLDivElement>()

  // ResizeObserver 实例
  let resizeObserver: ResizeObserver | null = null

  /**
   * 绘制提交频率图表
   */
  function drawFrequencyChart() {
    if (!frequencyChart.value) return

    // 检查 DOM 尺寸
    if (frequencyChart.value.clientWidth === 0 || frequencyChart.value.clientHeight === 0) {
      console.warn('Frequency chart container has zero size')
      return
    }

    // 获取或创建图表实例
    let chart = echarts.getInstanceByDom(frequencyChart.value)
    if (!chart) {
      chart = echarts.init(frequencyChart.value)
    }
    const dates = filteredCommits.value.map((c) => c.date.split('T')[0])
    const dateCounts = dates.reduce(
      (acc, date) => {
        acc[date] = (acc[date] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    const option = {
      xAxis: {
        type: 'category',
        data: Object.keys(dateCounts),
      },
      yAxis: {
        type: 'value',
      },
      series: [
        {
          data: Object.values(dateCounts),
          type: 'line',
          smooth: true,
          areaStyle: {},
        },
      ],
      tooltip: {
        trigger: 'axis',
      },
    }

    chart.setOption(option)
  }

  /**
   * 绘制贡献者统计图表
   */
  function drawContributorChart() {
    if (!contributorChart.value) return

    // 检查 DOM 尺寸
    if (contributorChart.value.clientWidth === 0 || contributorChart.value.clientHeight === 0) {
      console.warn('Contributor chart container has zero size')
      return
    }

    // 获取或创建图表实例
    let chart = echarts.getInstanceByDom(contributorChart.value)
    if (!chart) {
      chart = echarts.init(contributorChart.value)
    }
    const authorCounts = filteredCommits.value.reduce(
      (acc, c) => {
        acc[c.author] = (acc[c.author] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    const data = Object.entries(authorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }))

    const option = {
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          data,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
      },
    }

    chart.setOption(option)
  }

  /**
   * 绘制提交热力图
   */
  function drawHeatmapChart() {
    if (!heatmapChart.value) return

    // 检查 DOM 尺寸
    if (heatmapChart.value.clientWidth === 0 || heatmapChart.value.clientHeight === 0) {
      console.warn('Heatmap chart container has zero size')
      return
    }

    // 获取或创建图表实例
    let chart = echarts.getInstanceByDom(heatmapChart.value)
    if (!chart) {
      chart = echarts.init(heatmapChart.value)
    }

    // 生成热力图数据
    const heatmapData: Array<[number, number, number]> = []
    const dayMap = new Map<string, number>()

    filteredCommits.value.forEach((c) => {
      const date = new Date(c.date)
      const day = date.getDay()
      const hour = date.getHours()
      const key = `${day}-${hour}`
      dayMap.set(key, (dayMap.get(key) || 0) + 1)
    })

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const count = dayMap.get(`${day}-${hour}`) || 0
        heatmapData.push([hour, day, count])
      }
    }

    const option = {
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => `${i}:00`),
      },
      yAxis: {
        type: 'category',
        data: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
      },
      visualMap: {
        min: 0,
        max: Math.max(...heatmapData.map((d) => d[2])),
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
      },
      series: [
        {
          type: 'heatmap',
          data: heatmapData,
          label: {
            show: true,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
      tooltip: {
        position: 'top',
        formatter: (params: any) => {
          return `${params.value[2]} 次提交`
        },
      },
    }

    chart.setOption(option)
  }

  /**
   * 更新所有图表
   */
  function updateCharts() {
    drawFrequencyChart()
    drawContributorChart()
    drawHeatmapChart()
  }

  /**
   * 调整图表大小
   */
  function resizeCharts() {
    if (frequencyChart.value) {
      const chart = echarts.getInstanceByDom(frequencyChart.value)
      chart?.resize()
    }
    if (contributorChart.value) {
      const chart = echarts.getInstanceByDom(contributorChart.value)
      chart?.resize()
    }
    if (heatmapChart.value) {
      const chart = echarts.getInstanceByDom(heatmapChart.value)
      chart?.resize()
    }
  }

  /**
   * 设置 ResizeObserver 监听
   */
  function setupResizeObserver(mainContentElement: Element | null) {
    if (!mainContentElement || !window.ResizeObserver) return

    resizeObserver = new ResizeObserver(() => {
      // 延迟调整以确保容器尺寸已更新
      setTimeout(() => {
        resizeCharts()
      }, 100)
    })

    resizeObserver.observe(mainContentElement)
  }

  /**
   * 清理所有图表实例
   */
  function disposeCharts() {
    if (frequencyChart.value) {
      echarts.getInstanceByDom(frequencyChart.value)?.dispose()
    }
    if (contributorChart.value) {
      echarts.getInstanceByDom(contributorChart.value)?.dispose()
    }
    if (heatmapChart.value) {
      echarts.getInstanceByDom(heatmapChart.value)?.dispose()
    }
  }

  // 组件卸载时清理
  onUnmounted(() => {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    disposeCharts()
  })

  return {
    // DOM 引用
    frequencyChart,
    contributorChart,
    heatmapChart,

    // 方法
    updateCharts,
    resizeCharts,
    setupResizeObserver,
  }
}