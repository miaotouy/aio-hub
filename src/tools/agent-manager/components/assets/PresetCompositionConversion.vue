<script setup lang="ts">
import { computed, ref } from "vue";
import {
  materializePresetMessage,
  suggestPresetComposition,
  assertPresetComposition,
  presetMessageRevision,
} from "@aiohub/agent-preset-core";
import type { ChatMessageNode } from "@/tools/llm-chat/types";
import type { PresetMessageGroup } from "../../types/agent";
import BaseDialog from "@/components/common/BaseDialog.vue";
import PresetCompositionEditor from "../editors/PresetCompositionEditor.vue";
const props = defineProps<{
  group: PresetMessageGroup;
  messages: ChatMessageNode[];
}>();
const emit = defineEmits<{
  close: [];
  apply: [
    payload: { message: ChatMessageNode; memberIds: string[]; groupId: string },
  ];
}>();
const members = computed(() =>
  props.messages.filter((message) => message.groupId === props.group.id)
);
const sourceId = ref(members.value[0]?.id ?? "");
const enabledMembers = members.value.filter((message) =>
  props.group.enabled === false
    ? message.metadata?.lastEnabledState === true
    : message.isEnabled !== false
);
const chosenIndex =
  enabledMembers.length === 1
    ? members.value.findIndex((message) => message.id === enabledMembers[0].id)
    : null;
const initialMembers = JSON.stringify(members.value.map(presetMessageRevision));
const error = ref("");
const accepted = ref(false);
let texts: string[] = [];
try {
  texts = members.value.map(
    (message) => materializePresetMessage(message).content
  );
} catch (cause) {
  error.value = (cause as Error).message;
}
const draft = ref(suggestPresetComposition(texts, chosenIndex));
const outer = (message: ChatMessageNode) =>
  JSON.stringify([
    message.role,
    message.injectionStrategy ?? null,
    message.modelMatch ?? null,
    message.presetAttachments ?? [],
  ]);
const conflicts = computed(() => new Set(members.value.map(outer)).size > 1);
/** Composition members are flattened to their current body; inner alternatives cannot be restored. */
const hasNested = computed(() =>
  members.value.some((message) => !!message.presetComposition)
);
const interleaved = computed(() => {
  const positions = props.messages.flatMap((message, index) =>
    message.groupId === props.group.id ? [index] : []
  );
  return (
    positions.length > 1 &&
    positions[positions.length - 1] - positions[0] + 1 !== positions.length
  );
});
const injectionLabels: Record<string, string> = {
  default: "跟随列表",
  depth: "深度注入",
  advanced_depth: "高级深度",
  anchor: "锚点注入",
};
function memberMeta(message: ChatMessageNode): string {
  return [
    message.role,
    injectionLabels[message.injectionStrategy?.type ?? "default"] ?? "跟随列表",
    message.modelMatch?.enabled ? "模型限定" : "",
    message.presetComposition ? "组合消息" : "",
    message.presetAttachments?.length
      ? `${message.presetAttachments.length} 个附件`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
const validMembers = computed(
  () =>
    members.value.length >= 2 &&
    members.value.every(
      (message) => !message.type || message.type === "message"
    )
);
function apply() {
  try {
    if (
      JSON.stringify(members.value.map(presetMessageRevision)) !==
      initialMembers
    )
      throw new Error("原消息已更新，请重新打开转换预览");
    assertPresetComposition(draft.value);
    const source = members.value.find(
      (message) => message.id === sourceId.value
    );
    if (!source || !validMembers.value) return;
    const message: ChatMessageNode = {
      ...JSON.parse(JSON.stringify(source)),
      id: members.value[0].id,
      name: props.group.name,
      groupId: undefined,
      content: "",
      presetComposition: draft.value,
      isEnabled: props.group.enabled !== false && enabledMembers.length > 0,
    };
    if (message.metadata) {
      delete message.metadata.lastEnabledState;
      delete message.metadata.lastCalcHash;
      delete message.metadata.contentTokens;
    }
    emit("apply", {
      message,
      memberIds: members.value.map((item) => item.id),
      groupId: props.group.id,
    });
  } catch (cause) {
    error.value = (cause as Error).message;
  }
}
</script>
<template>
  <BaseDialog
    :model-value="true"
    title="转换为组合消息"
    width="84vw"
    height="86vh"
    :close-on-backdrop-click="false"
    @update:model-value="emit('close')"
  >
    <template #content>
      <div class="conversion-workspace">
        <div class="conversion-summary">
          <div class="summary-title">
            <strong>{{ group.name }}</strong>
            <span>{{ members.length }} 条消息 → 1 条组合消息</span>
          </div>
          <div class="summary-source">
            <span>外层设置沿用</span>
            <el-select
              v-model="sourceId"
              size="small"
              style="width: 220px"
              aria-label="转换时沿用的消息设置"
            >
              <el-option
                v-for="(message, index) in members"
                :key="message.id"
                :label="`版本 ${index + 1} · ${message.name || message.role}`"
                :value="message.id"
              />
            </el-select>
          </div>
        </div>
        <div class="original-members">
          <div
            v-for="(message, index) in members"
            :key="message.id"
            class="member-card"
            :class="{ source: message.id === sourceId }"
          >
            <div class="member-title">
              <span class="member-index">版本 {{ index + 1 }}</span>
              <span class="member-name">{{
                message.name || message.role
              }}</span>
            </div>
            <div class="member-meta">{{ memberMeta(message) }}</div>
          </div>
        </div>
        <div v-if="!validMembers" class="notice" role="alert">
          请选择至少包含两条普通消息的单选组进行转换。
        </div>
        <template v-else>
          <div v-if="conflicts || interleaved || hasNested" class="notice">
            <p v-if="conflicts">
              成员的角色、注入、匹配或附件设置有差异。合并后的整条消息使用上方所选消息的设置。
            </p>
            <p v-if="interleaved">
              成员之间穿插了其他消息。组合消息将放在第一个成员的位置，其余消息保持原顺序。
            </p>
            <p v-if="hasNested">
              成员中包含组合消息。转换后只保留其当前选中的正文，内部其他版本与停用片段不再保留。
            </p>
            <el-checkbox v-model="accepted" size="small"
              >已确认上述转换影响</el-checkbox
            >
          </div>
          <PresetCompositionEditor v-if="!error" v-model="draft" />
        </template>
        <div v-if="error" class="notice danger" role="alert">{{ error }}</div>
      </div>
    </template>
    <template #footer
      ><el-button @click="emit('close')">返回</el-button
      ><el-button
        type="primary"
        :disabled="
          !validMembers ||
          !!error ||
          ((conflicts || interleaved || hasNested) && !accepted)
        "
        @click="apply"
        >应用转换</el-button
      ></template
    >
  </BaseDialog>
</template>
<style scoped>
.conversion-workspace {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.conversion-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  flex-shrink: 0;
}
.summary-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}
.summary-title strong {
  font-size: 15px;
  color: var(--el-text-color-primary);
}
.summary-title span,
.summary-source span {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.summary-source {
  display: flex;
  align-items: center;
  gap: 8px;
}
.original-members {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  flex-shrink: 0;
  max-height: 140px;
  overflow-y: auto;
}
.member-card {
  min-width: 0;
  padding: 8px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
}
.member-card.source {
  border-color: var(--el-color-primary);
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
}
.member-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
}
.member-index {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.member-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-primary);
}
.member-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  flex-shrink: 0;
  padding: 8px 12px;
  border: var(--border-width) solid var(--el-color-warning-light-5);
  border-radius: 6px;
  background: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-color-warning);
}
.notice p {
  margin: 0;
}
.notice.danger {
  border-color: var(--el-color-danger-light-5);
  background: color-mix(in srgb, var(--el-color-danger) 10%, transparent);
  color: var(--el-color-danger);
}
.conversion-workspace :deep(.composition-workspace) {
  flex: 1;
  min-height: 360px;
}
</style>
