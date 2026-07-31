<script setup lang="ts">
import { computed } from "vue";
import {
  CircleAlert,
  CircleCheck,
  Info,
  Lightbulb,
  OctagonAlert,
} from "lucide-vue-next";

type AlertVariant = "note" | "tip" | "important" | "warning" | "caution";

const props = defineProps<{
  variant: AlertVariant;
}>();

const title = computed(() => {
  switch (props.variant) {
    case "note":
      return "Note";
    case "tip":
      return "Tip";
    case "important":
      return "Important";
    case "warning":
      return "Warning";
    case "caution":
      return "Caution";
  }
});

const icon = computed(() => {
  switch (props.variant) {
    case "note":
      return Info;
    case "tip":
      return Lightbulb;
    case "important":
      return CircleCheck;
    case "warning":
      return CircleAlert;
    case "caution":
      return OctagonAlert;
  }
});
</script>

<template>
  <aside
    class="rich-text-alert"
    :class="`rich-text-alert--${variant}`"
    :data-testid="`rich-text-alert-${variant}`"
    role="note"
  >
    <header class="rich-text-alert__header">
      <component :is="icon" :size="18" aria-hidden="true" />
      <strong>{{ title }}</strong>
    </header>
    <div class="rich-text-alert__content">
      <slot />
    </div>
  </aside>
</template>

<style scoped>
.rich-text-alert {
  margin: 12px 0;
  padding: 10px 12px;
  border-left: 4px solid var(--color-secondary);
  border-radius: 0 8px 8px 0;
  background: var(--color-secondary-container);
  color: var(--color-on-secondary-container);
}

.rich-text-alert__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  color: var(--color-secondary);
  line-height: 1.4;
}

.rich-text-alert__content {
  color: inherit;
}

.rich-text-alert--tip {
  border-left-color: var(--color-tertiary);
  background: var(--color-tertiary-container);
  color: var(--color-on-tertiary-container);
}

.rich-text-alert--tip .rich-text-alert__header {
  color: var(--color-tertiary);
}

.rich-text-alert--important {
  border-left-color: var(--color-primary);
  background: var(--color-primary-container);
  color: var(--color-on-primary-container);
}

.rich-text-alert--important .rich-text-alert__header {
  color: var(--color-primary);
}

.rich-text-alert--warning {
  border-left-color: var(--color-tertiary);
  background: var(--color-tertiary-container);
  color: var(--color-on-tertiary-container);
}

.rich-text-alert--warning .rich-text-alert__header {
  color: var(--color-tertiary);
}

.rich-text-alert--caution {
  border-left-color: var(--color-error);
  background: var(--color-error-container);
  color: var(--color-on-error-container);
}

.rich-text-alert--caution .rich-text-alert__header {
  color: var(--color-error);
}
</style>
