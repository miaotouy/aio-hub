<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import katex from "katex";
import "katex/dist/katex.min.css";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("rich-text-renderer/katex");
const errorHandler = createModuleErrorHandler("rich-text-renderer/katex");

const props = withDefaults(
  defineProps<{
    content: string;
    displayMode?: boolean;
  }>(),
  { displayMode: false }
);

const containerRef = ref<HTMLElement | null>(null);

function renderKatex() {
  if (!containerRef.value) {
    logger.warn("数学公式容器尚未准备好");
    return;
  }

  const rendered = errorHandler.wrapSync(
    () => {
      katex.render(props.content, containerRef.value!, {
        displayMode: props.displayMode,
        throwOnError: false,
        strict: "warn",
        trust: false,
      });
      return true;
    },
    { showToUser: false, context: { displayMode: props.displayMode } }
  );

  if (rendered === null) containerRef.value.textContent = props.content;
}

onMounted(renderKatex);
watch(() => [props.content, props.displayMode], renderKatex);
</script>

<template>
  <component
    :is="displayMode ? 'div' : 'span'"
    ref="containerRef"
    :class="displayMode ? 'katex-block' : 'katex-inline'"
  />
</template>

<style scoped>
.katex-block {
  max-width: 100%;
  margin: 10px 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 8px 0;
}

.katex-inline {
  display: inline;
}
</style>
