<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-vue-next";
import {
  compilePresetComposition,
  presetPartContent,
  selectedPresetOptions,
  applyPresetCompositionOperation,
  type PresetCompositionOperation,
  type PresetChoicePart,
  type PresetPart,
} from "@aiohub/agent-preset-core";
import type { ChatMessageNode } from "@/tools/llm-chat/types";
import type { PresetMessageGroup } from "../../types/agent";
import PresetMessageCard from "./PresetMessageCard.vue";

const props = defineProps<{
  message: ChatMessageNode;
  compact?: boolean;
  tokenCount?: number;
  modelId?: string;
  presetGroups?: PresetMessageGroup[];
  saveMessage: (
    message: ChatMessageNode,
    previous: ChatMessageNode
  ) => Promise<void>;
}>();
const emit = defineEmits<{
  edit: [partId?: string];
  duplicate: [];
  copy: [];
  paste: [];
  remove: [];
  toggle: [];
  radio: [];
  "group-command": [command: string];
}>();
const composition = computed(() => props.message.presetComposition!);
const group = computed(() =>
  props.presetGroups?.find((item) => item.id === props.message.groupId)
);
const disabled = computed(
  () => props.message.isEnabled === false || group.value?.enabled === false
);
const expanded = ref(false);
const detailsId = `preset-composition-${crypto.randomUUID()}`;
const busy = ref(false);
const error = ref("");
const failedOperation = ref<PresetCompositionOperation>();
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const index = (part: PresetChoicePart) =>
  part.options.findIndex((option) => option.id === part.selectedOptionId);
const displayContent = computed(() => {
  try {
    return compilePresetComposition(composition.value).content;
  } catch {
    return "";
  }
});
const partContent = presetPartContent;
function partPreview(part: PresetPart): string {
  const text = partContent(part).replace(/\s+/g, " ").trim();
  if (!text)
    return part.kind === "choice" && !selectedPresetOptions(part).length
      ? "留空"
      : "（空内容）";
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}
function step(partId: string, delta: number) {
  const part = composition.value.parts.find((item) => item.id === partId);
  if (part?.kind !== "choice" || part.enabled === false) return;
  const target = part.options[index(part) + delta];
  if (target)
    void saveOperation({ type: "selectOption", partId, optionId: target.id });
}
function togglePart(partId: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const enabled = input.checked;
  input.checked =
    composition.value.parts.find((part) => part.id === partId)?.enabled !==
    false;
  void saveOperation({ type: "setPartEnabled", partId, enabled });
}
async function saveOperation(operation: PresetCompositionOperation) {
  if (disabled.value || busy.value) return;
  const previous = copy(props.message);
  const next = copy(previous);
  busy.value = true;
  error.value = "";
  failedOperation.value = undefined;
  try {
    next.presetComposition = applyPresetCompositionOperation(
      next.presetComposition!,
      operation
    );
    await props.saveMessage(next, previous);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "保存失败，请重试";
    failedOperation.value = operation;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <PresetMessageCard
    :element="message"
    :compact="!!compact"
    :model-id="modelId"
    :token-count="tokenCount"
    :preset-groups="presetGroups"
    :display-content="displayContent"
    :busy="busy"
    :on-radio-change="() => emit('radio')"
    :data-preset-id="message.id"
    :aria-busy="busy"
    @edit="emit('edit')"
    @copy="emit('copy')"
    @duplicate="emit('duplicate')"
    @paste="emit('paste')"
    @delete="emit('remove')"
    @toggle-enabled="emit('toggle')"
    @group-command="(_message, command) => emit('group-command', command)"
  >
    <template #header-actions>
      <el-tooltip
        :content="expanded ? '收起组合内容' : '展开组合内容'"
        placement="top"
        :show-after="500"
      >
        <el-button
          link
          size="small"
          :aria-label="expanded ? '收起组合内容' : '展开组合内容'"
          :aria-expanded="expanded"
          :aria-controls="detailsId"
          @click.stop="expanded = !expanded"
        >
          <ChevronDown
            :size="16"
            class="collapse-chevron"
            :class="{ collapsed: !expanded }"
          />
        </el-button>
      </el-tooltip>
    </template>
    <template #details>
      <button
        v-if="!expanded"
        type="button"
        class="composition-summary"
        :class="{ compact }"
        :aria-controls="detailsId"
        :aria-expanded="false"
        @click="expanded = true"
      >
        <span class="part-count">{{ composition.parts.length }} 块</span
        ><span>{{
          displayContent.replace(/\s+/g, " ").trim() || "（空内容）"
        }}</span>
      </button>
      <div
        v-show="expanded"
        :id="detailsId"
        class="composition-parts"
        :class="{ compact }"
      >
        <div
          v-for="(part, partIndex) in composition.parts"
          :key="part.id"
          class="part-row"
          :class="{ muted: part.enabled === false }"
        >
          <input
            class="part-checkbox"
            type="checkbox"
            :checked="part.enabled !== false"
            :disabled="disabled || busy"
            :aria-label="`选入片段 ${partIndex + 1}`"
            @click.stop
            @change="togglePart(part.id, $event)"
          />
          <span v-if="part.name" class="part-name">{{ part.name }}</span>
          <button
            type="button"
            class="part-preview"
            :disabled="busy"
            :title="partContent(part)"
            :aria-label="`编辑片段 ${partIndex + 1}：${partPreview(part)}`"
            @click="emit('edit', part.id)"
          >
            {{ partPreview(part) }}
          </button>
          <div
            v-if="part.kind === 'choice'"
            class="branch-control"
            :aria-label="`片段 ${partIndex + 1} 备选切换`"
          >
            <el-button
              link
              size="small"
              :disabled="
                disabled || busy || part.enabled === false || index(part) <= 0
              "
              :aria-label="`片段 ${partIndex + 1}：上一个备选`"
              @click="step(part.id, -1)"
            >
              <ChevronLeft :size="16" />
            </el-button>
            <span aria-live="polite">
              {{ index(part) < 0 ? "—" : index(part) + 1 }} /
              {{ part.options.length }}
            </span>
            <el-button
              link
              size="small"
              :disabled="
                disabled ||
                busy ||
                part.enabled === false ||
                !part.options.length ||
                index(part) >= part.options.length - 1
              "
              :aria-label="`片段 ${partIndex + 1}：下一个备选`"
              @click="step(part.id, 1)"
            >
              <ChevronRight :size="16" />
            </el-button>
          </div>
        </div>
      </div>
      <p v-if="error" class="save-error" role="alert">
        {{ error }}
        <el-button
          v-if="failedOperation"
          link
          size="small"
          :disabled="busy"
          @click="saveOperation(failedOperation)"
          >重试保存</el-button
        >
      </p>
    </template>
  </PresetMessageCard>
</template>

<style scoped>
.collapse-chevron {
  transition: transform 0.15s;
}
.collapse-chevron.collapsed {
  transform: rotate(-90deg);
}
.composition-summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 3px 0;
  border: 0;
  background: none;
  color: var(--el-text-color-regular);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.composition-summary > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.composition-summary.compact {
  font-size: 12px;
}
.part-count {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  flex-shrink: 0;
}
.part-name {
  max-width: 100px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.part-checkbox {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
  margin: 0 6px 0 0;
  accent-color: var(--el-color-primary);
  cursor: pointer;
}
.part-checkbox:disabled {
  cursor: default;
}
.composition-summary:focus-visible {
  outline: 1px solid var(--el-color-primary);
  outline-offset: 2px;
}

.composition-parts {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 2px;
  padding-left: 10px;
  border-left: 2px solid var(--border-color);
}
/* 紧凑卡片：片段区域使用卡片内容宽度。 */
.composition-parts.compact {
  margin: 0 0 2px;
  padding-left: 8px;
}
.part-row,
.branch-control {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.part-row {
  flex-wrap: wrap;
  min-height: 24px;
}
.composition-parts.compact .part-preview {
  font-size: 12px;
}
.part-row.muted .part-name,
.part-row.muted .part-preview,
.part-row.muted .branch-control {
  opacity: 0.5;
}
.part-preview {
  flex: 1;
  min-width: 0;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--el-text-color-regular);
  font: inherit;
  font-size: 13px;
  line-height: 1.4;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.part-preview:hover:enabled {
  color: var(--el-color-primary);
}
.part-preview:focus-visible {
  outline: 1px solid var(--el-color-primary);
  outline-offset: 2px;
}
.branch-control {
  flex-shrink: 0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.branch-control span {
  min-width: 38px;
  text-align: center;
}
.branch-control :deep(.el-button) {
  width: 22px;
  height: 24px;
  margin: 0;
  padding: 0;
}
.save-error {
  margin: 0;
  color: var(--el-color-danger);
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
