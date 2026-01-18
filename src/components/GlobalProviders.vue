<script setup lang="ts">
import { onMounted } from "vue";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useImageViewer } from "@/composables/useImageViewer";
import { useVideoViewer } from "@/composables/useVideoViewer";
import { useAudioViewer } from "@/composables/useAudioViewer";
import { useTranscriptionViewer } from "@/composables/useTranscriptionViewer";
import ImageViewer from "@/components/common/ImageViewer.vue";
import VideoViewer from "@/components/common/VideoViewer.vue";
import AudioViewer from "@/components/common/AudioViewer.vue";
import TranscriptionDialog from "@/components/common/TranscriptionDialog.vue";
import ModelSelectDialog from "@/components/common/ModelSelectDialog.vue";
import SyncServiceProvider from "@/components/SyncServiceProvider.vue";
import NotificationCenter from "@/components/notification/NotificationCenter.vue";

// 全局图片查看器状态
const imageViewer = useImageViewer();
// 全局视频查看器状态
const videoViewer = useVideoViewer();
// 全局音频查看器状态
const audioViewer = useAudioViewer();
// 全局转写查看器状态
const transcriptionViewer = useTranscriptionViewer();

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
  <ModelSelectDialog />

  <!-- 全局视频预览器 -->
  <VideoViewer
    v-model:visible="videoViewer.visible.value"
    :src="videoViewer.src.value"
    :title="videoViewer.title.value"
    :poster="videoViewer.poster.value"
    @close="videoViewer.close"
  />

  <!-- 全局音频预览器 -->
  <AudioViewer
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
    v-if="transcriptionViewer.state.value.visible && transcriptionViewer.state.value.asset"
    :model-value="transcriptionViewer.state.value.visible"
    :asset="transcriptionViewer.state.value.asset"
    :initial-content="transcriptionViewer.state.value.initialContent"
    :show-regenerate="transcriptionViewer.state.value.showRegenerate"
    :previous-config="transcriptionViewer.state.value.previousConfig"
    @update:model-value="transcriptionViewer.close()"
    @save="transcriptionViewer.state.value.onSave"
    @regenerate="transcriptionViewer.state.value.onRegenerate"
  />

  <!-- 全局消息通知中心 -->
  <NotificationCenter />

  <!-- 插槽，用于渲染应用主体内容 -->
  <slot></slot>
</template>
