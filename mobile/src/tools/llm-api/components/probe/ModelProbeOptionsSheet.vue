<script setup lang="ts">
import { X } from "lucide-vue-next";
import { useI18n } from "@/i18n";

const { tRaw } = useI18n();
const tr = (key: string, params?: Record<string, unknown>) =>
  tRaw(`tools.llm-api.ModelProbe.${key}`, params);

defineProps<{
  show: boolean;
  concurrency: number;
  streamChat: boolean;
  timeoutMs: number;
  selectedCount: number;
  hasChat: boolean;
}>();

const emit = defineEmits<{
  (event: "update:show", value: boolean): void;
  (event: "update:concurrency", value: 1 | 2 | 3 | 4): void;
  (event: "update:streamChat", value: boolean): void;
  (event: "update:timeoutMs", value: number): void;
}>();
</script>

<template>
  <div v-if="show" class="sheet-layer" role="presentation">
    <button
      class="sheet-backdrop"
      :aria-label="tr('关闭检查选项')"
      @click="emit('update:show', false)"
    />
    <section
      class="options-sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="tr('检查选项')"
    >
      <header class="sheet-header">
        <h2>{{ tr("检查选项") }}</h2>
        <button
          class="icon-button"
          :aria-label="tr('关闭检查选项')"
          @click="emit('update:show', false)"
        >
          <X :size="20" />
        </button>
      </header>

      <div v-if="selectedCount > 1" class="option-row option-stack">
        <div>
          <div class="option-label">{{ tr("并发数") }}</div>
          <div class="option-hint">{{ tr("并发数说明") }}</div>
        </div>
        <div class="segment-control" :aria-label="tr('并发数')">
          <button
            v-for="value in [1, 2, 3, 4] as const"
            :key="value"
            :class="{ active: concurrency === value }"
            @click="emit('update:concurrency', value)"
          >
            {{ value }}
          </button>
        </div>
      </div>

      <label v-if="hasChat" class="option-row">
        <span>
          <span class="option-label">{{ tr("流式 Chat") }}</span>
          <span class="option-hint">{{ tr("流式说明") }}</span>
        </span>
        <var-switch
          :model-value="streamChat"
          :aria-label="tr('流式 Chat')"
          @update:model-value="emit('update:streamChat', Boolean($event))"
        />
      </label>

      <label class="option-row option-stack">
        <span>
          <span class="option-label">{{ tr("超时") }}</span>
          <span class="option-hint">{{ tr("超时说明") }}</span>
        </span>
        <select
          class="timeout-select"
          :value="timeoutMs"
          @change="
            emit(
              'update:timeoutMs',
              Number(($event.target as HTMLSelectElement).value)
            )
          "
        >
          <option :value="30_000">{{ tr("N秒", { count: 30 }) }}</option>
          <option :value="60_000">{{ tr("N秒", { count: 60 }) }}</option>
          <option :value="120_000">{{ tr("N秒", { count: 120 }) }}</option>
        </select>
      </label>
    </section>
  </div>
</template>

<style scoped>
.sheet-layer {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
}

.sheet-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: color-mix(in srgb, var(--color-on-surface) 28%, transparent);
}

.options-sheet {
  position: relative;
  width: 100%;
  padding: 8px 20px calc(20px + env(safe-area-inset-bottom));
  border-radius: var(--app-radius-lg) var(--app-radius-lg) 0 0;
  background: var(--container-bg, var(--color-surface-container));
  box-shadow: 0 -8px 28px
    color-mix(in srgb, var(--color-on-surface) 14%, transparent);
}

.sheet-header,
.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.sheet-header {
  min-height: 52px;
  border-bottom: 1px solid var(--border-color, var(--color-outline-variant));
}

.sheet-header h2 {
  margin: 0;
  font-size: 1.05rem;
}

.icon-button {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  border-radius: var(--app-radius-md);
  color: var(--color-on-surface);
  background: transparent;
}

.option-row {
  min-height: 64px;
  border-bottom: 1px solid var(--border-color, var(--color-outline-variant));
}

.option-row:last-child {
  border-bottom: 0;
}

.option-stack {
  align-items: stretch;
  flex-direction: column;
  justify-content: center;
  padding: 12px 0;
}

.option-label,
.option-hint {
  display: block;
}

.option-label {
  color: var(--color-on-surface);
  font-weight: 600;
}

.option-hint {
  margin-top: 3px;
  color: var(--color-on-surface-variant);
  font-size: 0.78rem;
}

.segment-control {
  display: grid;
  grid-template-columns: repeat(4, minmax(44px, 1fr));
  overflow: hidden;
  border: 1px solid var(--border-color, var(--color-outline-variant));
  border-radius: var(--app-radius-md);
}

.segment-control button {
  min-height: 44px;
  border: 0;
  border-right: 1px solid var(--border-color, var(--color-outline-variant));
  color: var(--color-on-surface-variant);
  background: var(--input-bg, var(--color-surface));
}

.segment-control button:last-child {
  border-right: 0;
}

.segment-control button.active {
  color: var(--color-on-primary-container);
  background: var(--color-primary-container);
  font-weight: 700;
}

.timeout-select {
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border-color, var(--color-outline-variant));
  border-radius: var(--app-radius-md);
  color: var(--color-on-surface);
  background: var(--input-bg, var(--color-surface));
}
</style>
