<template>
  <transition name="fade">
    <div
      v-if="visible"
      class="audio-viewer-overlay"
      @click.self="handleClose"
      @keydown.esc="handleClose"
      tabindex="0"
      ref="overlayRef"
    >
      <div class="audio-viewer-container">
        <!-- 顶部栏 -->
        <div class="viewer-header">
          <span class="viewer-title">{{ displayTitle }}</span>
          <button class="close-btn" @click="handleClose">
            <X />
          </button>
        </div>

        <!-- 播放器区域 -->
        <div class="player-wrapper">
          <AudioPlayer
            v-if="visible"
            :src="src"
            :title="displayTitle"
            :autoplay="true"
            :poster="poster"
            :artist="artist"
          />
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick, onMounted, onBeforeUnmount } from "vue";
import { X } from "lucide-vue-next";
import AudioPlayer from "./AudioPlayer.vue";

const props = defineProps<{
  visible: boolean;
  src: string;
  title?: string;
  poster?: string;
  artist?: string;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "close"): void;
}>();

const overlayRef = ref<HTMLElement | null>(null);

const displayTitle = computed(() => {
  if (props.title) return props.title;
  if (!props.src) return "音频预览";
  try {
    const urlParts = props.src.split(/[/\\]/);
    let name = urlParts.pop() || "";
    name = name.split("?")[0];
    return decodeURIComponent(name) || "音频预览";
  } catch {
    return "音频预览";
  }
});

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
.audio-viewer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(var(--ui-blur));
  z-index: 2000;
  display: flex;
  justify-content: center;
  align-items: center;
  outline: none;
  box-sizing: border-box;
}

.audio-viewer-container {
  width: 90%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  background: transparent;
  border-radius: 12px;
  border: 1px solid var(--border-color);
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
  backdrop-filter: blur(var(--ui-blur));
  color: white;
  flex-shrink: 0;border-bottom: 1px solid rgba(255, 255, 255, 0.1);
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
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
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