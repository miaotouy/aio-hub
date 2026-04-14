<template>
  <div class="canvas-preview-pane">
    <div v-if="isRefreshing" class="loading-overlay">
      <Loader2 class="animate-spin" :size="24" />
    </div>

    <iframe
      ref="iframeRef"
      class="preview-iframe"
      :src="previewSrc || undefined"
      :srcdoc="previewSrcdoc || undefined"
      sandbox="allow-scripts allow-same-origin allow-popups"
    ></iframe>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { Loader2 } from "lucide-vue-next";

defineProps<{
  previewSrc: string;
  previewSrcdoc?: string;
  isRefreshing: boolean;
}>();

const emit = defineEmits<{
  (e: "console-message", payload: any): void;
}>();

const iframeRef = ref<HTMLIFrameElement | null>(null);

defineExpose({
  iframe: iframeRef,
});

const handleMessage = (event: MessageEvent) => {
  if (event.data?.type === "canvas-console") {
    emit("console-message", event.data);
  }
};

onMounted(() => {
  window.addEventListener("message", handleMessage);
});

onUnmounted(() => {
  window.removeEventListener("message", handleMessage);
});
</script>

<style scoped lang="scss">
.canvas-preview-pane {
  position: relative;
  width: 100%;
  height: 100%;
  background: white;
  overflow: hidden;

  .preview-iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(2px);
    z-index: 10;
    color: var(--el-color-primary);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
