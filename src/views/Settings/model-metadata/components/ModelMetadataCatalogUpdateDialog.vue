<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
-->

<template>
  <BaseDialog
    :model-value="modelValue"
    title="内置目录更新预览"
    width="min(1100px, 92vw)"
    max-height="82vh"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #content>
      <div class="catalog-update-dialog">
        <p class="dialog-intro">
          目录更新只会修改规则目录，不会自动改写已保存模型。冲突项和已删除规则需要明确选择后才能应用。
        </p>

        <el-empty
          v-if="diffs.length === 0"
          description="当前目录已经是最新状态"
        />

        <div v-else class="diff-list">
          <article v-for="diff in diffs" :key="diff.id" class="diff-item">
            <header class="diff-header">
              <code>{{ diff.id }}</code>
              <el-tag :type="statusTagType(diff.status)" size="small">
                {{ statusLabel(diff.status) }}
              </el-tag>
            </header>

            <template v-if="diff.status === 'conflict'">
              <p class="diff-description">
                上游目录与本地覆盖同时修改了以下字段，请选择保留本地值还是采用上游值。
              </p>
              <div class="field-diffs">
                <div
                  v-for="field in conflictFields(diff)"
                  :key="field.path"
                  class="field-diff field-conflict"
                >
                  <code>{{ field.path }}</code>
                  <span>本地：{{ formatValue(field.local) }}</span>
                  <span>上游：{{ formatValue(field.incoming) }}</span>
                  <el-radio-group
                    v-model="selections[selectionKey(diff.id, field.path)]"
                    class="resolution-options"
                  >
                    <el-radio value="keepLocal">保留本地值</el-radio>
                    <el-radio value="acceptIncoming">采用上游值</el-radio>
                  </el-radio-group>
                </div>
              </div>
            </template>

            <template v-else-if="diff.status === 'removed'">
              <p class="diff-description">
                该内置规则已从新目录移除。可以随目录删除，或保留为用户自定义规则。
              </p>
              <el-radio-group
                v-model="selections[diff.id]"
                class="resolution-options"
              >
                <el-radio value="acceptIncoming">随目录删除</el-radio>
                <el-radio value="keepAsCustom">保留为自定义规则</el-radio>
              </el-radio-group>
            </template>

            <template v-else>
              <p class="diff-description">
                {{ passiveDescription(diff.status) }}
              </p>
              <div v-if="changedFields(diff).length" class="field-diffs">
                <div
                  v-for="field in changedFields(diff)"
                  :key="field.path"
                  class="field-diff"
                >
                  <code>{{ field.path }}</code>
                  <span>当前：{{ formatValue(field.local) }}</span>
                  <span>上游：{{ formatValue(field.incoming) }}</span>
                </div>
              </div>
            </template>
          </article>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="dialog-actions">
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button type="primary" :disabled="hasPendingChoices" @click="submit">
          应用已确认更新
        </el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  BuiltinRuleDiff,
  CatalogUpdateSelection,
} from "@aiohub/model-metadata-core";
import type { ModelMetadataProperties } from "@/types/model-metadata";

const props = defineProps<{
  modelValue: boolean;
  diffs: BuiltinRuleDiff<ModelMetadataProperties>[];
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
  (event: "apply", selections: CatalogUpdateSelection[]): void;
}>();

const selections = ref<Record<string, CatalogUpdateSelection["resolution"]>>(
  {}
);

watch(
  () => [props.modelValue, props.diffs] as const,
  ([visible]) => {
    if (!visible) return;
    selections.value = {};
  },
  { immediate: true }
);

const hasPendingChoices = computed(() =>
  props.diffs.some((diff) => {
    if (diff.status === "removed") return !selections.value[diff.id];
    if (diff.status !== "conflict") return false;
    return conflictFields(diff).some(
      (field) => !selections.value[selectionKey(diff.id, field.path)]
    );
  })
);

function selectionKey(id: string, path?: string) {
  return path ? `${id}:${path}` : id;
}

function changedFields(diff: BuiltinRuleDiff<ModelMetadataProperties>) {
  return diff.fields.filter((field) => field.kind !== "unchanged");
}

function conflictFields(diff: BuiltinRuleDiff<ModelMetadataProperties>) {
  return diff.fields.filter((field) => field.kind === "conflict");
}

function statusLabel(
  status: BuiltinRuleDiff<ModelMetadataProperties>["status"]
) {
  return {
    added: "新增",
    removed: "已删除",
    upstream: "上游更新",
    local: "本地覆盖",
    conflict: "存在冲突",
    unchanged: "无变化",
  }[status];
}

function statusTagType(
  status: BuiltinRuleDiff<ModelMetadataProperties>["status"]
): "success" | "info" | "warning" | "danger" | "" {
  const types: Record<
    BuiltinRuleDiff<ModelMetadataProperties>["status"],
    "success" | "info" | "warning" | "danger" | ""
  > = {
    added: "success",
    removed: "warning",
    upstream: "success",
    local: "info",
    conflict: "danger",
    unchanged: "",
  };
  return types[status];
}

function passiveDescription(
  status: BuiltinRuleDiff<ModelMetadataProperties>["status"]
) {
  return {
    added: "将新增为内置规则。",
    upstream: "将采用上游目录的字段更新。",
    local: "本地覆盖保持不变，上游基线会更新。",
    unchanged: "规则没有变化。",
    removed: "",
    conflict: "",
  }[status];
}

function formatValue(value: unknown): string {
  if (value === undefined) return "（未设置）";
  if (typeof value === "string") return value || "（空字符串）";
  return JSON.stringify(value);
}

function submit() {
  if (hasPendingChoices.value) return;
  const resolved: CatalogUpdateSelection[] = [];
  for (const diff of props.diffs) {
    if (diff.status === "removed") {
      resolved.push({ id: diff.id, resolution: selections.value[diff.id] });
      continue;
    }
    if (diff.status !== "conflict") continue;
    for (const field of conflictFields(diff)) {
      resolved.push({
        id: diff.id,
        path: field.path,
        resolution: selections.value[selectionKey(diff.id, field.path)],
      });
    }
  }
  emit("apply", resolved);
}
</script>

<style scoped>
.catalog-update-dialog {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
}

.dialog-intro,
.diff-description {
  margin: 0;
  color: var(--text-color-light);
  line-height: 1.6;
}

.diff-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: min(56vh, 620px);
  overflow: auto;
  padding-right: 0.25rem;
}

.diff-item {
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--border-radius-base);
  background: var(--container-bg);
  padding: 0.875rem;
}

.diff-header,
.field-diff,
.dialog-actions {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.diff-header {
  justify-content: space-between;
  margin-bottom: 0.625rem;
}

.diff-header code,
.field-diff code {
  overflow-wrap: anywhere;
}

.field-diffs {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.625rem;
}

.field-diff {
  align-items: flex-start;
  flex-wrap: wrap;
  padding: 0.5rem;
  border-radius: var(--border-radius-small);
  background: var(--background-color-secondary);
  color: var(--text-color-light);
  font-size: 0.875rem;
}

.field-diff code {
  color: var(--primary-color);
  min-width: 12rem;
}

.resolution-options {
  margin-top: 0.75rem;
}

.dialog-actions {
  justify-content: flex-end;
}

@media (max-width: 640px) {
  .field-diff code {
    min-width: 100%;
  }
}
</style>
