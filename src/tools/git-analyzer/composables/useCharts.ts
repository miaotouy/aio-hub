import { ref, onUnmounted, watch, type Ref } from 'vue'
import { useDark } from '@vueuse/core'
import * as echarts from 'echarts'
import type { GitCommit } from '../types'

export function useCharts(filteredCommits: Ref<GitCommit[]>) {
  // 图表 DOM 引用
  const frequencyChart = ref<HTMLDivElement>()
  const contributorChart = ref<HTMLDivElement>()
  const heatmapChart = ref<HTMLDivElement>()

  // ResizeObserver 实例
  let resizeObserver: ResizeObserver | null = null

  // 主题检测
  const isDark = useDark()

  /**
   * 获取当前主题的颜色配置
   */
  function getThemeColors() {
    const root = getComputedStyle(document.documentElement)
    return {
      textColor: root.getPropertyValue('--text-color').trim(),
      textColorLight: root.getPropertyValue('--text-color-light').trim(),
      borderColor: root.getPropertyValue('--border-color').trim(),
      primaryColor: root.getPropertyValue('--primary-color').trim(),
      bgColor: root.getPropertyValue('--bg-color').trim(),
      containerBg: root.getPropertyValue('--container-bg').trim(),
    }
  }

  /**
   * 获取通用图表配置
   */
  function getCommonChartOptions() {
    const colors = getThemeColors()
    return {
      textStyle: {
        color: colors.textColor,
      },
      backgroundColor: 'transparent',
      grid: {
        borderColor: colors.borderColor,
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
    }
  }

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

    const colors = getThemeColors()
    const commonOptions = getCommonChartOptions()

    const option = {
      ...commonOptions,
      xAxis: {
        type: 'category',
        data: Object.keys(dateCounts),
        axisLine: {
          lineStyle: {
            color: colors.borderColor,
          },
        },
        axisLabel: {
          color: colors.textColorLight,
        },
      },
      yAxis: {
        type: 'value',
        axisLine: {
          lineStyle: {
            color: colors.borderColor,
          },
        },
        axisLabel: {
          color: colors.textColorLight,
        },
        splitLine: {
          lineStyle: {
            color: colors.borderColor,
          },
        },
      },
      series: [
        {
          data: Object.values(dateCounts),
          type: 'line',
          smooth: true,
          itemStyle: {
            color: colors.primaryColor,
          },
          lineStyle: {
            color: colors.primaryColor,
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                {
                  offset: 0,
                  color: colors.primaryColor + '80', // 50% 透明度
                },
                {
                  offset: 1,
                  color: colors.primaryColor + '10', // 6% 透明度
                },
              ],
            },
          },
        },
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.containerBg,
        borderColor: colors.borderColor,
        textStyle: {
          color: colors.textColor,
        },
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

    const colors = getThemeColors()
    const commonOptions = getCommonChartOptions()

    const option = {
      ...commonOptions,
      color: [
        colors.primaryColor,
        '#5470c6',
        '#91cc75',
        '#fac858',
        '#ee6666',
        '#73c0de',
        '#3ba272',
        '#fc8452',
        '#9a60b4',
        '#ea7ccc',
      ],
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          data,
          label: {
            color: colors.textColor,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: isDark.value ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
        backgroundColor: colors.containerBg,
        borderColor: colors.borderColor,
        textStyle: {
          color: colors.textColor,
        },
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

    const colors = getThemeColors()
    const commonOptions = getCommonChartOptions()

    const option = {
      ...commonOptions,
      grid: {
        ...commonOptions.grid,
        bottom: '80px', // 为 visualMap 留出足够空间
      },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        axisLine: {
          lineStyle: {
            color: colors.borderColor,
          },
        },
        axisLabel: {
          color: colors.textColorLight,
        },
      },
      yAxis: {
        type: 'category',
        data: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
        axisLine: {
          lineStyle: {
            color: colors.borderColor,
          },
        },
        axisLabel: {
          color: colors.textColorLight,
        },
      },
      visualMap: {
        min: 0,
        max: Math.max(...heatmapData.map((d) => d[2])),
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '20px',
        textStyle: {
          color: colors.textColor,
        },
        inRange: {
          color: isDark.value
            ? ['#1a1a1a', colors.primaryColor]
            : ['#f0f9ff', colors.primaryColor],
        },
      },
      series: [
        {
          type: 'heatmap',
          data: heatmapData,
          label: {
            show: true,
            color: colors.textColor,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: isDark.value ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
      tooltip: {
        position: 'top',
        formatter: (params: any) => {
          return `${params.value[2]} 次提交`
        },
        backgroundColor: colors.containerBg,
        borderColor: colors.borderColor,
        textStyle: {
          color: colors.textColor,
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

  // 监听主题变化，重新绘制图表
  watch(isDark, () => {
    updateCharts()
  })

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