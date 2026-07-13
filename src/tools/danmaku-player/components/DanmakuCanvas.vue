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
  <canvas ref="canvasRef" class="danmaku-canvas"></canvas>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useResizeObserver } from "@vueuse/core";

const canvasRef = ref<HTMLCanvasElement | null>(null);

// 直接观察 canvas 自身的 CSS 渲染尺寸，同步到 canvas 分辨率属性
useResizeObserver(canvasRef, (entries) => {
  const entry = entries[0];
  if (entry && canvasRef.value) {
    const { width, height } = entry.contentRect;
    canvasRef.value.width = Math.round(width);
    canvasRef.value.height = Math.round(height);
  }
});

defineExpose({
  canvasRef,
});
</script>

<style scoped>
.danmaku-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 15; /* 位于视频之上，控制栏之下 */
  /* 独立 GPU 合成层，避免与视频解码争抢主线程合成 */
  will-change: transform;
  transform: translateZ(0);
  contain: strict;
}
</style>
