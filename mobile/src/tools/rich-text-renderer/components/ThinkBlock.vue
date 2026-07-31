<script setup lang="ts">
import { ref } from "vue";
import { Check, ChevronRight, Copy } from "lucide-vue-next";
import { customMessage } from "@/utils/feedback";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("rich-text-renderer/think-block");

const props = withDefaults(
  defineProps<{
    tagName: string;
    rawContent: string;
    isThinking?: boolean;
  }>(),
  { isThinking: false }
);

const collapsed = ref(true);
const copied = ref(false);

function toggle() {
  collapsed.value = !collapsed.value;
}

async function copyContent() {
  try {
    await navigator.clipboard.writeText(props.rawContent);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    logger.warn("复制思考内容失败", error);
    customMessage("复制失败", "error");
  }
}
</script>

<template>
  <section
    class="llm-think-node"
    :class="{ 'is-collapsed': collapsed, 'is-thinking': isThinking }"
  >
    <div class="llm-think-header">
      <button
        type="button"
        class="llm-think-toggle"
        :aria-expanded="!collapsed"
        @click="toggle"
      >
        <ChevronRight :size="16" :class="{ 'is-expanded': !collapsed }" />
        <span>{{ isThinking ? "思考中" : "思考过程" }}</span>
        <code>{{ tagName }}</code>
      </button>
      <button
        type="button"
        class="llm-think-copy"
        :aria-label="copied ? '已复制思考内容' : '复制思考内容'"
        @click="copyContent"
      >
        <Check v-if="copied" :size="15" />
        <Copy v-else :size="15" />
      </button>
    </div>
    <div v-show="!collapsed" class="llm-think-content">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.llm-think-node {
  margin: 10px 0;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
  background: var(--card-bg);
}

.llm-think-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  padding: 0 8px 0 10px;
  background: color-mix(in srgb, var(--card-bg) 84%, var(--color-primary));
}

.llm-think-toggle,
.llm-think-copy {
  display: inline-flex;
  align-items: center;
  border: 0;
  color: var(--text-color-light);
  background: transparent;
}

.llm-think-toggle {
  min-width: 0;
  flex: 1;
  gap: 6px;
  padding: 9px 0;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.llm-think-toggle code {
  padding: 1px 4px;
  border-radius: var(--app-radius-sm);
  color: var(--text-color-light);
  background: var(--input-bg);
  font-size: 0.78em;
}

.llm-think-toggle svg {
  flex: none;
  transition: transform 0.18s ease;
}

.llm-think-toggle svg.is-expanded {
  transform: rotate(90deg);
}

.llm-think-copy {
  padding: 7px;
  border-radius: var(--app-radius-sm);
  cursor: pointer;
}

.llm-think-copy:active,
.llm-think-copy:hover {
  color: var(--text-color);
  background: var(--input-bg);
}

.llm-think-content {
  padding: 10px 12px;
  color: var(--text-color-light);
}

.is-thinking .llm-think-toggle {
  color: var(--color-primary);
}
</style>
