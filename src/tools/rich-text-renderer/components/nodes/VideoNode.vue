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
    class="video-node-container"
    :class="{ 'is-streaming': isStreaming }"
    :title="title"
  >
    <VideoPlayer
      :src="resolvedSrc"
      :title="displayTitle"
      :poster="poster"
      :autoplay="autoplay"
      :loop="loop"
      :muted="muted"
      class="rich-text-video-player"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import VideoPlayer from "@/components/common/VideoPlayer.vue";
import { RICH_TEXT_CONTEXT_KEY, type RichTextContext } from "../../types";
import { resolveLocalPath } from "../../utils/path-utils";

const props = defineProps<{
  nodeId: string;
  src: string;
  title?: string;
  poster?: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
}>();

const context = inject<RichTextContext | null>(RICH_TEXT_CONTEXT_KEY, null);
const isStreaming = computed(() => context?.isStreaming?.value ?? false);

// 过滤掉默认的 "video" 标题
const displayTitle = computed(() => {
  if (props.title?.toLowerCase() === "video") return undefined;
  return props.title;
});

// 解析资源链接
const resolvedSrc = computed(() => {
  let src = props.src;

  // 1. 优先处理 Agent 内部资产 (Chat 专用钩子)
  if (context?.resolveAsset) {
    src = context.resolveAsset(props.src);
  }

  // 2. 处理本地路径或特殊协议
  return resolveLocalPath(src);
});
</script>

<style scoped>
.video-node-container {
  margin: 12px 0;
  max-width: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  background-color: #000;
  /* 初始高度，防止布局抖动 */
  aspect-ratio: 16 / 9;
}

.rich-text-video-player {
  width: 100%;
  height: 100%;
}

.is-streaming {
  /* 流式传输时的微调 */
  opacity: 0.9;
}
</style>
