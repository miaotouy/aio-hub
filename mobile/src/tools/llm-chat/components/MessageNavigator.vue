<script setup lang="ts">
import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
} from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "@/i18n";

const props = defineProps<{
  /** 1-based index of the message nearest the visible viewport center. */
  currentIndex: number;
  total: number;
}>();

const emit = defineEmits<{
  (e: "top"): void;
  (e: "previous"): void;
  (e: "next"): void;
  (e: "bottom"): void;
}>();

const { tRaw } = useI18n();
const t = (key: string) => tRaw(`tools.llm-chat.MessageNavigator.${key}`);
const hasMessages = computed(() => props.total > 1);
const canMovePrevious = computed(() => props.currentIndex > 1);
const canMoveNext = computed(() => props.currentIndex < props.total);
</script>

<template>
  <aside
    v-if="hasMessages"
    class="message-navigator"
    data-testid="message-navigator"
    :aria-label="t('消息导航器')"
  >
    <var-button
      text
      round
      size="small"
      class="navigator-button"
      :disabled="!canMovePrevious"
      :title="t('跳至顶部')"
      :aria-label="t('跳至顶部')"
      @click="emit('top')"
    >
      <ChevronsUp :size="16" />
    </var-button>
    <var-button
      text
      round
      size="small"
      class="navigator-button"
      :disabled="!canMovePrevious"
      :title="t('上一条消息')"
      :aria-label="t('上一条消息')"
      @click="emit('previous')"
    >
      <ChevronUp :size="16" />
    </var-button>
    <span class="navigator-counter" aria-live="polite">
      {{ currentIndex }} / {{ total }}
    </span>
    <var-button
      text
      round
      size="small"
      class="navigator-button"
      :disabled="!canMoveNext"
      :title="t('下一条消息')"
      :aria-label="t('下一条消息')"
      @click="emit('next')"
    >
      <ChevronDown :size="16" />
    </var-button>
    <var-button
      text
      round
      size="small"
      class="navigator-button"
      :disabled="!canMoveNext"
      :title="t('跳至底部')"
      :aria-label="t('跳至底部')"
      @click="emit('bottom')"
    >
      <ChevronsDown :size="16" />
    </var-button>
  </aside>
</template>

<style scoped>
.message-navigator {
  position: absolute;
  z-index: 12;
  right: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 38px;
  padding: 3px 4px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  color: var(--text-color-secondary);
  background: var(--card-bg);
  box-shadow: 0 4px 14px rgb(0 0 0 / 12%);
  backdrop-filter: blur(var(--ui-blur));
}

.navigator-button {
  width: 30px !important;
  height: 30px !important;
  min-width: 30px !important;
  padding: 0 !important;
  color: var(--text-color-secondary) !important;
}

.navigator-counter {
  min-width: 42px;
  color: var(--text-color-secondary);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
}

@media (max-width: 360px) {
  .message-navigator {
    gap: 0;
    right: 8px;
    bottom: 8px;
  }

  .navigator-button {
    width: 28px !important;
    min-width: 28px !important;
  }

  .navigator-counter {
    min-width: 38px;
    font-size: 0.68rem;
  }
}
</style>
