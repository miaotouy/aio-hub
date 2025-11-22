<template>
  <transition name="fade">
    <div
      v-if="visible"
      class="video-viewer-overlay"
      @click.self="handleClose"
      @keydown.esc="handleClose"
      tabindex="0"
      ref="overlayRef"
    >
      <div class="video-viewer-container">
        <!-- 顶部栏 -->
        <div class="viewer-header">
          <span class="viewer-title">{{ title || "视频预览" }}</span>
          <button class="close-btn" @click="handleClose">
            <X />
          </button>
        </div>

        <!-- 播放器区域 -->
        <div class="player-wrapper">
          <VideoPlayer v-if="visible" :src="src" :autoplay="true" :poster="poster" />
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { X } from "lucide-vue-next";
import VideoPlayer from "./VideoPlayer.vue";

const props = defineProps<{
  visible: boolean;
  src: string;
  title?: string;
  poster?: string;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "close"): void;
}>();

const overlayRef = ref<HTMLElement | null>(null);

function handleClose() {
  emit("update:visible", false);
  emit("close");
}

// 自动聚焦以便接收键盘事件
watch(
  () => props.visible,
  async (val) => {
    if (val) {
      await nextTick();
      overlayRef.value?.focus();
    }
  }
);

// 全局 ESC 监听作为备份，防止 focus 丢失
function handleGlobalKeydown(e: KeyboardEvent) {
  if (props.visible && e.key === "Escape") {
    handleClose();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
});
</script>

<style scoped>
.video-viewer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(10px);
  z-index: 2000; /* 确保高于大多数元素 */
  display: flex;
  justify-content: center;
  align-items: center;
  outline: none;
}

.video-viewer-container {
  width: 90%;
  height: 90%;
  max-width: 1280px;
  display: flex;
  flex-direction: column;
  background: transparent;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.viewer-header {
  height: 48px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  flex-shrink: 0;
}

.viewer-title {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  color: white;
  background: rgba(255, 255, 255, 0.2);
}

.close-btn svg {
  width: 20px;
  height: 20px;
}

.player-wrapper {
  flex: 1;
  min-height: 0;
  background: black;
  position: relative;
}

/* Transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
