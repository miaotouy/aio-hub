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

<script setup lang="ts">
import { defineAsyncComponent, onMounted } from "vue";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useImageViewer } from "@/composables/useImageViewer";
import { useVideoViewer } from "@/composables/useVideoViewer";
import { useAudioViewer } from "@/composables/useAudioViewer";
import { useTranscriptionViewer } from "@/composables/useTranscriptionViewer";
import { useModelSelectDialog } from "@/composables/useModelSelectDialog";
import { useGenerationInfoViewer } from "@/tools/media-generator/composables/useGenerationInfoViewer";
import SyncServiceProvider from "@/components/SyncServiceProvider.vue";
import NotificationCenter from "@/components/notification/NotificationCenter.vue";

const ImageViewer = defineAsyncComponent(
  () => import("@/components/common/ImageViewer.vue")
);
const VideoViewer = defineAsyncComponent(
  () => import("@/components/common/VideoViewer.vue")
);
const AudioViewer = defineAsyncComponent(
  () => import("@/components/common/AudioViewer.vue")
);
const TranscriptionDialog = defineAsyncComponent(
  () => import("@/components/common/TranscriptionDialog.vue")
);
const GenerationInfoDialog = defineAsyncComponent(
  () => import("@/tools/media-generator/components/GenerationInfoDialog.vue")
);
const ModelSelectDialog = defineAsyncComponent(
  () => import("@/components/common/ModelSelectDialog.vue")
);

// 全局图片查看器状态
const imageViewer = useImageViewer();
// 全局视频查看器状态
const videoViewer = useVideoViewer();
// 全局音频查看器状态
const audioViewer = useAudioViewer();
// 全局转写查看器状态
const transcriptionViewer = useTranscriptionViewer();
// 全局模型选择弹窗状态
const modelSelectDialog = useModelSelectDialog();
// 全局媒体生成参数查看器
const generationInfoViewer = useGenerationInfoViewer();

onMounted(() => {
  // 初始化跨窗口通信总线
  // 这是一个单例，多次调用也是安全的
  const { initializeSyncBus } = useWindowSyncBus();
  initializeSyncBus();
});
</script>

<template>
  <!-- 全局同步服务提供者 -->
  <SyncServiceProvider />

  <!-- 全局图片查看器 -->
  <ImageViewer
    v-if="imageViewer.state.value.visible"
    :images="imageViewer.state.value.images"
    :initial-index="imageViewer.state.value.currentIndex"
    :options="imageViewer.state.value.options"
    @close="imageViewer.hide()"
    @change="(index) => (imageViewer.state.value.currentIndex = index)"
  />

  <!-- 全局模型选择弹窗 -->
  <ModelSelectDialog v-if="modelSelectDialog.isDialogVisible.value" />

  <!-- 全局视频预览器 -->
  <VideoViewer
    v-if="videoViewer.visible.value"
    v-model:visible="videoViewer.visible.value"
    :src="videoViewer.src.value"
    :title="videoViewer.title.value"
    :poster="videoViewer.poster.value"
    @close="videoViewer.close"
  />

  <!-- 全局音频预览器 -->
  <AudioViewer
    v-if="audioViewer.visible.value"
    v-model:visible="audioViewer.visible.value"
    :src="audioViewer.src.value"
    :title="audioViewer.title.value"
    :poster="audioViewer.poster.value"
    :artist="audioViewer.artist.value"
    :playlist="audioViewer.playlist.value"
    :initial-index="audioViewer.initialIndex.value"
    @close="audioViewer.close"
  />

  <!-- 全局转写编辑器 -->
  <TranscriptionDialog
    v-if="
      transcriptionViewer.state.value.visible &&
      transcriptionViewer.state.value.asset
    "
    :model-value="transcriptionViewer.state.value.visible"
    :asset="transcriptionViewer.state.value.asset"
    :initial-content="transcriptionViewer.state.value.initialContent"
    :show-regenerate="transcriptionViewer.state.value.showRegenerate"
    :previous-config="transcriptionViewer.state.value.previousConfig"
    @update:model-value="transcriptionViewer.close()"
    @save="transcriptionViewer.state.value.onSave"
    @regenerate="transcriptionViewer.state.value.onRegenerate"
    @delete="transcriptionViewer.state.value.onDelete"
  />

  <!-- 全局媒体生成参数查看器 -->
  <GenerationInfoDialog
    v-if="generationInfoViewer.visible.value"
    v-model="generationInfoViewer.visible.value"
    :asset="generationInfoViewer.currentAsset.value"
    :data="generationInfoViewer.generationData.value"
  />

  <!-- 全局消息通知中心 -->
  <NotificationCenter />

  <!-- 插槽，用于渲染应用主体内容 -->
  <slot></slot>
</template>
