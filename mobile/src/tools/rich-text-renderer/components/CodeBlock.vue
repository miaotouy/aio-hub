<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { Check, Copy } from "lucide-vue-next";
import { customMessage } from "@/utils/feedback";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("rich-text-renderer/code-block");

const props = withDefaults(
  defineProps<{
    content: string;
    language?: string;
  }>(),
  { language: "" }
);

const copied = ref(false);
const wrapEnabled = ref(false);
let copiedResetTimer: ReturnType<typeof setTimeout> | null = null;

async function copyContent() {
  try {
    await navigator.clipboard.writeText(props.content);
    copied.value = true;
    if (copiedResetTimer !== null) clearTimeout(copiedResetTimer);
    copiedResetTimer = setTimeout(() => {
      copiedResetTimer = null;
      copied.value = false;
    }, 2000);
  } catch (error) {
    logger.warn("复制代码失败", error);
    customMessage("复制失败", "error");
  }
}

onBeforeUnmount(() => {
  if (copiedResetTimer !== null) clearTimeout(copiedResetTimer);
});
</script>

<template>
  <section class="mobile-code-block" data-testid="rich-text-code-block">
    <header class="mobile-code-header">
      <span class="mobile-code-language">{{ language || "code" }}</span>
      <div class="mobile-code-actions">
        <button
          class="mobile-code-action"
          type="button"
          :aria-pressed="wrapEnabled"
          :aria-label="wrapEnabled ? '关闭代码自动换行' : '开启代码自动换行'"
          data-testid="rich-text-code-wrap"
          @click="wrapEnabled = !wrapEnabled"
        >
          换行
        </button>
        <button
          class="mobile-code-action"
          type="button"
          :aria-label="copied ? '已复制代码' : '复制代码'"
          data-testid="rich-text-code-copy"
          @click="copyContent"
        >
          <Check v-if="copied" :size="16" class="copy-success" />
          <Copy v-else :size="16" />
          <span>{{ copied ? "已复制" : "复制" }}</span>
        </button>
      </div>
    </header>
    <pre
      class="mobile-code-pre"
      :class="{ 'is-wrapped': wrapEnabled }"
    ><code>{{ content }}</code></pre>
  </section>
</template>

<style scoped>
.mobile-code-block {
  max-width: 100%;
  margin: 12px 0;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
  background: var(--input-bg);
}

.mobile-code-header {
  min-height: 44px;
  padding: 0 8px 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: var(--card-bg);
}

.mobile-code-language {
  min-width: 0;
  overflow: hidden;
  color: var(--text-color-light);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8rem;
  font-weight: 600;
  text-overflow: ellipsis;
  text-transform: lowercase;
  white-space: nowrap;
}

.mobile-code-actions {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
}

.mobile-code-action {
  min-width: 44px;
  min-height: 44px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-color-light);
  background: transparent;
  border: 0;
  border-radius: var(--app-radius-sm);
  font: inherit;
  font-size: 0.8rem;
}

.mobile-code-action:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.mobile-code-action:active,
.mobile-code-action[aria-pressed="true"] {
  color: var(--text-color);
  background: var(--color-surface-container-high, var(--card-bg));
}

.copy-success {
  color: var(--success-color, var(--el-color-success));
}

.mobile-code-pre {
  max-width: 100%;
  max-height: 50vh;
  margin: 0;
  overflow: auto;
  padding: 12px;
  color: var(--text-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  white-space: pre;
}

.mobile-code-pre.is-wrapped {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
