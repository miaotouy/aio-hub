<template>
  <div
    class="image-container"
    :data-node-id="nodeId"
    :data-node-status="$attrs['data-node-status']"
  >
    <div v-if="isLoading" class="loading-placeholder">
      <div class="spinner"></div>
    </div>
    <div v-else-if="hasError" class="error-placeholder">⚠️ 加载失败</div>
    <img
      v-else
      :src="resolvedSrc"
      :alt="alt || ''"
      :title="title || undefined"
      class="markdown-image"
      @error="hasError = true"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { assetManagerEngine } from "@/composables/useAssetManager";

const props = defineProps<{
  nodeId: string;
  src: string;
  alt?: string;
  title?: string;
}>();

const resolvedSrc = ref("");
const isLoading = ref(true);
const hasError = ref(false);
let basePath: string | null = null;

const resolveUrl = async () => {
  isLoading.value = true;
  hasError.value = false;

  try {
    if (props.src.startsWith("appdata://")) {
      if (!basePath) {
        basePath = await assetManagerEngine.getAssetBasePath();
      }
      const assetPath = props.src.substring("appdata://".length);
      resolvedSrc.value = assetManagerEngine.convertToAssetProtocol(assetPath, basePath);
    } else {
      resolvedSrc.value = props.src;
    }
  } catch (error) {
    console.error(`[ImageNode] Failed to resolve image source: ${props.src}`, error);
    hasError.value = true;
  } finally {
    isLoading.value = false;
  }
};

watch(() => props.src, resolveUrl, { immediate: true });
</script>

<style scoped>
.image-container {
  display: inline-block;
  vertical-align: middle;
  max-width: 100%;
  line-height: 0; /* 避免图片下方出现额外空隙 */
}

.markdown-image {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

.loading-placeholder,
.error-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 50px; /* 最小高度，避免加载时闪烁 */
  width: 100%;
  padding: 16px;
  background-color: var(--container-bg);
  border: 1px dashed var(--border-color);
  border-radius: 4px;
  color: var(--text-color-light);
  font-size: 14px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>