<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <component
    :is="displayMode ? 'div' : 'span'"
    ref="containerRef"
    :class="containerClass"
  ></component>
</template>

<script setup lang="ts">
import {
  computed,
  inject,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from "vue";
import katex from "katex";
import "katex/dist/katex.min.css";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  RICH_TEXT_CONTEXT_KEY,
  type NodeMeta,
  type RichTextContext,
} from "../types";

const errorHandler = createModuleErrorHandler(
  "rich-text-renderer/KatexRenderer"
);
const props = withDefaults(
  defineProps<{
    content: string;
    displayMode?: boolean;
    nodeStatus?: NodeMeta["status"];
  }>(),
  { displayMode: false }
);
const context = inject<RichTextContext>(RICH_TEXT_CONTEXT_KEY);
const containerRef = ref<HTMLElement>();
const containerClass = computed(() =>
  props.displayMode ? "katex-block-container" : "katex-inline-container"
);
const streaming = computed(
  () =>
    (context?.isStreaming?.value ?? true) &&
    (props.nodeStatus === undefined
      ? !!context?.isStreaming?.value
      : props.nodeStatus === "pending")
);
let active = true;
let mounted = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let rendered: { content: string; displayMode: boolean } | undefined;
function cancel() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}
function renderKatex() {
  cancel();
  if (!mounted || !active || !containerRef.value) return;
  if (
    rendered?.content === props.content &&
    rendered.displayMode === props.displayMode
  )
    return;
  try {
    katex.render(props.content, containerRef.value, {
      displayMode: props.displayMode,
      throwOnError: false,
      errorColor: "#cc0000",
      strict: "warn",
      trust: false,
      macros: {},
    });
    rendered = { content: props.content, displayMode: props.displayMode };
  } catch (error) {
    errorHandler.error(error, "KaTeX 公式渲染失败", {
      content: props.content,
      displayMode: props.displayMode,
    });
  }
}
function schedule() {
  if (!mounted || !active) return;
  if (!streaming.value) renderKatex();
  else if (timer === undefined) timer = setTimeout(renderKatex, 32);
}
onMounted(() => {
  mounted = true;
  renderKatex();
});
watch([() => props.content, () => props.displayMode, streaming], schedule, {
  flush: "post",
});
onDeactivated(() => {
  active = false;
  cancel();
});
onActivated(() => {
  active = true;
  renderKatex();
});
onBeforeUnmount(() => {
  mounted = false;
  cancel();
});
</script>

<style scoped>
.katex-block-container {
  margin: 1em 0;
  text-align: center;
  overflow-x: auto;
}

.katex-inline-container {
  display: inline;
}

/* KaTeX 渲染错误样式 */
:deep(.katex-error) {
  color: var(--el-color-danger);
  font-family: var(--el-font-family);
}
</style>
