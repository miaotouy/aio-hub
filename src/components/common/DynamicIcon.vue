<template>
  <img
    v-if="src"
    :src="src"
    :class="{ 'invert-on-dark': needsInversion }"
    @error="handleImageError"
    v-bind="$attrs"
  />
</template>

<script setup lang="ts">
import { toRefs } from "vue";
import { useIconColorAnalyzer } from "../../composables/useIconColorAnalyzer";

const props = defineProps({
  src: {
    type: String,
    required: true,
  },
});

const { src } = toRefs(props);
const { needsInversion } = useIconColorAnalyzer(src.value);

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
</style>
