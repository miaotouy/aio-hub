<script setup lang="ts">
import { onMounted } from "vue";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useImageViewer } from "@/composables/useImageViewer";
import { useVideoViewer } from "@/composables/useVideoViewer";
import ImageViewer from "@/components/common/ImageViewer.vue";
import VideoViewer from "@/components/common/VideoViewer.vue";
import ModelSelectDialog from "@/components/common/ModelSelectDialog.vue";
import SyncServiceProvider from "@/components/SyncServiceProvider.vue";

// 全局图片查看器状态
const imageViewer = useImageViewer();
// 全局视频查看器状态
const videoViewer = useVideoViewer();

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
    :poster="videoViewer.poster?.value"
    @close="videoViewer.close"
  />

  <!-- 插槽，用于渲染应用主体内容 -->
  <slot></slot>
</template>
