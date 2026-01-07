<template>
  <span ref="wrapperRef" class="dynamic-icon-wrapper" :style="wrapperStyle">
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
      :class="{ 'load-failed': hasFailed }"
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
import { toRefs, ref, watch, computed, onMounted, onUnmounted } from "vue";
import { useThemeAwareIcon } from "@/composables/useThemeAwareIcon";

const props = defineProps({
  src: {
    type: String,
    required: true,
  },
  alt: {
    type: String,
    default: "",
  },
  lazy: {
    type: Boolean,
    default: false,
  },
});

const { src, alt } = toRefs(props);

// 懒加载控制
const shouldLoad = ref(!props.lazy);
const wrapperRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

onMounted(() => {
  if (props.lazy) {
    observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        shouldLoad.value = true;
        observer?.disconnect();
        observer = null;
      }
    });
    if (wrapperRef.value) {
      observer.observe(wrapperRef.value);
    }
  }
});

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
  }
});

const effectiveSrc = computed(() => (shouldLoad.value ? src.value : ""));
const { isSvg, svgContent, iconUrl } = useThemeAwareIcon(effectiveSrc);

const hasFailed = ref(false);

const handleImageError = () => {
  hasFailed.value = true;
};

const fallbackText = computed(() => {
  if (alt.value) {
    return alt.value.charAt(0);
  }
  return "";
});

watch(
  src,
  (newSrc) => {
    hasFailed.value = false;
    if (!newSrc) {
      hasFailed.value = true;
    }
  },
  { immediate: true }
);

const wrapperStyle = computed(() => ({
  borderRadius: "inherit",
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
  overflow: hidden;
  isolation: isolate;
  transform: translateZ(0);
}

.dynamic-icon {
  display: inline-block;
  color: inherit;
  width: 100%;
  height: 100%;
}

.dynamic-icon:where(img) {
  object-fit: contain;
}

.dynamic-icon.load-failed {
  visibility: hidden;
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
  background-color: var(--color-surface-container);
  border-radius: 8px;
  border: 1px solid var(--color-outline-variant);
  color: var(--color-on-surface-variant);
  font-weight: 600;
  text-transform: uppercase;
  box-sizing: border-box;
}
</style>