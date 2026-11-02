<script setup lang="ts">
import { computed } from "vue";
import { resolveChannelCandidates, type LlmOperation } from "@aiohub/llm-core";
import type { LlmProfile, LlmModelInfo } from "@/types/llm-profiles";
const props = defineProps<{ profile: LlmProfile; profiles: LlmProfile[] }>();
const emit = defineEmits<{ "update:profile": [LlmProfile] }>();
const config = computed(
  () =>
    props.profile.virtualChannel ?? {
      mode: "failover" as const,
      members: [],
      maxAttempts: 3,
      totalTimeoutMs: 180000,
      attemptTimeoutMs: 60000,
    }
);
const physical = computed(() =>
  props.profiles.filter((p) => p.type !== "virtual")
);
const operations: Array<{ value: LlmOperation; label: string }> = [
  { value: "chat", label: "对话" },
  { value: "embedding", label: "向量" },
  { value: "decision", label: "决策" },
];
function updateConfig(key: string, value: unknown) {
  emit("update:profile", {
    ...props.profile,
    virtualChannel: { ...config.value, [key]: value },
  });
}
function updateModel(index: number, model: LlmModelInfo) {
  const models = [...props.profile.models];
  models[index] = model;
  emit("update:profile", { ...props.profile, models });
}
function operationOf(model: LlmModelInfo): LlmOperation {
  return (
    (Object.keys(model.virtualBindings ?? {})[0] as LlmOperation) ?? "chat"
  );
}
function changeOperation(index: number, operation: LlmOperation) {
  updateModel(index, {
    ...props.profile.models[index],
    virtualBindings: { [operation]: [] },
    capabilities: operationCapabilities(operation),
  });
}
function operationCapabilities(operation: LlmOperation) {
  return operation === "chat"
    ? {}
    : {
        [{
          image: "imageGeneration",
          video: "videoGeneration",
          audio: "audioGeneration",
          music: "musicGeneration",
          embedding: "embedding",
          rerank: "rerank",
          decision: "decision",
        }[operation]!]: true,
      };
}
function addModel() {
  emit("update:profile", {
    ...props.profile,
    virtualChannel: config.value,
    models: [
      ...props.profile.models,
      {
        id: crypto.randomUUID(),
        name: "通用对话",
        virtualBindings: { chat: [] },
        capabilities: {},
      },
    ],
  });
}
function updateCandidates(index: number, values: string[]) {
  const model = props.profile.models[index];
  const operation = operationOf(model);
  const targets = values.map((value) => {
    const [profileId, modelId] = JSON.parse(value) as [string, string];
    return { profileId, modelId };
  });
  const members = Array.from(
    new Set([...config.value.members, ...targets.map((t) => t.profileId)])
  );
  const originals = targets
    .map((t) =>
      props.profiles
        .find((p) => p.id === t.profileId)
        ?.models.find((m) => m.id === t.modelId)
    )
    .filter((m): m is LlmModelInfo => !!m);
  const capabilities = { ...operationCapabilities(operation) } as Record<
    string,
    unknown
  >;
  if (originals.length)
    for (const [key, value] of Object.entries(
      originals[0].capabilities ?? {}
    )) {
      if (
        typeof value === "boolean" &&
        originals.every(
          (m) =>
            (m.capabilities as Record<string, unknown> | undefined)?.[key] ===
            true
        )
      )
        capabilities[key] = true;
    }
  const models = [...props.profile.models];
  models[index] = {
    ...model,
    virtualBindings: { [operation]: targets },
    capabilities,
  } as LlmModelInfo;
  emit("update:profile", {
    ...props.profile,
    virtualChannel: { ...config.value, members },
    models,
  });
}
function valuesOf(model: LlmModelInfo) {
  return (model.virtualBindings?.[operationOf(model)] ?? []).map((t) =>
    JSON.stringify([t.profileId, t.modelId])
  );
}
function status(model: LlmModelInfo) {
  try {
    resolveChannelCandidates({
      profile: props.profile,
      modelId: model.id,
      operation: operationOf(model),
      profiles: props.profiles,
      allowDisabledProfile: true,
    });
    return "主备配置可用";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
function reorder(index: number, position: number, offset: number) {
  const values = valuesOf(props.profile.models[index]);
  const next = position + offset;
  if (next < 0 || next >= values.length) return;
  [values[position], values[next]] = [values[next], values[position]];
  updateCandidates(index, values);
}
function label(value: string) {
  const [pid, mid] = JSON.parse(value);
  const p = props.profiles.find((p) => p.id === pid);
  return (
    (p?.name ?? "待重新绑定的渠道") +
    " / " +
    (p?.models.find((m) => m.id === mid)?.name ?? mid)
  );
}
</script>
<template>
  <section class="virtual-editor">
    <div class="budget-row">
      <el-form-item label="最多尝试"
        ><el-input-number
          :model-value="config.maxAttempts"
          :min="1"
          :max="20"
          @update:model-value="updateConfig('maxAttempts', $event)"
      /></el-form-item>
      <el-form-item label="总时限（秒）"
        ><el-input-number
          :model-value="config.totalTimeoutMs / 1000"
          :min="1"
          :max="3600"
          @update:model-value="
            updateConfig('totalTimeoutMs', Number($event) * 1000)
          "
      /></el-form-item>
      <el-form-item label="单次时限（秒）"
        ><el-input-number
          :model-value="(config.attemptTimeoutMs ?? 60000) / 1000"
          :min="1"
          :max="3600"
          @update:model-value="
            updateConfig('attemptTimeoutMs', Number($event) * 1000)
          "
      /></el-form-item>
    </div>
    <el-form-item label="成员渠道"
      ><el-select
        :model-value="config.members"
        multiple
        placeholder="选择已有渠道"
        @update:model-value="updateConfig('members', $event)"
        ><el-option
          v-for="p in physical"
          :key="p.id"
          :label="p.name + (p.enabled ? '' : '（已停用）')"
          :value="p.id" /></el-select
    ></el-form-item>
    <div class="model-heading">
      <strong>逻辑模型</strong><el-button @click="addModel">添加模型</el-button>
    </div>
    <p v-if="!profile.models.length" class="hint">
      添加逻辑模型，再选择主备模型。
    </p>
    <article
      v-for="(model, index) in profile.models"
      :key="model.id"
      class="logical-model"
    >
      <div class="model-heading">
        <el-input
          :model-value="model.name"
          aria-label="逻辑模型名称"
          @update:model-value="updateModel(index, { ...model, name: $event })"
        /><el-button
          type="danger"
          text
          @click="
            emit('update:profile', {
              ...profile,
              models: profile.models.filter((_, i) => i !== index),
            })
          "
          >移除</el-button
        >
      </div>
      <el-form-item label="用途"
        ><el-select
          :model-value="operationOf(model)"
          @update:model-value="changeOperation(index, $event)"
          ><el-option
            v-for="op in operations"
            :key="op.value"
            :label="op.label"
            :value="op.value" /></el-select
      ></el-form-item>
      <el-form-item label="主备模型"
        ><el-select
          :model-value="valuesOf(model)"
          multiple
          filterable
          placeholder="选择模型，按下方顺序尝试"
          @update:model-value="updateCandidates(index, $event)"
          ><el-option-group
            v-for="p in physical.filter((p) => config.members.includes(p.id))"
            :key="p.id"
            :label="p.name"
            ><el-option
              v-for="m in p.models"
              :key="m.id"
              :label="m.name || m.id"
              :value="
                JSON.stringify([p.id, m.id])
              " /></el-option-group></el-select
      ></el-form-item>
      <div
        v-for="(value, position) in valuesOf(model)"
        :key="value"
        class="candidate-row"
      >
        <span>{{ position + 1 }}. {{ label(value) }}</span
        ><el-button
          text
          :disabled="position === 0"
          @click="reorder(index, position, -1)"
          >上移</el-button
        ><el-button
          text
          :disabled="position === valuesOf(model).length - 1"
          @click="reorder(index, position, 1)"
          >下移</el-button
        >
      </div>
      <p class="hint" role="status">{{ status(model) }}</p>
    </article>
  </section>
</template>
<style scoped>
.virtual-editor {
  display: grid;
  gap: 16px;
  width: 100%;
}
.budget-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.model-heading,
.candidate-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.model-heading {
  justify-content: space-between;
}
.logical-model {
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  display: grid;
  gap: 12px;
}
.candidate-row span {
  flex: 1;
  overflow-wrap: anywhere;
}
.hint {
  color: var(--text-color-secondary);
  margin: 0;
  font-size: 13px;
}
.el-select {
  width: 100%;
}
</style>
