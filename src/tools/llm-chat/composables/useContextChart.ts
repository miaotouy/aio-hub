import { ref, onUnmounted, watch, type Ref } from 'vue';
import { useDark } from '@vueuse/core';
import * as echarts from 'echarts';
import type { ContextPreviewData } from '../types/context';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/context-chart');

export type ChartMode = 'token' | 'char';

export function useContextChart(contextData: ContextPreviewData, mode: Ref<ChartMode> = ref('token')) {
  // 图表 DOM 引用
  const chartRef = ref<HTMLDivElement>();

  // ResizeObserver 实例
  let resizeObserver: ResizeObserver | null = null;

  // 主题检测
  const isDark = useDark();

  /**
   * 获取当前主题的颜色配置
   */
  function getThemeColors() {
    const root = getComputedStyle(document.documentElement);
    return {
      textColor: root.getPropertyValue('--el-text-color-primary').trim() || '#303133',
      textColorLight: root.getPropertyValue('--el-text-color-secondary').trim() || '#909399',
      borderColor: root.getPropertyValue('--el-border-color').trim() || '#dcdfe6',
      primaryColor: root.getPropertyValue('--el-color-primary').trim() || '#409eff',
      successColor: root.getPropertyValue('--el-color-success').trim() || '#67c23a',
      warningColor: root.getPropertyValue('--el-color-warning').trim() || '#e6a23c',
      dangerColor: root.getPropertyValue('--el-color-danger').trim() || '#f56c6c',
      bgColor: root.getPropertyValue('--el-bg-color').trim() || '#ffffff',
      containerBg: root.getPropertyValue('--el-fill-color-light').trim() || '#f5f7fa',
    };
  }

  /**
   * 绘制内容占比堆叠柱状图
   */
  function drawChart() {
    if (!chartRef.value) {
      logger.warn('图表容器未准备好');
      return;
    }

    // 检查 DOM 尺寸
    if (chartRef.value.clientWidth === 0 || chartRef.value.clientHeight === 0) {
      logger.warn('图表容器尺寸为零，无法渲染', {
        width: chartRef.value.clientWidth,
        height: chartRef.value.clientHeight,
      });
      return;
    }

    // 获取或创建图表实例
    let chart = echarts.getInstanceByDom(chartRef.value);
    if (!chart) {
      chart = echarts.init(chartRef.value);
    }

    const colors = getThemeColors();
    const stats = contextData.statistics;
    const isTokenMode = mode.value === 'token';
    const unit = isTokenMode ? 'tokens' : '字符';

    // 准备数据（按上下文构建顺序）- 根据模式选择数据源
    const categories = ['上下文内容构成'];
    const presetMessagesData = isTokenMode
      ? (stats.presetMessagesTokenCount && stats.presetMessagesTokenCount > 0 ? [stats.presetMessagesTokenCount] : [0])
      : (stats.presetMessagesCharCount > 0 ? [stats.presetMessagesCharCount] : [0]);
    const chatHistoryData = isTokenMode
      ? (stats.chatHistoryTokenCount && stats.chatHistoryTokenCount > 0 ? [stats.chatHistoryTokenCount] : [0])
      : (stats.chatHistoryCharCount > 0 ? [stats.chatHistoryCharCount] : [0]);
    const postProcessingData = isTokenMode
      ? (stats.postProcessingTokenCount && stats.postProcessingTokenCount > 0 ? [stats.postProcessingTokenCount] : [0])
      : (stats.postProcessingCharCount && stats.postProcessingCharCount > 0 ? [stats.postProcessingCharCount] : [0]);

    // 计算每个系列在堆叠中的位置，用于正确设置圆角
    const seriesData = [
      { name: '预设消息', data: presetMessagesData, color: colors.warningColor },
      { name: '会话历史', data: chatHistoryData, color: colors.successColor },
      { name: '后处理消耗', data: postProcessingData, color: colors.dangerColor }
    ];

    // 过滤出有数据的系列
    const activeSeries = seriesData.filter(item => item.data[0] > 0);
    
    // 为每个系列计算正确的圆角（横向柱状图）
    // borderRadius 格式: [左上, 右上, 右下, 左下]
    const getBorderRadius = (index: number, total: number) => {
      if (total === 1) {
        // 只有一个系列，四个角都有圆角
        return [4, 4, 4, 4];
      }
      if (index === 0) {
        // 第一个系列（最左边），左侧圆角
        return [4, 0, 0, 4];
      }
      if (index === total - 1) {
        // 最后一个系列（最右边），右侧圆角
        return [0, 4, 4, 0];
      }
      // 中间的系列，没有圆角
      return [0, 0, 0, 0];
    };

    const option = {
      backgroundColor: 'transparent',
      textStyle: {
        color: colors.textColor,
      },
      title: {
        text: `上下文内容分布 (${isTokenMode ? 'Token' : '字符'}占比)`,
        left: 'center',
        top: 20,
        textStyle: {
          color: colors.textColor,
          fontSize: 18,
          fontWeight: 500,
        },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'none'
        },
        formatter: (params: any) => {
          let result = `${params[0].axisValue}<br/>`;
          let total = 0;
          params.forEach((item: any) => {
            total += item.value;
          });
          params.forEach((item: any) => {
            const percent = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0';
            // 使用纯色的自定义marker（从seriesData中获取原始颜色）
            const seriesColor = seriesData.find(s => s.name === item.seriesName)?.color || item.color;
            const customMarker = `<span style="display:inline-block;margin-right:4px;border-radius:50%;width:10px;height:10px;background-color:${seriesColor};"></span>`;
            result += `${customMarker}${item.seriesName}: ${item.value.toLocaleString()} ${unit} (${percent}%)<br/>`;
          });
          result += `<strong>总计: ${total.toLocaleString()} ${unit}</strong>`;
          return result;
        },
        backgroundColor: colors.containerBg,
        borderColor: colors.borderColor,
        textStyle: {
          color: colors.textColor,
        },
      },
      legend: {
        data: activeSeries.map(item => item.name),
        top: 60,
        textStyle: {
          color: colors.textColor,
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: 110,
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        axisLabel: {
          color: colors.textColorLight,
          formatter: (value: number) => {
            if (value >= 1000) {
              return (value / 1000).toFixed(1) + 'k';
            }
            return value;
          },
        },
        axisLine: {
          lineStyle: {
            color: colors.borderColor,
          },
        },
        splitLine: {
          lineStyle: {
            color: colors.borderColor,
            type: 'dashed',
          },
        },
      },
      yAxis: {
        type: 'category',
        data: categories,
        axisLabel: {
          color: colors.textColor,
        },
        axisLine: {
          lineStyle: {
            color: colors.borderColor,
          },
        },
      },
      series: activeSeries.map((item, index) => ({
        name: item.name,
        type: 'bar',
        stack: 'total',
        data: item.data,
        itemStyle: {
          // 半透明背景 + 描边效果（参考 Element Plus 按钮样式）
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${item.color}26` }, // 15% 不透明度
              { offset: 1, color: `${item.color}1a` }  // 10% 不透明度
            ]
          },
          borderColor: item.color,
          borderWidth: 2,
          borderRadius: getBorderRadius(index, activeSeries.length),
        },
        label: {
          show: true,
          position: 'inside',
          formatter: (params: any) => {
            if (params.value === 0) return '';
            return params.value.toLocaleString();
          },
          color: item.color, // 使用主题色而不是白色
          fontWeight: 600,
        },
        emphasis: {
          focus: 'series',
          itemStyle: {
            // 悬停时增加不透明度
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${item.color}40` }, // 25% 不透明度
                { offset: 1, color: `${item.color}33` }  // 20% 不透明度
              ]
            },
            borderColor: item.color,
            borderWidth: 2,
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: `${item.color}80`, // 使用对应颜色的阴影
          },
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold',
            color: item.color,
          },
        },
        animationDelay: (idx: number) => idx * 100 + index * 100,
      })),
      animationEasing: 'elasticOut' as const,
      animationEasingUpdate: 'elasticOut' as const,
      animationDuration: 1000,
      animationDurationUpdate: 500,
    };

    chart.setOption(option, { notMerge: true });

    logger.debug('图表渲染完成', {
      totalChars: stats.totalCharCount,
      presetMessages: stats.presetMessagesCharCount,
      chatHistory: stats.chatHistoryCharCount,
    });
  }

  /**
   * 调整图表大小
   */
  function resizeChart() {
    if (chartRef.value) {
      const chart = echarts.getInstanceByDom(chartRef.value);
      chart?.resize();
    }
  }

  /**
   * 设置 ResizeObserver 监听
   */
  function setupResizeObserver(containerElement: Element | null) {
    if (!containerElement || !window.ResizeObserver) {
      logger.warn('ResizeObserver 不可用或容器元素为空');
      return;
    }

    resizeObserver = new ResizeObserver(() => {
      // 延迟调整以确保容器尺寸已更新
      setTimeout(() => {
        if (chartRef.value && chartRef.value.clientWidth > 0 && chartRef.value.clientHeight > 0) {
          // 如果容器已经有有效尺寸，尝试绘制图表
          drawChart();
        }
      }, 100);
    });

    resizeObserver.observe(containerElement);
    logger.debug('ResizeObserver 已设置');
  }

  /**
   * 清理图表实例
   */
  function disposeChart() {
    if (chartRef.value) {
      echarts.getInstanceByDom(chartRef.value)?.dispose();
    }
  }

  // 监听主题变化，重新绘制图表
  watch(isDark, () => {
    // 添加延迟确保 CSS 变量已更新
    setTimeout(() => {
      drawChart();
    }, 50);
  });

  // 监听模式变化，重新绘制图表
  watch(mode, () => {
    drawChart();
  });

  // 组件卸载时清理
  onUnmounted(() => {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    disposeChart();
  });

  return {
    chartRef,
    drawChart,
    resizeChart,
    setupResizeObserver,
  };
}