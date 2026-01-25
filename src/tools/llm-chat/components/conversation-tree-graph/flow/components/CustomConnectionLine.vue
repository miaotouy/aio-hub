<template>
  <g>
    <path
      class="vue-flow__connection-path"
      :d="path"
      :style="style"
    />
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { type ConnectionLineProps, getBezierPath } from '@vue-flow/core';
import type { ConnectionPreviewState } from '../../../../composables/visualization/useFlowTreeGraph';

interface CustomConnectionLineProps extends ConnectionLineProps {
  connectionState: ConnectionPreviewState;
}

const props = defineProps<CustomConnectionLineProps>();

const path = computed(() => getBezierPath(props)[0]);

const style = computed(() => {
  const state = props.connectionState;
  let strokeColor = 'var(--el-text-color-secondary)';

  // `props.targetNode` 由 vue-flow 提供，当悬停在 handle 上时会有值
  const isOverHandle = !!props.targetNode;

  // 只有在实际连接过程中才改变颜色
  if (state.isConnecting) {
    if (state.targetNodeId) {
      if (state.isTargetValid) {
        // 目标节点本身是合法的，接着判断是否悬停在插槽上
        strokeColor = isOverHandle ? 'var(--el-color-success)' : 'var(--el-color-primary)';
      } else {
        // 目标节点本身就是非法的（比如会造成循环）
        strokeColor = 'var(--el-color-danger)';
      }
    } else {
      // 正在连接但还未悬停到任何目标上，使用一个中间状态颜色
      strokeColor = 'var(--el-color-primary)';
    }
  }

  const isAnimated = state.isConnecting && state.isTargetValid && isOverHandle;
  const isDashed = isAnimated || state.isGrafting;

  return {
    stroke: strokeColor,
    strokeWidth: 3.5,
    strokeDasharray: isDashed ? '6, 6' : 'none',
    animation: isAnimated ? 'connection-flow 1s linear infinite' : 'none',
    fill: 'none',
  };
});
</script>
<style scoped>
@keyframes connection-flow {
  from {
    stroke-dashoffset: 10;
  }
  to {
    stroke-dashoffset: 0;
  }
}
</style>