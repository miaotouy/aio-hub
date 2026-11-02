<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div
    class="commit-graph-track"
    :style="{ width: trackWidth + 'px', minWidth: trackWidth + 'px' }"
  >
    <svg
      class="graph-svg"
      :width="trackWidth"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g v-if="graphItem">
        <!-- 穿透本行的其他活动泳道垂直线 -->
        <line
          v-for="pt in graphItem.passThroughLanes"
          :key="'pt-' + pt.lane"
          :x1="laneX(pt.lane)"
          y1="0"
          :x2="laneX(pt.lane)"
          y2="100%"
          :stroke="pt.color"
          stroke-width="2"
          stroke-linecap="round"
        />

        <!-- 上方伸入当前节点的垂直线 -->
        <line
          v-if="graphItem.hasIncoming"
          :x1="laneX(graphItem.lane)"
          y1="0"
          :x2="laneX(graphItem.lane)"
          :y2="nodeY"
          :stroke="graphItem.color"
          stroke-width="2"
          stroke-linecap="round"
        />

        <!-- 向下延伸的出线连接 -->
        <template
          v-for="(conn, idx) in graphItem.outgoingConnections"
          :key="'out-' + idx"
        >
          <!-- 直连同一个泳道 -->
          <line
            v-if="conn.fromLane === conn.toLane"
            :x1="laneX(conn.fromLane)"
            :y1="nodeY"
            :x2="laneX(conn.toLane)"
            y2="100%"
            :stroke="conn.color"
            stroke-width="2"
            stroke-linecap="round"
          />

          <!-- 弯折到另一个泳道（平滑三次贝塞尔曲线 + 后续垂直线） -->
          <template v-else>
            <path
              :d="buildCurvePath(conn.fromLane, conn.toLane)"
              fill="none"
              :stroke="conn.color"
              stroke-width="2"
              stroke-linecap="round"
            />
            <line
              :x1="laneX(conn.toLane)"
              :y1="bendEndY"
              :x2="laneX(conn.toLane)"
              y2="100%"
              :stroke="conn.color"
              stroke-width="2"
              stroke-linecap="round"
            />
          </template>
        </template>

        <!-- 当前提交节点 -->
        <!-- 合并提交：内外双重环圈 -->
        <g v-if="graphItem.isMerge" class="node-group merge">
          <circle
            :cx="laneX(graphItem.lane)"
            :cy="nodeY"
            r="5.5"
            :stroke="graphItem.color"
            stroke-width="2"
            class="node-ring-outer"
          />
          <circle
            :cx="laneX(graphItem.lane)"
            :cy="nodeY"
            r="2.2"
            :fill="graphItem.color"
            class="node-dot-inner"
          />
        </g>

        <!-- 普通提交：实心圆点 -->
        <g v-else class="node-group normal">
          <circle
            :cx="laneX(graphItem.lane)"
            :cy="nodeY"
            r="3.5"
            :fill="graphItem.color"
            class="node-dot-solid"
          />
        </g>
      </g>

      <!-- 降级兜底：无拓扑数据时居中单个小圆点 -->
      <g v-else class="node-group fallback">
        <circle
          :cx="laneWidth / 2"
          :cy="nodeY"
          r="3.5"
          fill="var(--el-color-primary)"
        />
        <line
          :x1="laneWidth / 2"
          :y1="nodeY"
          :x2="laneWidth / 2"
          y2="100%"
          stroke="var(--control-border-color)"
          stroke-width="2"
        />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CommitGraphItem } from "../utils/gitTimelineGraph";

interface Props {
  graphItem?: CommitGraphItem;
  maxLanes?: number;
  laneWidth?: number;
  nodeY?: number;
}

const props = withDefaults(defineProps<Props>(), {
  graphItem: undefined,
  maxLanes: 1,
  laneWidth: 13,
  nodeY: 10,
});

const bendHeight = 16;
const bendEndY = computed(() => props.nodeY + bendHeight);

const trackWidth = computed(() => {
  // 像 VSCode 一样按当前行实际占用的泳道数计算宽度，使消息紧凑对齐
  const lanes = Math.max(1, props.graphItem?.rowLanes ?? props.maxLanes ?? 1);
  return lanes * props.laneWidth;
});

const laneX = (lane: number): number => {
  return lane * props.laneWidth + props.laneWidth / 2;
};

const buildCurvePath = (fromLane: number, toLane: number): string => {
  const x1 = laneX(fromLane);
  const x2 = laneX(toLane);
  const y1 = props.nodeY;
  const y2 = bendEndY.value;
  const cp1Y = y1 + bendHeight * 0.55;
  const cp2Y = y2 - bendHeight * 0.45;
  return `M ${x1} ${y1} C ${x1} ${cp1Y}, ${x2} ${cp2Y}, ${x2} ${y2}`;
};
</script>

<style scoped>
.commit-graph-track {
  position: relative;
  align-self: stretch;
  flex-shrink: 0;
}

.graph-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

.node-ring-outer {
  fill: var(--container-bg, #18181b);
  transition: transform 0.15s ease;
}

.node-dot-solid,
.node-dot-inner {
  transition:
    transform 0.15s ease,
    filter 0.15s ease;
}

:deep(.commit-node:hover) .node-dot-solid,
:deep(.commit-node.selected) .node-dot-solid {
  filter: drop-shadow(0 0 3px currentColor);
}

:deep(.commit-node:hover) .node-ring-outer,
:deep(.commit-node.selected) .node-ring-outer {
  filter: drop-shadow(0 0 3px currentColor);
}
</style>
