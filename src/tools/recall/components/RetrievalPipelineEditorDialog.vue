<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->

<script setup lang="ts">
import { computed, ref, toRaw, watch } from "vue";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { inspectCustomRetrievalPipeline } from "../services/retrievalPipeline";
import type {
  RecallPipelineCompileResult,
  RecallRetrievalModuleInfo,
  RecallRetrievalPhase,
  RecallRetrievalPipelineNodeV1,
  RecallRetrievalPipelineV1,
} from "../types/pipeline";

const props = defineProps<{
  modelValue: boolean;
  pipeline: RecallRetrievalPipelineV1 | null;
  modules: RecallRetrievalModuleInfo[];
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
  (event: "apply", value: RecallRetrievalPipelineV1): void;
}>();

const PHASES: RecallRetrievalPhase[] = [
  "prepare",
  "retrieve",
  "normalize",
  "fuse",
  "rerank",
  "filter",
  "finalize",
];
const phaseLabels: Record<RecallRetrievalPhase, string> = {
  prepare: "准备",
  retrieve: "召回",
  normalize: "归一化",
  fuse: "融合",
  rerank: "重排",
  filter: "过滤",
  finalize: "收尾",
};

const activePhase = ref<RecallRetrievalPhase>("prepare");
const draft = ref<RecallRetrievalPipelineV1 | null>(null);
const compilation = ref<RecallPipelineCompileResult | null>(null);
const compiling = ref(false);
const compileError = ref("");
let compileGeneration = 0;
let compileTimer: ReturnType<typeof setTimeout> | undefined;

const moduleById = computed(
  () => new Map(props.modules.map((module) => [module.id, module]))
);
const modulesByPhase = computed(
  () =>
    Object.fromEntries(
      PHASES.map((phase) => [
        phase,
        props.modules.filter((module) => module.phase === phase),
      ])
    ) as Record<RecallRetrievalPhase, RecallRetrievalModuleInfo[]>
);
const nodesByPhase = computed(() => {
  const grouped = Object.fromEntries(
    PHASES.map((phase) => [phase, []])
  ) as unknown as Record<RecallRetrievalPhase, RecallRetrievalPipelineNodeV1[]>;
  for (const node of draft.value?.nodes ?? []) {
    const phase = moduleById.value.get(node.moduleId)?.phase;
    if (phase) grouped[phase].push(node);
  }
  return grouped;
});
const canApply = computed(() =>
  Boolean(draft.value && compilation.value?.valid && !compiling.value)
);

function clonePipeline(value: RecallRetrievalPipelineV1) {
  return structuredClone(toRaw(value));
}

function propertySchema(moduleId: string, key: string) {
  const schema = moduleById.value.get(moduleId)?.parameterSchema;
  const properties = schema?.properties;
  if (!properties || typeof properties !== "object") return {};
  const property = (properties as Record<string, unknown>)[key];
  return property && typeof property === "object"
    ? (property as Record<string, unknown>)
    : {};
}

function parameterKeys(moduleId: string) {
  const schema = moduleById.value.get(moduleId)?.parameterSchema;
  const properties = schema?.properties;
  return properties && typeof properties === "object"
    ? Object.keys(properties)
    : [];
}

function numericMinimum(schema: Record<string, unknown>) {
  if (typeof schema.minimum === "number") return schema.minimum;
  if (typeof schema.exclusiveMinimum === "number") {
    return schema.exclusiveMinimum + 0.01;
  }
  return undefined;
}

function numericMaximum(schema: Record<string, unknown>) {
  return typeof schema.maximum === "number" ? schema.maximum : undefined;
}

function enumValues(schema: Record<string, unknown>) {
  return Array.isArray(schema.enum) ? schema.enum : [];
}

function setParam(
  node: RecallRetrievalPipelineNodeV1,
  key: string,
  value: unknown
) {
  node.params[key] = value;
}

function defaultParams(module: RecallRetrievalModuleInfo) {
  const result: Record<string, unknown> = {};
  const keys = parameterKeys(module.id);
  for (const key of keys) {
    const schema = propertySchema(module.id, key);
    if (schema.default !== undefined) result[key] = schema.default;
    else if (Array.isArray(schema.enum)) result[key] = schema.enum[0];
    else if (schema.type === "integer") {
      result[key] = Math.ceil(numericMinimum(schema) ?? 1);
    } else if (schema.type === "number") {
      result[key] = numericMinimum(schema) ?? 0;
    } else if (schema.type === "boolean") result[key] = false;
    else if (schema.type === "string") result[key] = "";
  }
  const positiveSum = module.parameterSchema.xPositiveNumberSum;
  if (Array.isArray(positiveSum) && typeof positiveSum[0] === "string") {
    result[positiveSum[0]] = 1;
  }
  return result;
}

function uniqueNodeId(moduleId: string) {
  const existing = new Set(draft.value?.nodes.map((node) => node.id));
  let index = 1;
  let candidate = moduleId;
  while (existing.has(candidate)) candidate = `${moduleId}-${++index}`;
  return candidate;
}

function addNode(phase: RecallRetrievalPhase) {
  if (!draft.value) return;
  const module = modulesByPhase.value[phase][0];
  if (!module) return;
  draft.value.nodes.push({
    id: uniqueNodeId(module.id),
    moduleId: module.id,
    enabled: true,
    dependsOn: [],
    params: defaultParams(module),
    failurePolicy: "abort",
  });
}

function removeNode(node: RecallRetrievalPipelineNodeV1) {
  if (!draft.value) return;
  draft.value.nodes = draft.value.nodes
    .filter((item) => item !== node)
    .map((item) => ({
      ...item,
      dependsOn: item.dependsOn?.filter((id) => id !== node.id),
    }));
}

function moveNode(node: RecallRetrievalPipelineNodeV1, direction: -1 | 1) {
  if (!draft.value) return;
  const phaseNodes =
    nodesByPhase.value[moduleById.value.get(node.moduleId)?.phase ?? "prepare"];
  const phaseIndex = phaseNodes.indexOf(node);
  const target = phaseNodes[phaseIndex + direction];
  if (!target) return;
  const index = draft.value.nodes.indexOf(node);
  const targetIndex = draft.value.nodes.indexOf(target);
  [draft.value.nodes[index], draft.value.nodes[targetIndex]] = [
    draft.value.nodes[targetIndex],
    draft.value.nodes[index],
  ];
}

function changeModule(node: RecallRetrievalPipelineNodeV1, moduleId: string) {
  const module = moduleById.value.get(moduleId);
  if (!module) return;
  node.moduleId = moduleId;
  node.params = defaultParams(module);
}

async function compileDraft() {
  if (!draft.value) return;
  const generation = ++compileGeneration;
  compiling.value = true;
  compileError.value = "";
  try {
    const value = await inspectCustomRetrievalPipeline(draft.value);
    if (generation !== compileGeneration) return;
    compilation.value = value.result;
  } catch (error) {
    if (generation !== compileGeneration) return;
    compilation.value = null;
    compileError.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (generation === compileGeneration) compiling.value = false;
  }
}

function scheduleCompile() {
  if (compileTimer) clearTimeout(compileTimer);
  compileTimer = setTimeout(compileDraft, 250);
}

function applyDraft() {
  if (!draft.value || !canApply.value) return;
  emit("apply", clonePipeline(draft.value));
  emit("update:modelValue", false);
}

watch(
  () => props.modelValue,
  (visible) => {
    if (!visible || !props.pipeline) return;
    draft.value = clonePipeline(props.pipeline);
    compilation.value = null;
    compileError.value = "";
    activePhase.value = "prepare";
    void compileDraft();
  }
);

watch(draft, scheduleCompile, { deep: true });
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    title="检索管线编辑器"
    width="min(1080px, 94vw)"
    height="min(760px, 88vh)"
    :close-on-backdrop-click="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #content>
      <div
        v-if="draft"
        class="pipeline-editor"
        data-testid="recall-pipeline-editor"
      >
        <div class="pipeline-toolbar">
          <label>
            <span>候选预算</span>
            <el-input-number
              v-model="draft.candidateBudget"
              :min="1"
              :max="10000"
              controls-position="right"
            />
          </label>
          <label>
            <span>扩展预算</span>
            <el-input-number
              v-model="draft.expansionBudget"
              :min="0"
              :max="10000"
              controls-position="right"
            />
          </label>
          <el-tag :type="compilation?.valid ? 'success' : 'danger'">
            {{ compiling ? "编译中" : compilation?.valid ? "有效" : "无效" }}
          </el-tag>
          <code>{{ compilation?.configHash?.slice(0, 12) }}</code>
        </div>

        <el-tabs v-model="activePhase" class="phase-tabs">
          <el-tab-pane
            v-for="phase in PHASES"
            :key="phase"
            :name="phase"
            :label="`${phaseLabels[phase]} ${nodesByPhase[phase].length}`"
          >
            <div class="phase-header">
              <strong>{{ phaseLabels[phase] }}</strong>
              <el-button
                :icon="Plus"
                :disabled="!modulesByPhase[phase].length"
                @click="addNode(phase)"
              >
                添加模块
              </el-button>
            </div>

            <div class="node-list">
              <div
                v-for="(node, index) in nodesByPhase[phase]"
                :key="node.id"
                class="node-row"
              >
                <div class="node-main">
                  <el-switch v-model="node.enabled" />
                  <el-input v-model="node.id" class="node-id" />
                  <el-select
                    :model-value="node.moduleId"
                    class="module-select"
                    @update:model-value="changeModule(node, $event)"
                  >
                    <el-option
                      v-for="module in modulesByPhase[phase]"
                      :key="module.id"
                      :label="module.id"
                      :value="module.id"
                    />
                  </el-select>
                  <el-select
                    v-model="node.dependsOn"
                    multiple
                    collapse-tags
                    class="dependency-select"
                    placeholder="依赖"
                  >
                    <el-option
                      v-for="candidate in draft.nodes.filter(
                        (item) => item !== node
                      )"
                      :key="candidate.id"
                      :label="candidate.id"
                      :value="candidate.id"
                    />
                  </el-select>
                  <el-select v-model="node.failurePolicy" class="policy-select">
                    <el-option label="中止" value="abort" />
                    <el-option label="跳过" value="skip" />
                  </el-select>
                  <el-button
                    circle
                    plain
                    :icon="ChevronUp"
                    title="上移"
                    :disabled="index === 0"
                    @click="moveNode(node, -1)"
                  />
                  <el-button
                    circle
                    plain
                    :icon="ChevronDown"
                    title="下移"
                    :disabled="index === nodesByPhase[phase].length - 1"
                    @click="moveNode(node, 1)"
                  />
                  <el-button
                    circle
                    plain
                    type="danger"
                    :icon="Trash2"
                    title="删除模块"
                    @click="removeNode(node)"
                  />
                </div>

                <div
                  v-if="parameterKeys(node.moduleId).length"
                  class="parameter-grid"
                >
                  <label v-for="key in parameterKeys(node.moduleId)" :key="key">
                    <span>{{ key }}</span>
                    <el-select
                      v-if="
                        enumValues(propertySchema(node.moduleId, key)).length
                      "
                      :model-value="node.params[key]"
                      @update:model-value="setParam(node, key, $event)"
                    >
                      <el-option
                        v-for="value in enumValues(
                          propertySchema(node.moduleId, key)
                        )"
                        :key="String(value)"
                        :label="String(value)"
                        :value="value"
                      />
                    </el-select>
                    <el-input-number
                      v-else-if="
                        ['integer', 'number'].includes(
                          String(propertySchema(node.moduleId, key).type)
                        )
                      "
                      :model-value="Number(node.params[key])"
                      :min="numericMinimum(propertySchema(node.moduleId, key))"
                      :max="numericMaximum(propertySchema(node.moduleId, key))"
                      :step="
                        propertySchema(node.moduleId, key).type === 'integer'
                          ? 1
                          : 0.05
                      "
                      controls-position="right"
                      @update:model-value="setParam(node, key, $event)"
                    />
                    <el-switch
                      v-else-if="
                        propertySchema(node.moduleId, key).type === 'boolean'
                      "
                      :model-value="Boolean(node.params[key])"
                      @update:model-value="setParam(node, key, $event)"
                    />
                    <el-input
                      v-else
                      :model-value="String(node.params[key] ?? '')"
                      @update:model-value="setParam(node, key, $event)"
                    />
                  </label>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>

        <div v-if="compileError" class="compile-error">{{ compileError }}</div>
        <div v-if="compilation?.issues.length" class="issue-list">
          <div
            v-for="issue in compilation.issues"
            :key="`${issue.nodeId}:${issue.fieldPath}:${issue.code}`"
          >
            <code>{{ issue.code }}</code>
            <span>{{ issue.nodeId || "pipeline" }}</span>
            <span>{{ issue.message }}</span>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <el-button
        data-testid="recall-pipeline-editor-cancel"
        @click="emit('update:modelValue', false)"
      >
        取消
      </el-button>
      <el-button :loading="compiling" @click="compileDraft">编译</el-button>
      <el-button
        type="primary"
        data-testid="recall-pipeline-editor-apply"
        :disabled="!canApply"
        @click="applyDraft"
      >
        应用
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.pipeline-editor {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
}

.pipeline-toolbar,
.pipeline-toolbar label,
.phase-header,
.node-main,
.parameter-grid label,
.issue-list > div {
  display: flex;
  align-items: center;
}

.pipeline-toolbar {
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.pipeline-toolbar label,
.parameter-grid label {
  gap: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.pipeline-toolbar :deep(.el-input-number) {
  width: 116px;
}

.pipeline-toolbar code {
  margin-left: auto;
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.phase-tabs {
  min-height: 0;
  overflow: hidden;
}

.phase-tabs :deep(.el-tabs__content),
.phase-tabs :deep(.el-tab-pane) {
  height: calc(100% - 4px);
  min-height: 0;
}

.phase-tabs :deep(.el-tab-pane) {
  overflow: auto;
}

.phase-header {
  position: sticky;
  z-index: 1;
  top: 0;
  justify-content: space-between;
  min-height: 42px;
  background: var(--card-bg);
}

.node-list {
  min-height: 80px;
}

.node-row {
  padding: 10px 0;
  border-bottom: var(--border-width) solid var(--border-color);
}

.node-main {
  gap: 8px;
}

.node-id {
  width: 160px;
}

.module-select {
  width: 200px;
}

.dependency-select {
  min-width: 180px;
  flex: 1;
}

.policy-select {
  width: 84px;
}

.parameter-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 14px;
  padding: 10px 0 0 34px;
}

.parameter-grid label > span {
  min-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.parameter-grid :deep(.el-input),
.parameter-grid :deep(.el-select),
.parameter-grid :deep(.el-input-number) {
  width: 100%;
}

.compile-error,
.issue-list {
  color: var(--el-color-danger);
  font-size: 12px;
}

.issue-list {
  max-height: 110px;
  overflow: auto;
  border-top: var(--border-width) solid var(--border-color);
}

.issue-list > div {
  min-height: 28px;
  gap: 10px;
}

.issue-list code,
.issue-list span:first-of-type {
  flex: 0 0 auto;
}

@media (max-width: 900px) {
  .node-main {
    align-items: stretch;
    flex-wrap: wrap;
  }

  .dependency-select {
    flex-basis: 100%;
  }

  .parameter-grid {
    grid-template-columns: 1fr;
  }
}
</style>
