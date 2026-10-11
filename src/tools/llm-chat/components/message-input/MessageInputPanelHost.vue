<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { ChevronDown, ChevronUp, X } from "lucide-vue-next";
import MessageInputPanelLayout from "./MessageInputPanelLayout.vue";
import type { MessageInputPanelDefinition } from "../../composables/input/useMessageInputPanel";

const props = defineProps<{
  panel: MessageInputPanelDefinition;
  contentId: string;
  collapsed: boolean;
}>();
const emit = defineEmits<{
  "update:collapsed": [collapsed: boolean];
  close: [];
}>();
const contentRef = ref<HTMLElement>();
const collapseButtonRef = ref<HTMLButtonElement>();

watch(
  [() => props.panel.id, () => props.collapsed],
  async () => {
    if (props.collapsed) {
      if (contentRef.value?.contains(document.activeElement))
        collapseButtonRef.value?.focus({ preventScroll: true });
      return;
    }
    const focused = document.activeElement;
    const panel = props.panel;
    await nextTick();
    if (
      props.panel !== panel ||
      props.collapsed ||
      document.activeElement !== focused
    )
      return;
    const content = contentRef.value;
    const target = content?.querySelector<HTMLElement>(
      'input:not(:disabled),button:not(:disabled),[tabindex="0"]'
    );
    (target ?? content)?.focus({ preventScroll: true });
  },
  { immediate: true, flush: "post" }
);

function onEscape(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  event.preventDefault();
  event.stopPropagation();
  emit("close");
}
</script>

<template>
  <section
    class="input-panel-host"
    :aria-labelledby="`${contentId}-title`"
    @keydown.esc="onEscape"
  >
    <header class="panel-header">
      <component
        :is="panel.icon"
        v-if="panel.icon"
        :size="16"
        aria-hidden="true"
      />
      <span :id="`${contentId}-title`" class="panel-title">{{
        panel.title
      }}</span>
      <span v-if="panel.summary" class="panel-summary">{{
        panel.summary
      }}</span>
      <div class="panel-actions">
        <slot name="header-actions" />
        <button
          ref="collapseButtonRef"
          type="button"
          class="panel-button"
          :aria-label="collapsed ? '展开面板' : '折叠面板'"
          :title="collapsed ? '展开面板' : '折叠面板'"
          :aria-expanded="!collapsed"
          :aria-controls="contentId"
          @click="emit('update:collapsed', !collapsed)"
        >
          <ChevronUp v-if="collapsed" :size="16" />
          <ChevronDown v-else :size="16" />
        </button>
        <button
          type="button"
          class="panel-button"
          aria-label="关闭面板"
          title="关闭面板"
          @click="emit('close')"
        >
          <X :size="16" />
        </button>
      </div>
    </header>
    <div
      v-show="!collapsed"
      :id="contentId"
      ref="contentRef"
      class="panel-content"
      tabindex="-1"
    >
      <MessageInputPanelLayout :scroll="panel.scroll">
        <template v-if="$slots.controls" #controls
          ><slot name="controls"
        /></template>
        <slot />
        <template v-if="$slots.footer" #footer><slot name="footer" /></template>
      </MessageInputPanelLayout>
    </div>
  </section>
</template>

<style scoped>
.input-panel-host {
  min-width: 0;
  flex: none;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  color: var(--text-color-primary);
}
.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 4px 8px 4px 12px;
  box-sizing: border-box;
}
.panel-title {
  font-size: 13px;
  font-weight: 500;
  flex-shrink: 0;
}
.panel-summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color-secondary);
  font-size: 12px;
}
.panel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.panel-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
}
.panel-button:hover {
  color: var(--text-color-primary);
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}
.panel-button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 1px;
}
.panel-content {
  min-height: 0;
  border-top: var(--border-width) solid var(--border-color);
}
</style>
