<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/i18n";
import type { LlmParameters } from "../types/agent";

type NumberParameter =
  "temperature" | "maxTokens" | "topP" | "frequencyPenalty" | "presencePenalty";

interface NumberField {
  key: NumberParameter;
  min: number;
  max: number;
  step: number;
}

const props = defineProps<{ modelValue?: LlmParameters }>();
const emit = defineEmits<{ "update:modelValue": [value: LlmParameters] }>();
const { tRaw } = useI18n();
const t = (key: string) => tRaw(`tools.agent-manager.Parameters.${key}`);

const parameters = computed<LlmParameters>(() => props.modelValue ?? {});
const contextManagement = computed(
  () => parameters.value.contextManagement ?? {}
);

const numberFields: NumberField[] = [
  { key: "temperature", min: 0, max: 2, step: 0.01 },
  { key: "maxTokens", min: 1, max: 1_000_000, step: 1 },
  { key: "topP", min: 0, max: 1, step: 0.01 },
  { key: "frequencyPenalty", min: -2, max: 2, step: 0.01 },
  { key: "presencePenalty", min: -2, max: 2, step: 0.01 },
];

function updateParameters(updates: Partial<LlmParameters>): void {
  emit("update:modelValue", { ...parameters.value, ...updates });
}

function updateNumber(field: NumberField, event: Event): void {
  const value = (event.target as HTMLInputElement).value.trim();
  if (!value) {
    const next = { ...parameters.value };
    delete next[field.key];
    emit("update:modelValue", next);
    return;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  updateParameters({
    [field.key]: Math.min(field.max, Math.max(field.min, parsed)),
  });
}

function updateStop(event: Event): void {
  const values = (event.target as HTMLTextAreaElement).value
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  updateParameters({ stop: values.length ? values : undefined });
}

function updateContextManagement(
  updates: Partial<NonNullable<LlmParameters["contextManagement"]>>
): void {
  updateParameters({
    contextManagement: { ...contextManagement.value, ...updates },
  });
}

function updateContextNumber(
  key: "maxContextTokens" | "retainedCharacters",
  event: Event
): void {
  const value = (event.target as HTMLInputElement).value.trim();
  if (!value) {
    const next = { ...contextManagement.value };
    delete next[key];
    updateParameters({ contextManagement: next });
    return;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  updateContextManagement({ [key]: Math.max(0, Math.floor(parsed)) });
}
</script>

<template>
  <section class="parameters-editor" data-testid="agent-parameters-editor">
    <div class="section-heading">
      <h2>{{ t("运行参数") }}</h2>
      <p>{{ t("运行参数说明") }}</p>
    </div>

    <div class="parameter-grid">
      <label v-for="field in numberFields" :key="field.key">
        <span>{{ t(field.key) }}</span>
        <input
          :data-testid="`agent-parameter-${field.key}`"
          type="number"
          inputmode="decimal"
          :min="field.min"
          :max="field.max"
          :step="field.step"
          :value="parameters[field.key]"
          @change="updateNumber(field, $event)"
        />
        <small>{{ t(`${field.key}说明`) }}</small>
      </label>
    </div>

    <label class="stop-sequences">
      <span>{{ t("停止序列") }}</span>
      <textarea
        data-testid="agent-parameter-stop"
        rows="3"
        :value="parameters.stop?.join('\n') ?? ''"
        :placeholder="t('停止序列提示')"
        @input="updateStop"
      />
      <small>{{ t("停止序列说明") }}</small>
    </label>

    <div class="context-management">
      <div class="context-heading">
        <div>
          <h3>{{ t("上下文截断") }}</h3>
          <p>{{ t("上下文截断说明") }}</p>
        </div>
        <label class="switch-label">
          <input
            data-testid="agent-context-management-enabled"
            type="checkbox"
            :checked="contextManagement.enabled === true"
            @change="
              updateContextManagement({
                enabled: ($event.target as HTMLInputElement).checked,
              })
            "
          />
          <span>{{ t("启用") }}</span>
        </label>
      </div>

      <div
        class="parameter-grid"
        :class="{ muted: !contextManagement.enabled }"
      >
        <label>
          <span>{{ t("最大上下文Token") }}</span>
          <input
            data-testid="agent-context-management-max-tokens"
            type="number"
            inputmode="numeric"
            min="1"
            step="1"
            :disabled="!contextManagement.enabled"
            :value="contextManagement.maxContextTokens"
            @input="updateContextNumber('maxContextTokens', $event)"
          />
          <small>{{ t("最大上下文Token说明") }}</small>
        </label>
        <label>
          <span>{{ t("截断保留字符") }}</span>
          <input
            data-testid="agent-context-management-retained-characters"
            type="number"
            inputmode="numeric"
            min="0"
            step="1"
            :disabled="!contextManagement.enabled"
            :value="contextManagement.retainedCharacters"
            @input="updateContextNumber('retainedCharacters', $event)"
          />
          <small>{{ t("截断保留字符说明") }}</small>
        </label>
      </div>
    </div>
  </section>
</template>

<style scoped>
.parameters-editor {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 14px;
  background: var(--color-surface-container-low);
}
.section-heading h2,
.context-heading h3 {
  margin: 0;
  color: var(--color-on-surface);
  font-size: 1rem;
}
.section-heading p,
.context-heading p,
small {
  margin: 4px 0 0;
  color: var(--color-on-surface-variant);
  font-size: 0.78rem;
  line-height: 1.45;
}
.parameter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
label {
  display: grid;
  gap: 6px;
  min-width: 0;
}
label > span {
  color: var(--color-on-surface);
  font-size: 0.84rem;
}
input:not([type="checkbox"]),
textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--color-outline-variant);
  border-radius: 8px;
  padding: 10px;
  color: var(--color-on-surface);
  background: var(--color-surface-container-high);
  font: inherit;
}
textarea {
  resize: vertical;
}
.context-management {
  display: grid;
  gap: 12px;
  padding-top: 4px;
  border-top: 1px solid var(--color-outline-variant);
}
.context-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.switch-label {
  display: inline-flex;
  grid-template-columns: auto auto;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.switch-label span {
  font-size: 0.82rem;
}
.muted {
  opacity: 0.58;
}
@media (max-width: 440px) {
  .parameter-grid {
    grid-template-columns: 1fr;
  }
}
</style>
