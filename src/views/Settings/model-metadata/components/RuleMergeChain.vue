<template>
  <div class="rule-merge-chain">
    <template
      v-for="(contribution, index) in contributions"
      :key="contribution.rule.id"
    >
      <el-popover
        trigger="hover"
        placement="bottom-start"
        width="360"
        :open-delay="200"
      >
        <template #reference>
          <el-tooltip
            placement="top"
            effect="dark"
            :show-after="300"
            popper-class="rule-chain-tooltip"
          >
            <template #content>
              <div class="tooltip-content">
                <div class="tooltip-title">
                  {{ getMatchTypeLabel(contribution.rule.matchType) }}:
                  {{ contribution.rule.matchValue }}
                </div>
                <div>优先级: {{ contribution.rule.priority || 0 }}</div>
                <div v-if="contribution.effectiveFields.length">
                  ✓ {{ contribution.effectiveFields.join("、") }}
                </div>
                <div v-if="contribution.overriddenFields.length">
                  ✗
                  {{ contribution.overriddenFields.join("、") }}
                  被更高优规则覆盖
                </div>
                <div v-if="contribution.rule.exclusive">
                  独占规则，截断了更低优先级的匹配
                </div>
                <div v-if="contribution.rule.description">
                  {{ contribution.rule.description }}
                </div>
              </div>
            </template>
            <el-tag
              class="chain-node"
              :class="{
                'chain-node--has-contribution':
                  contribution.effectiveFields.length > 0,
                'chain-node--last': index === contributions.length - 1,
              }"
              type="info"
              effect="light"
              size="small"
              @click.stop="$emit('edit', contribution.rule)"
            >
              <span class="chain-node__text">
                {{ getShortRuleLabel(contribution.rule) }}
              </span>
              <span
                class="chain-node__badge"
                :class="{
                  'chain-node__badge--overridden':
                    contribution.effectiveFields.length === 0,
                }"
              />
            </el-tag>
          </el-tooltip>
        </template>

        <div class="rule-popover">
          <div class="rule-popover__header">
            <el-tag :type="getMatchTypeTagType(contribution.rule.matchType)">
              {{ getMatchTypeLabel(contribution.rule.matchType) }}
            </el-tag>
            <code>{{ contribution.rule.matchValue }}</code>
          </div>
          <div class="rule-popover__meta">
            <span>优先级: {{ contribution.rule.priority || 0 }}</span>
            <span v-if="contribution.rule.exclusive">独占</span>
            <span v-if="contribution.rule.useRegex">RegEx</span>
          </div>
          <div class="field-summary">
            <div>
              <span class="summary-label">最终贡献</span>
              <span>{{ formatFields(contribution.effectiveFields) }}</span>
            </div>
            <div>
              <span class="summary-label">已被覆盖</span>
              <span>{{ formatFields(contribution.overriddenFields) }}</span>
            </div>
          </div>
          <pre class="properties-preview">{{
            formatProperties(contribution.rule.properties)
          }}</pre>
        </div>
      </el-popover>

      <span v-if="index < contributions.length - 1" class="chain-separator">
        →
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import type {
  MetadataMatchType,
  ModelMetadataRule,
} from "@/types/model-metadata";
import type { RuleContribution } from "../utils/coverageAnalysis";

defineProps<{
  contributions: RuleContribution[];
}>();

defineEmits<{
  (e: "edit", rule: ModelMetadataRule): void;
}>();

function getMatchTypeLabel(type: MetadataMatchType): string {
  const labels: Record<MetadataMatchType, string> = {
    provider: "Provider",
    model: "Model",
    modelPrefix: "Prefix",
    modelGroup: "Group",
  };
  return labels[type] || type;
}

function getMatchTypeTagType(
  type: MetadataMatchType
): "" | "success" | "info" | "warning" | "danger" {
  const types: Record<
    MetadataMatchType,
    "" | "success" | "info" | "warning" | "danger"
  > = {
    provider: "",
    model: "info",
    modelPrefix: "warning",
    modelGroup: "success",
  };
  return types[type] || "";
}

function getShortRuleLabel(rule: ModelMetadataRule): string {
  const typeLabel =
    rule.matchType === "modelPrefix" ? "prefix" : rule.matchType;
  const value =
    rule.matchValue.length > 18
      ? `${rule.matchValue.slice(0, 15)}...`
      : rule.matchValue;
  return `${typeLabel}: ${value}`;
}

function formatFields(fields: string[]): string {
  return fields.length ? fields.join("、") : "无";
}

function formatProperties(properties: ModelMetadataRule["properties"]): string {
  return JSON.stringify(properties || {}, null, 2);
}
</script>

<style scoped>
.rule-merge-chain {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
  padding: 4px;
}

.chain-separator {
  color: var(--text-color-light);
  font-size: 12px;
  user-select: none;
}

.chain-node {
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
  max-width: 180px;
}

.chain-node:hover {
  filter: brightness(0.9);
}

.chain-node--has-contribution.chain-node--last {
  outline: 1px solid var(--el-color-success);
  border-radius: 4px;
}

.chain-node__text {
  display: inline-block;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.chain-node__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-success);
  border: 1px solid var(--card-bg);
}

.chain-node__badge--overridden {
  background: var(--el-color-info);
}

.tooltip-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 320px;
}

.tooltip-title {
  font-weight: 600;
}

.rule-popover {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rule-popover__header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.rule-popover__header code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--el-font-family-mono);
  background: var(--input-bg);
  border-radius: 4px;
  padding: 2px 6px;
}

.rule-popover__meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-color-light);
}

.field-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}

.summary-label {
  display: inline-block;
  width: 64px;
  color: var(--text-color-light);
}

.properties-preview {
  max-height: 180px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  border-radius: 6px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  font-size: 12px;
  white-space: pre-wrap;
}
</style>

