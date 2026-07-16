<script setup lang="ts">
import { useI18n } from "@/i18n";

const { tRaw } = useI18n();
const tr = (key: string, params?: Record<string, unknown>) =>
  tRaw(`tools.llm-api.ModelProbe.${key}`, params);

defineProps<{ show: boolean; count: number }>();

const emit = defineEmits<{
  (event: "cancel"): void;
  (event: "confirm"): void;
}>();
</script>

<template>
  <div v-if="show" class="confirm-layer">
    <button
      class="confirm-backdrop"
      :aria-label="tr('返回调整')"
      @click="emit('cancel')"
    />
    <section
      class="confirm-sheet"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="probe-cost-title"
    >
      <h2 id="probe-cost-title">{{ tr("付费标题", { count }) }}</h2>
      <p>{{ tr("付费说明") }}</p>
      <div class="confirm-actions">
        <button class="secondary-button" @click="emit('cancel')">
          {{ tr("返回调整") }}
        </button>
        <button class="primary-button" @click="emit('confirm')">
          {{ tr("确认并检查") }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.confirm-layer {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
}

.confirm-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: color-mix(in srgb, var(--color-on-surface) 32%, transparent);
}

.confirm-sheet {
  position: relative;
  width: 100%;
  padding: 24px 20px calc(20px + env(safe-area-inset-bottom));
  border-radius: var(--app-radius-lg) var(--app-radius-lg) 0 0;
  background: var(--container-bg, var(--color-surface-container));
}

.confirm-sheet h2 {
  margin: 0;
  color: var(--color-on-surface);
  font-size: 1.08rem;
  line-height: 1.4;
}

.confirm-sheet p {
  margin: 10px 0 22px;
  color: var(--color-on-surface-variant);
  font-size: 0.9rem;
  line-height: 1.6;
}

.confirm-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
  gap: 10px;
}

.confirm-actions button {
  min-height: 46px;
  border-radius: var(--app-radius-md);
  font-weight: 700;
}

.secondary-button {
  border: 1px solid var(--border-color, var(--color-outline));
  color: var(--color-on-surface);
  background: transparent;
}

.primary-button {
  border: 1px solid var(--color-primary);
  color: var(--color-on-primary);
  background: var(--color-primary);
}
</style>
