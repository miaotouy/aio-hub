<script setup lang="ts">
import { computed } from "vue";
import { resolveChannelCandidates, type ChannelTarget } from "@aiohub/llm-core";
import { useLlmProfilesStore } from "../stores/llmProfiles";
import type { LlmProfile, LlmModelInfo } from "../types";
import { generateUuid } from "@/utils/uuid";
const props = defineProps<{ profile: LlmProfile }>();
const emit = defineEmits<{ "update:profile": [LlmProfile] }>();
const store = useLlmProfilesStore();
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
  store.profiles.filter((p) => p.type !== "virtual")
);
function changeBudget(
  key: "maxAttempts" | "totalTimeoutMs" | "attemptTimeoutMs",
  event: Event,
  multiplier = 1
) {
  emit("update:profile", {
    ...props.profile,
    virtualChannel: {
      ...config.value,
      [key]: Number((event.target as HTMLInputElement).value) * multiplier,
    },
  });
}
function updateModel(index: number, model: LlmModelInfo) {
  const models = [...props.profile.models];
  models[index] = model;
  emit("update:profile", { ...props.profile, models });
}
function addModel() {
  emit("update:profile", {
    ...props.profile,
    virtualChannel: config.value,
    models: [
      ...props.profile.models,
      {
        id: generateUuid(),
        name: "通用对话",
        capabilities: {},
        virtualBindings: { chat: [] },
      },
    ],
  });
}
function updateTargets(index: number, targets: ChannelTarget[]) {
  const originals = targets
    .map((t) =>
      physical.value
        .find((p) => p.id === t.profileId)
        ?.models.find((m) => m.id === t.modelId)
    )
    .filter((m): m is LlmModelInfo => !!m);
  const capabilities: Record<string, unknown> = {};
  if (originals.length)
    for (const [key, value] of Object.entries(originals[0].capabilities ?? {}))
      if (
        typeof value === "boolean" &&
        originals.every(
          (m) =>
            (m.capabilities as Record<string, unknown> | undefined)?.[key] ===
            true
        )
      )
        capabilities[key] = true;
  const models = [...props.profile.models];
  models[index] = {
    ...models[index],
    capabilities,
    virtualBindings: { chat: targets },
  };
  emit("update:profile", {
    ...props.profile,
    virtualChannel: {
      ...config.value,
      members: [
        ...new Set([
          ...config.value.members,
          ...targets.map((t) => t.profileId),
        ]),
      ],
    },
    models,
  });
}
function addTarget(index: number, event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if (!value) return;
  const [profileId, modelId] = JSON.parse(value);
  const targets = props.profile.models[index].virtualBindings?.chat ?? [];
  if (!targets.some((t) => t.profileId === profileId && t.modelId === modelId))
    updateTargets(index, [...targets, { profileId, modelId }]);
  (event.target as HTMLSelectElement).value = "";
}
function move(index: number, position: number, offset: number) {
  const targets = [
    ...(props.profile.models[index].virtualBindings?.chat ?? []),
  ];
  const next = position + offset;
  if (next < 0 || next >= targets.length) return;
  [targets[position], targets[next]] = [targets[next], targets[position]];
  updateTargets(index, targets);
}
function label(target: ChannelTarget) {
  const p = physical.value.find((p) => p.id === target.profileId);
  return (
    (p?.name ?? "待重新绑定的渠道") +
    " / " +
    (p?.models.find((m) => m.id === target.modelId)?.name ?? target.modelId)
  );
}
function status(model: LlmModelInfo) {
  try {
    resolveChannelCandidates({
      profile: props.profile,
      modelId: model.id,
      operation: "chat",
      profiles: store.profiles,
      allowDisabledProfile: true,
    });
    return "主备配置可用";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
</script>
<template>
  <section class="virtual-editor">
    <label
      >最多尝试<input
        type="number"
        min="1"
        max="20"
        :value="config.maxAttempts"
        @change="changeBudget('maxAttempts', $event)"
    /></label>
    <label
      >总时限（秒）<input
        type="number"
        min="1"
        max="3600"
        :value="config.totalTimeoutMs / 1000"
        @change="changeBudget('totalTimeoutMs', $event, 1000)"
    /></label>
    <label
      >单次时限（秒）<input
        type="number"
        min="1"
        max="3600"
        :value="(config.attemptTimeoutMs ?? 60000) / 1000"
        @change="changeBudget('attemptTimeoutMs', $event, 1000)"
    /></label>
    <button type="button" @click="addModel">添加对话模型</button>
    <p v-if="!profile.models.length">
      添加逻辑模型后，按顺序选择主用与备用模型。
    </p>
    <article v-for="(model, index) in profile.models" :key="model.id">
      <label
        >模型名称<input
          :value="model.name"
          @change="
            updateModel(index, {
              ...model,
              name: ($event.target as HTMLInputElement).value,
            })
          "
      /></label>
      <template v-if="model.virtualBindings?.chat">
        <select aria-label="添加主备模型" @change="addTarget(index, $event)">
          <option value="">添加主备模型</option>
          <optgroup v-for="p in physical" :key="p.id" :label="p.name">
            <option
              v-for="m in p.models"
              :key="m.id"
              :value="JSON.stringify([p.id, m.id])"
            >
              {{ m.name || m.id }}
            </option>
          </optgroup>
        </select>
        <div
          v-for="(target, position) in model.virtualBindings.chat"
          :key="JSON.stringify(target)"
          class="candidate"
        >
          <span>{{ position + 1 }}. {{ label(target) }}</span
          ><button
            type="button"
            :disabled="position === 0"
            @click="move(index, position, -1)"
          >
            上移</button
          ><button
            type="button"
            :disabled="position === model.virtualBindings.chat.length - 1"
            @click="move(index, position, 1)"
          >
            下移</button
          ><button
            type="button"
            @click="
              updateTargets(
                index,
                model.virtualBindings!.chat!.filter((_, i) => i !== position)
              )
            "
          >
            移除
          </button>
        </div>
        <p role="status">{{ status(model) }}</p>
      </template>
      <p v-else>该用途的模型映射可在桌面端渠道管理中编辑。</p>
      <button
        type="button"
        @click="
          emit('update:profile', {
            ...profile,
            models: profile.models.filter((_, i) => i !== index),
          })
        "
      >
        删除逻辑模型
      </button>
    </article>
  </section>
</template>
<style scoped>
.virtual-editor {
  display: grid;
  gap: 16px;
  margin: 20px 0;
  color: var(--color-on-surface);
}
label {
  display: grid;
  gap: 8px;
}
input,
select,
button {
  box-sizing: border-box;
  min-height: 44px;
  max-width: 100%;
  font: inherit;
  border: 1px solid var(--color-outline);
  border-radius: 10px;
  padding: 10px;
  background: var(--color-surface-container);
  color: var(--color-on-surface);
}
button:disabled {
  opacity: 0.4;
}
article {
  display: grid;
  gap: 14px;
  border: 1px solid var(--color-outline);
  border-radius: 16px;
  padding: 16px;
}
.candidate {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.candidate span {
  flex: 1 1 100%;
  overflow-wrap: anywhere;
}
p {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0;
}
</style>
