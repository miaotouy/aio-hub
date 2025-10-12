<template>
  <img
    v-if="src"
    :src="src"
    :class="{ 'invert-on-dark': shouldInvert }"
    @error="handleImageError"
    v-bind="$attrs"
  />
</template>

<script setup lang="ts">
import { toRefs, computed } from "vue";
import { useIconColorAnalyzer } from "../../composables/useIconColorAnalyzer";
import { useTheme } from "../../composables/useTheme";

const props = defineProps({
  src: {
    type: String,
    required: true,
  },
});

const { src } = toRefs(props);
const { needsInversion } = useIconColorAnalyzer(src.value);
const { isDark } = useTheme();

// 计算是否应该反色：只有在暗色模式且图标需要反色时才反色
const shouldInvert = computed(() => isDark.value && needsInversion.value);

const FALLBACK_ICON_SRC = "/model-icons/openai.svg";

const handleImageError = (e: Event) => {
  const img = e.target as HTMLImageElement;
  // 如果已经是兜底图标了还出错，那就直接隐藏，别无限循环了
  if (img.src.includes(FALLBACK_ICON_SRC)) {
    img.style.display = "none";
    return;
  }
  // 设置为兜底图标
  img.src = FALLBACK_ICON_SRC;
};
</script>

<style scoped>
/* 默认情况下，图片正常显示 */
img {
  display: inline-block;
  vertical-align: middle;
}

/* 单色图标在需要时反色 */
img.invert-on-dark {
  filter: invert(1);
}
</style>
