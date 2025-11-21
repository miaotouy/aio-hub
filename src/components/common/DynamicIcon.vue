<template>
  <span class="dynamic-icon-wrapper" :style="wrapperStyle">
    <!-- 成功加载：SVG -->
    <span
      v-if="isSvg && svgContent && !hasFailed"
      class="dynamic-icon"
      v-html="svgContent"
      v-bind="$attrs"
    />
    <!-- 成功加载：Image -->
    <img
      v-else-if="iconUrl && !hasFailed"
      :src="iconUrl"
      class="dynamic-icon"
      @error="handleImageError"
      v-bind="$attrs"
    />
    <!-- 兜底逻辑 -->
    <span v-else class="dynamic-icon-fallback">
      {{ fallbackText }}
    </span>
  </span>
</template>

<script setup lang="ts">
import { toRefs, ref, watch, computed } from "vue";
import { useThemeAwareIcon } from "@composables/useThemeAwareIcon";

const props = defineProps({
  src: {
    type: String,
    required: true,
  },
  alt: {
    type: String,
    default: "",
  },
});

const { src, alt } = toRefs(props);
const { isSvg, svgContent, iconUrl } = useThemeAwareIcon(src);

const hasFailed = ref(false);

const handleImageError = () => {
  hasFailed.value = true;
};

// 兜底文字
const fallbackText = computed(() => {
  if (alt.value) {
    return alt.value.charAt(0);
  }
  return ""; // 如果没有 alt，则为空白占位符
});

// 当 src 变化时，重置失败状态
watch(
  src,
  (newSrc) => {
    hasFailed.value = false;
    // 如果新 src 为空，直接进入失败状态，显示兜底
    if (!newSrc) {
      hasFailed.value = true;
    }
  },
  { immediate: true }
);

const wrapperStyle = computed(() => ({
  borderRadius: 'inherit', // 继承父容器的圆角
}));
</script>

<style scoped>
.dynamic-icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  vertical-align: middle;
  overflow: hidden; /* 确保子元素不会溢出圆角 */
}

/* 图标容器统一样式 */
.dynamic-icon {
  display: inline-block;
  color: var(--el-text-color-primary);
  width: 100%;
  height: 100%;
}

.dynamic-icon:where(img) {
  object-fit: contain;
}

.dynamic-icon:not(img) :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.dynamic-icon-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--container-bg);
  border: 1px solid var(--border-color);
  color: var(--text-color-secondary);
  font-weight: 600;
  font-size: 60%; /* 相对于容器高度 */
  text-transform: uppercase;
  box-sizing: border-box;
  border-radius: inherit; /* 继承父容器的圆角 */
}
</style>
