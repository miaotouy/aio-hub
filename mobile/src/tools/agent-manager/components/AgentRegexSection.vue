<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronDown, TriangleAlert } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import type { MobileRegexConfig } from "../composables/useAgentImporter";

const props = defineProps<{
  config: unknown;
}>();
const emit = defineEmits<{
  "update:config": [config: unknown];
}>();

const { useScopedT } = useI18n();
const t = useScopedT("tools.agent-manager.Regex");

const expanded = ref<Set<string>>(new Set());

const presets = computed<MobileRegexConfig["presets"]>(() => {
  const value = props.config as { presets?: unknown } | null | undefined;
  return Array.isArray(value?.presets)
    ? (value.presets as MobileRegexConfig["presets"])
    : [];
});

function toggleExpanded(id: string): void {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

function togglePreset(preset: MobileRegexConfig["presets"][number]): void {
  preset.enabled = !preset.enabled;
  emit("update:config", structuredClone(props.config));
}

function rulesOf(
  preset: MobileRegexConfig["presets"][number]
): MobileRegexConfig["presets"][number]["rules"] {
  return Array.isArray(preset.rules) ? preset.rules : [];
}

function applyToLabel(applyTo: unknown): string {
  if (!applyTo || typeof applyTo !== "object") return "";
  const record = applyTo as { render?: unknown; request?: unknown };
  const stages: string[] = [];
  if (record.request === true) stages.push("request");
  if (record.render === true) stages.push("render");
  return stages.join(" + ");
}

function isScriptRule(replacementType: unknown): boolean {
  return replacementType === "script";
}

function ruleReplacementType(
  rule: MobileRegexConfig["presets"][number]["rules"][number]
): unknown {
  return (rule as { replacementType?: unknown }).replacementType;
}
</script>

<template>
  <section v-if="presets.length" class="form-section">
    <div class="section-heading">
      <div>
        <h2>{{ t("标题") }}</h2>
        <p>{{ t("说明") }}</p>
      </div>
    </div>

    <div v-for="preset in presets" :key="preset.id" class="preset-card">
      <div class="preset-head">
        <button
          type="button"
          class="preset-toggle"
          @click="toggleExpanded(preset.id)"
        >
          <ChevronDown
            :class="{ rotate: expanded.has(preset.id) }"
            :size="16"
          />
          <span class="preset-name">{{ preset.name || t("未命名") }}</span>
          <span class="rule-count">
            {{ t("规则数", { count: rulesOf(preset).length }) }}
          </span>
        </button>
        <label class="switch">
          <input
            type="checkbox"
            :checked="preset.enabled"
            @change="togglePreset(preset)"
          />
          <span>{{ t("启用") }}</span>
        </label>
      </div>

      <ul v-show="expanded.has(preset.id)" class="rule-list">
        <li
          v-for="(rule, index) in rulesOf(preset)"
          :key="rule.id || index"
          class="rule-item"
          :class="{ disabled: rule.enabled === false }"
        >
          <div class="rule-meta">
            <span class="rule-name">{{ rule.name || t("规则") }}</span>
            <span v-if="applyToLabel(rule.applyTo)" class="rule-stage">
              {{ applyToLabel(rule.applyTo) }}
            </span>
            <span v-if="isScriptRule(ruleReplacementType(rule))" class="rule-script">
              <TriangleAlert :size="12" />
              {{ t("脚本规则跳过") }}
            </span>
          </div>
          <code class="rule-regex">{{ rule.regex }}</code>
          <code class="rule-replacement">→ {{ rule.replacement }}</code>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.form-section {
  display: grid;
  gap: 12px;
}
.section-heading h2 {
  margin: 0;
  color: var(--text-color);
  font-size: var(--font-size-md);
}
.section-heading p {
  margin: 4px 0 0;
  color: var(--text-color-light);
  font-size: var(--font-size-xs);
}
.preset-card {
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--app-radius-md);
  background: var(--input-bg);
}
.preset-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
}
.preset-toggle {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 0;
  color: var(--text-color);
  background: transparent;
  text-align: left;
}
.preset-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
}
.rule-count {
  flex-shrink: 0;
  color: var(--text-color-light);
  font-size: var(--font-size-xs);
}
.rotate {
  transform: rotate(180deg);
}
.switch {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 44px;
  color: var(--text-color-light);
  font-size: var(--font-size-xs);
}
.switch input {
  width: auto;
}
.rule-list {
  margin: 0;
  padding: 0 10px 10px;
  list-style: none;
  display: grid;
  gap: 8px;
}
.rule-item {
  padding: 8px;
  border-radius: var(--app-radius-sm, 6px);
  background: var(--card-bg);
}
.rule-item.disabled {
  opacity: 0.55;
}
.rule-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 5px;
}
.rule-name {
  color: var(--text-color);
  font-size: var(--font-size-xs);
}
.rule-stage {
  padding: 1px 7px;
  border-radius: var(--app-radius-sm, 6px);
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  font-size: var(--font-size-xs);
}
.rule-script {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border-radius: var(--app-radius-sm, 6px);
  color: var(--warning-color, #e6a23c);
  background: color-mix(in srgb, var(--warning-color, #e6a23c) 14%, transparent);
  font-size: var(--font-size-xs);
}
.rule-regex,
.rule-replacement {
  display: block;
  color: var(--text-color-light);
  font-size: var(--font-size-xs);
  font-family: var(--font-mono, monospace);
  word-break: break-all;
  line-height: 1.5;
}
.rule-replacement {
  margin-top: 3px;
}
</style>
