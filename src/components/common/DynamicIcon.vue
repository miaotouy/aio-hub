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

const handleImageError = (e: Event) => {
  const img = e.target as HTMLImageElement;
  // 隐藏损坏的图片，避免显示浏览器默认的错误图标
  img.style.display = "none";
};
</script>

<style scoped>
/* 默认情况下，图片正常显示 */
img {
  display: inline-block;
  vertical-align: middle;
}
</style>
