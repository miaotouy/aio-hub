<template>
  <!-- SVG 图标：渲染处理后的内容 -->
  <span
    v-if="isSvg && svgContent"
    class="dynamic-icon"
    v-html="svgContent"
    v-bind="$attrs"
  />
  <!-- PNG 或其他图标：直接使用 img 标签 -->
  <img
    v-else-if="iconUrl"
    :src="iconUrl"
    class="dynamic-icon"
    @error="handleImageError"
    v-bind="$attrs"
  />
</template>

<script setup lang="ts">
import { toRefs, ref } from "vue";
import { useThemeAwareIcon } from "../../composables/useThemeAwareIcon";

const props = defineProps({
  src: {
    type: String,
    required: true,
  },
});

const { src } = toRefs(props);
const { isSvg, svgContent, iconUrl } = useThemeAwareIcon(src);

const FALLBACK_ICON_SRC = "/model-icons/openai.svg";
const hasFailed = ref(false);

const handleImageError = (e: Event) => {
  const img = e.target as HTMLImageElement;
  // 如果已经是兜底图标了还出错，那就直接隐藏，别无限循环了
  if (hasFailed.value || img.src.includes(FALLBACK_ICON_SRC)) {
    img.style.display = "none";
    return;
  }
  // 设置为兜底图标
  hasFailed.value = true;
  img.src = FALLBACK_ICON_SRC;
};
</script>

<style scoped>
/* 图标容器统一样式 */
.dynamic-icon {
  display: inline-block;
  vertical-align: middle;
  /* 使用主题文字颜色，让 currentColor 能够响应 */
  color: var(--el-text-color-primary);
  /* 确保容器本身也能继承父容器的尺寸 */
  width: 100%;
  height: 100%;
}

/* img 标签需要保持 object-fit */
.dynamic-icon:where(img) {
  object-fit: contain;
}

/* SVG 容器需要确保内部 SVG 继承尺寸 */
.dynamic-icon:not(img) :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
