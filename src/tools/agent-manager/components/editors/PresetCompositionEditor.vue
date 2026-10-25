<script setup lang="ts">
import { computed, ref } from "vue";
import { VueDraggableNext } from "vue-draggable-next";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Copy,
  Trash2,
  Undo2,
} from "lucide-vue-next";
import {
  compilePresetComposition,
  createPresetPart,
  undoPresetStructureEdit,
  type PresetStructureEdit,
  clonePresetComposition,
  presetPartContent,
  selectedPresetOptions,
  isPresetOptionSelected,
  setPresetOptionSelected,
  clearPresetSelection,
  type PresetComposition,
  type PresetPart,
  type PresetChoicePart,
} from "@aiohub/agent-preset-core";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import PresetBodyToolbar from "./PresetBodyToolbar.vue";
import type { VariableConfig } from "@/tools/llm-chat/types/sessionVariable";

const props = defineProps<{
  modelValue: PresetComposition;
  initialPartId?: string;
  variableConfig?: VariableConfig;
  allowRecall?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: PresetComposition] }>();
const separators = [
  { label: "原样", value: "" },
  { label: "换行", value: "\n" },
  { label: "空行", value: "\n\n" },
];
const selectedPartId = ref(
  props.initialPartId ?? props.modelValue.parts[0]?.id ?? ""
);
const editedOptions = ref<Record<string, string>>({});
const history = ref<PresetStructureEdit[]>([]);
const showPreview = ref(false);
const editor = ref<InstanceType<typeof RichCodeEditor>>();
const part = computed(
  () =>
    props.modelValue.parts.find((item) => item.id === selectedPartId.value) ??
    props.modelValue.parts[0]
);
const partIndex = computed(() =>
  props.modelValue.parts.findIndex((item) => item.id === part.value?.id)
);
const option = computed(() => {
  const current = part.value;
  return current?.kind === "choice"
    ? (current.options.find(
        (item) =>
          item.id ===
          (editedOptions.value[current.id] ?? current.selectedOptionId)
      ) ?? current.options[0])
    : undefined;
});
const optionIndex = computed(() =>
  part.value?.kind === "choice" && option.value
    ? part.value.options.findIndex((item) => item.id === option.value!.id)
    : -1
);
const currentIndex = (item: PresetChoicePart) =>
  item.options.findIndex((entry) => entry.id === item.selectedOptionId);
const compiledComposition = computed(() => {
  try {
    return { ...compilePresetComposition(props.modelValue), error: "" };
  } catch (error) {
    return {
      content: "",
      contributingParts: [],
      error: String((error as Error).message),
    };
  }
});
function partPreview(value: PresetPart): string {
  const cleaned = presetPartContent(value).replace(/\s+/g, " ").trim();
  return (
    cleaned ||
    (value.kind === "choice" && !selectedPresetOptions(value).length
      ? "留空"
      : "（空内容）")
  );
}
function update(change: (draft: PresetComposition) => void, remember = true) {
  const before: PresetComposition = JSON.parse(
    JSON.stringify(props.modelValue)
  );
  const draft: PresetComposition = JSON.parse(JSON.stringify(before));
  change(draft);
  if (remember) {
    history.value.push({ before, after: JSON.parse(JSON.stringify(draft)) });
    if (history.value.length > 60) history.value.shift();
  }
  emit("update:modelValue", draft);
}
const content = computed({
  get: () => option.value?.content ?? "",
  set: (value: string) =>
    update((draft) => {
      const target = draft.parts.find((item) => item.id === part.value?.id);
      if (target) {
        const entry = target.options.find(
          (item) => item.id === option.value?.id
        );
        if (entry) entry.content = value;
      }
    }, false),
});
const orderedParts = computed({
  get: () => props.modelValue.parts,
  set: (parts: PresetPart[]) =>
    update((draft) => {
      draft.parts = parts;
    }),
});
function patchPart(change: (target: PresetPart) => void, remember = true) {
  const id = part.value?.id;
  update((draft) => {
    const target = draft.parts.find((item) => item.id === id);
    if (target) change(target);
  }, remember);
}
function setPartEnabled(id: string, enabled: boolean) {
  update((draft) => {
    const target = draft.parts.find((item) => item.id === id);
    if (target) target.enabled = enabled;
  });
}
function setSeparator(value: string | number | boolean | undefined) {
  update((draft) => {
    draft.separator = String(value ?? "");
  });
}
function add() {
  const next = createPresetPart();
  update((draft) => {
    const index = draft.parts.findIndex((item) => item.id === part.value?.id);
    draft.parts.splice(index + 1, 0, next);
  });
  selectedPartId.value = next.id;
}
function shiftPart(delta: number) {
  update((draft) => {
    const index = draft.parts.findIndex((item) => item.id === part.value?.id);
    const next = index + delta;
    if (index >= 0 && next >= 0 && next < draft.parts.length)
      [draft.parts[index], draft.parts[next]] = [
        draft.parts[next],
        draft.parts[index],
      ];
  });
}
function duplicatePart() {
  if (!part.value) return;
  const cloned = clonePresetComposition({
    version: props.modelValue.version,
    separator: "",
    parts: [part.value],
  }).parts[0];
  update((draft) => {
    draft.parts.splice(
      draft.parts.findIndex((item) => item.id === part.value?.id) + 1,
      0,
      cloned
    );
  });
  selectedPartId.value = cloned.id;
}
function removePart() {
  const id = part.value?.id;
  if (!id) return;
  update((draft) => {
    const index = draft.parts.findIndex((item) => item.id === id);
    if (index < 0) return;
    draft.parts.splice(index, 1);
    selectedPartId.value =
      draft.parts[Math.min(index, draft.parts.length - 1)]?.id ?? "";
  });
}
function step(item: PresetChoicePart, delta: number) {
  const index = currentIndex(item) + delta;
  const entry = item.options[index];
  if (!entry) return;
  update((draft) => {
    const target = draft.parts.find((value) => value.id === item.id);
    if (target?.kind === "choice") target.selectedOptionId = entry.id;
  });
  editedOptions.value[item.id] = entry.id;
}
function useOption() {
  const id = option.value?.id;
  if (!id) return;
  patchPart((target) => {
    if (target.kind === "choice") setPresetOptionSelected(target, id);
  });
}
function clearSelection() {
  patchPart((target) => {
    if (target.kind === "choice") clearPresetSelection(target);
  });
}
function addOption(duplicate = false) {
  if (part.value?.kind !== "choice") return;
  const id = crypto.randomUUID();
  const text = duplicate ? (option.value?.content ?? "") : "";
  patchPart((target) => {
    if (target.kind !== "choice") return;
    const wasEmpty = target.options.length === 0;
    target.options.push({ id, content: text });
    if (wasEmpty) setPresetOptionSelected(target, id);
  });
  editedOptions.value[part.value.id] = id;
}
function removeOption() {
  const id = option.value?.id;
  patchPart((target) => {
    if (target.kind !== "choice") return;
    if (id) setPresetOptionSelected(target, id, false);
    target.options = target.options.filter((item) => item.id !== id);
  });
  if (part.value) delete editedOptions.value[part.value.id];
}
function moveOption(delta: number) {
  const id = option.value?.id;
  patchPart((target) => {
    if (target.kind !== "choice") return;
    const index = target.options.findIndex((item) => item.id === id);
    const next = index + delta;
    if (index >= 0 && next >= 0 && next < target.options.length)
      [target.options[index], target.options[next]] = [
        target.options[next],
        target.options[index],
      ];
  });
}
function undo() {
  const previous = history.value.pop();
  if (previous)
    emit(
      "update:modelValue",
      undoPresetStructureEdit(props.modelValue, previous)
    );
}
</script>

<template>
  <div class="composition-workspace" data-testid="preset-composition-editor">
    <div class="workbench-body">
      <aside class="part-pane">
        <div class="pane-heading">
          <span class="pane-title">片段列表</span>
          <el-tag size="small" type="info" effect="plain">{{
            modelValue.parts.length
          }}</el-tag>
          <el-tooltip content="撤销结构调整" placement="top" :show-after="500">
            <el-button
              link
              size="small"
              class="icon-action"
              :disabled="!history.length"
              aria-label="撤销结构调整"
              @click="undo"
              ><Undo2 :size="15"
            /></el-button>
          </el-tooltip>
        </div>
        <VueDraggableNext
          v-model="orderedParts"
          class="part-list"
          handle=".part-grip"
          :animation="150"
          :force-fallback="true"
          :fallback-on-body="true"
          :fallback-tolerance="4"
        >
          <div
            v-for="(item, index) in modelValue.parts"
            :key="item.id"
            class="part-item"
            :class="{
              active: part?.id === item.id,
              muted: item.enabled === false,
            }"
            @click="selectedPartId = item.id"
          >
            <input
              class="part-checkbox"
              type="checkbox"
              :checked="item.enabled !== false"
              :aria-label="`选入片段 ${index + 1}`"
              @click.stop
              @change="
                setPartEnabled(
                  item.id,
                  ($event.target as HTMLInputElement).checked
                )
              "
            />
            <div class="part-meta">
              <span class="part-grip" title="拖动排序"
                ><GripVertical :size="14"
              /></span>
              <button
                type="button"
                class="part-index"
                :aria-current="part?.id === item.id ? 'true' : undefined"
                :aria-label="`片段 ${index + 1}：${partPreview(item)}`"
              >
                <span>{{ index + 1 }}</span>
                <span class="part-name" :title="item.name">{{
                  item.name || `片段 ${index + 1}`
                }}</span>
              </button>
              <div
                v-if="item.options.length > 1"
                class="part-stepper"
                @click.stop
              >
                <button
                  type="button"
                  :disabled="item.enabled === false || currentIndex(item) <= 0"
                  :aria-label="`片段 ${index + 1}：上一个版本`"
                  @click="step(item, -1)"
                >
                  <ChevronLeft :size="14" />
                </button>
                <span
                  >{{
                    currentIndex(item) < 0 ? "—" : currentIndex(item) + 1
                  }}/{{ item.options.length }}</span
                >
                <button
                  type="button"
                  :disabled="
                    item.enabled === false ||
                    !item.options.length ||
                    currentIndex(item) >= item.options.length - 1
                  "
                  :aria-label="`片段 ${index + 1}：下一个版本`"
                  @click="step(item, 1)"
                >
                  <ChevronRight :size="14" />
                </button>
              </div>
            </div>
            <p class="part-preview" :title="partPreview(item)">
              {{ partPreview(item) }}
            </p>
          </div>
        </VueDraggableNext>
        <div class="part-add">
          <el-button size="small" @click="add"
            ><Plus :size="14" /><span class="btn-label"
              >添加片段</span
            ></el-button
          >
        </div>
      </aside>
      <section class="edit-pane" :class="{ blank: !part }">
        <template v-if="part">
          <div class="edit-heading">
            <span class="edit-title">片段 {{ partIndex + 1 }}</span>
            <el-tag
              v-if="part.enabled === false"
              size="small"
              type="info"
              effect="plain"
              >已停用</el-tag
            >
            <div class="edit-actions">
              <span class="action-divider" />
              <el-tooltip content="上移片段" placement="top" :show-after="500">
                <el-button
                  link
                  size="small"
                  class="icon-action"
                  :disabled="partIndex <= 0"
                  aria-label="上移片段"
                  @click="shiftPart(-1)"
                  ><ArrowUp :size="15"
                /></el-button>
              </el-tooltip>
              <el-tooltip content="下移片段" placement="top" :show-after="500">
                <el-button
                  link
                  size="small"
                  class="icon-action"
                  :disabled="partIndex >= modelValue.parts.length - 1"
                  aria-label="下移片段"
                  @click="shiftPart(1)"
                  ><ArrowDown :size="15"
                /></el-button>
              </el-tooltip>
              <el-tooltip content="复制片段" placement="top" :show-after="500">
                <el-button
                  link
                  size="small"
                  class="icon-action"
                  aria-label="复制片段"
                  @click="duplicatePart"
                  ><Copy :size="15"
                /></el-button>
              </el-tooltip>
              <el-tooltip content="删除片段" placement="top" :show-after="500">
                <span>
                  <el-popconfirm
                    title="删除此片段？可通过撤销恢复。"
                    width="220"
                    @confirm="removePart"
                  >
                    <template #reference>
                      <el-button
                        link
                        size="small"
                        type="danger"
                        class="icon-action"
                        aria-label="删除片段"
                        ><Trash2 :size="15"
                      /></el-button>
                    </template>
                  </el-popconfirm>
                </span>
              </el-tooltip>
            </div>
          </div>
          <div class="block-settings">
            <el-input
              :model-value="part.name ?? ''"
              size="small"
              placeholder="内容块名称（可选）"
              aria-label="内容块名称"
              clearable
              @update:model-value="
                (name: string) =>
                  patchPart((target) => {
                    target.name = name;
                  }, false)
              "
            />
          </div>
          <div v-if="part.kind === 'choice'" class="option-bar">
            <div class="option-tabs" role="tablist" aria-label="编辑版本">
              <button
                v-for="(entry, index) in part.options"
                :key="entry.id"
                type="button"
                role="tab"
                :aria-selected="entry.id === option?.id"
                :title="
                  isPresetOptionSelected(part, entry.id)
                    ? '当前使用项'
                    : undefined
                "
                :class="{
                  active: entry.id === option?.id,
                  using: isPresetOptionSelected(part, entry.id),
                }"
                @click="editedOptions[part.id] = entry.id"
              >
                {{ entry.name || index + 1 }}
              </button>
              <el-tooltip content="新增版本" placement="top" :show-after="500">
                <button
                  type="button"
                  class="option-add"
                  aria-label="新增版本"
                  @click="addOption()"
                >
                  <Plus :size="14" />
                </button>
              </el-tooltip>
            </div>
            <template v-if="option">
              <span class="action-divider" />
              <el-tooltip content="左移版本" placement="top" :show-after="500">
                <el-button
                  link
                  size="small"
                  class="icon-action"
                  :disabled="optionIndex <= 0"
                  aria-label="左移版本"
                  @click="moveOption(-1)"
                  ><ArrowLeft :size="15"
                /></el-button>
              </el-tooltip>
              <el-tooltip content="右移版本" placement="top" :show-after="500">
                <el-button
                  link
                  size="small"
                  class="icon-action"
                  :disabled="optionIndex >= part.options.length - 1"
                  aria-label="右移版本"
                  @click="moveOption(1)"
                  ><ArrowRight :size="15"
                /></el-button>
              </el-tooltip>
              <el-tooltip content="复制版本" placement="top" :show-after="500">
                <el-button
                  link
                  size="small"
                  class="icon-action"
                  aria-label="复制版本"
                  @click="addOption(true)"
                  ><Copy :size="15"
                /></el-button>
              </el-tooltip>
              <el-tooltip content="删除版本" placement="top" :show-after="500">
                <span>
                  <el-popconfirm
                    :title="
                      isPresetOptionSelected(part, option.id)
                        ? '删除此版本，并从当前组合中移除？'
                        : '删除此版本？'
                    "
                    width="220"
                    @confirm="removeOption"
                  >
                    <template #reference>
                      <el-button
                        link
                        size="small"
                        type="danger"
                        class="icon-action"
                        aria-label="删除版本"
                        ><Trash2 :size="15"
                      /></el-button>
                    </template>
                  </el-popconfirm>
                </span>
              </el-tooltip>
            </template>
            <div class="selection-info">
              <span class="selection-state"
                >当前使用：{{
                  currentIndex(part) < 0
                    ? "留空"
                    : `版本 ${currentIndex(part) + 1}`
                }}</span
              >
              <el-button
                v-if="option && !isPresetOptionSelected(part, option.id)"
                size="small"
                type="primary"
                plain
                @click="useOption"
                >选入此项</el-button
              >
              <el-button
                v-if="selectedPresetOptions(part).length"
                link
                size="small"
                @click="clearSelection"
                >清空选择</el-button
              >
            </div>
          </div>
          <el-input
            v-if="part.kind === 'choice' && option"
            :model-value="option.name ?? ''"
            size="small"
            class="option-name"
            placeholder="版本名称（可选）"
            aria-label="版本名称"
            @update:model-value="
              (name: string) =>
                patchPart((target) => {
                  if (target.kind === 'choice') {
                    const entry = target.options.find(
                      (item) => item.id === option?.id
                    );
                    if (entry) entry.name = name;
                  }
                }, false)
            "
          />
          <div
            v-if="option"
            :key="`${part.id}:${option?.id ?? ''}`"
            class="body-editor"
          >
            <PresetBodyToolbar
              v-model="content"
              :editor="editor"
              :variable-config="variableConfig"
              :allow-recall="allowRecall"
            />
            <RichCodeEditor
              :key="`${part.id}:${option?.id ?? ''}`"
              ref="editor"
              v-model="content"
              language="markdown"
              editor-type="monaco"
              :options="{
                wordWrap: 'on',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
              }"
            />
          </div>
          <div v-else class="editor-empty">
            <span>此选择组还没有版本</span>
            <el-button size="small" @click="addOption()"
              ><Plus :size="14" /><span class="btn-label"
                >添加第一个版本</span
              ></el-button
            >
          </div>
        </template>
        <div v-else class="editor-empty">
          <span>暂无片段</span>
          <el-button size="small" @click="add"
            ><Plus :size="14" /><span class="btn-label"
              >添加片段</span
            ></el-button
          >
        </div>
      </section>
    </div>
    <pre v-if="showPreview" class="composition-preview">{{
      compiledComposition.content || "（空内容）"
    }}</pre>
    <div class="status-bar">
      <el-button
        link
        size="small"
        :aria-expanded="showPreview"
        @click="showPreview = !showPreview"
        >{{ showPreview ? "收起完整正文" : "完整正文" }}</el-button
      >
      <span class="status-meta"
        >{{ compiledComposition.content.length }} 字符</span
      >
      <span
        v-if="compiledComposition.error"
        class="status-error"
        role="alert"
        :title="compiledComposition.error"
        >{{ compiledComposition.error }}</span
      >
      <div class="separator-control">
        <span>块间连接</span>
        <el-radio-group
          :model-value="modelValue.separator"
          size="small"
          aria-label="片段连接方式"
          @change="setSeparator"
        >
          <el-radio-button
            v-for="item in separators"
            :key="item.label"
            :value="item.value"
            >{{ item.label }}</el-radio-button
          >
        </el-radio-group>
      </div>
    </div>
  </div>
</template>

<style scoped>
.block-settings {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: var(--border-width) solid var(--border-color);
}
.block-settings .el-input {
  flex: 1 1 150px;
  min-width: 0;
}
.part-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.option-name {
  flex-shrink: 0;
  margin: 6px 10px;
  width: calc(100% - 20px);
}
.composition-preview {
  margin: 0;
  padding: 10px;
  max-height: 110px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-regular);
  font-size: 12px;
  border-top: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.composition-workspace {
  container: composition-workspace / inline-size;
  display: flex;
  flex-direction: column;
  min-height: 320px;
  height: 100%;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}
.workbench-body {
  overflow: hidden;
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}
.btn-label {
  margin-left: 4px;
}

/* 左栏：片段列表 */
.part-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: var(--border-width) solid var(--border-color);
  background: var(--el-fill-color-lighter);
}
.pane-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 8px 0 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
  box-sizing: border-box;
}
.pane-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.pane-heading .icon-action {
  margin-left: auto;
}
.part-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}
.part-item {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  column-gap: 8px;
  padding: 6px 8px 8px;
  border: var(--border-width) solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition:
    background-color 0.15s,
    border-color 0.15s;
}
.part-item:hover {
  background: var(--el-fill-color-light);
}
.part-item.active {
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  border-color: var(--el-color-primary);
}
.part-item.muted .part-index,
.part-item.muted .part-preview {
  color: var(--el-text-color-placeholder);
}
.part-meta,
.part-preview {
  grid-column: 2;
}
.part-checkbox {
  grid-column: 1;
  grid-row: 1 / 3;
  align-self: start;
  width: 16px;
  height: 16px;
  margin: 4px 0 0;
  accent-color: var(--el-color-primary);
  cursor: pointer;
}
.part-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
}
.part-grip {
  flex-shrink: 0;
  touch-action: none;
  user-select: none;
  display: flex;
  color: var(--el-text-color-placeholder);
  cursor: grab;
}
.part-grip:hover {
  color: var(--el-color-primary);
}
.part-index {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--el-text-color-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: left;
  cursor: pointer;
}
.part-index:focus-visible {
  outline: 1px solid var(--el-color-primary);
  outline-offset: 2px;
  border-radius: 2px;
}
.part-stepper {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}
.part-stepper span {
  min-width: 30px;
  text-align: center;
}
.part-stepper button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  color: inherit;
  cursor: pointer;
}
.part-stepper button:hover:enabled {
  color: var(--el-color-primary);
  background: var(--el-fill-color);
}
.part-stepper button:disabled {
  opacity: 0.35;
  cursor: default;
}
.part-preview {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  margin: 4px 0 0 18px;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.45;
  color: var(--el-text-color-regular);
}
.part-add {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 8px;
  border-top: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}
.part-add .el-button {
  margin: 0;
}
/* 右栏：片段编辑 */
.edit-pane {
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.edit-pane .el-button {
  margin: 0;
}
.edit-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 40px;
  padding: 4px 8px 4px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
  box-sizing: border-box;
}
.edit-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.edit-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.edit-actions > .el-button + .el-button {
  margin-left: 4px;
}
.action-divider {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--border-color);
  flex-shrink: 0;
}
.icon-action {
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 4px;
}
.icon-action:hover:not(.is-disabled) {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
}

.option-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 12px 0;
  flex-shrink: 0;
}
.option-tabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.option-tabs button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 26px;
  padding: 0 8px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-regular);
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  box-sizing: border-box;
}
.option-tabs button:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.option-tabs button.active {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
}
/* 当前使用项：右上角圆点 */
.option-tabs button.using::after {
  content: "";
  position: absolute;
  top: 3px;
  right: 3px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--el-color-success);
}
.option-tabs .option-add {
  border-style: dashed;
  color: var(--el-text-color-secondary);
  padding: 0 6px;
}
.selection-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.selection-state {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.body-editor {
  gap: 8px;
  flex: 1 0 220px;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  margin: 8px 12px 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}
.body-editor > .preset-body-toolbar {
  flex-shrink: 0;
  padding: 8px 8px 0;
}
.editor-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 8px 12px 12px;
  border: var(--border-width) dashed var(--border-color);
  border-radius: 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.edit-pane.blank .editor-empty {
  margin: 12px;
}

/* 底部状态栏 */
.status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 36px;
  padding: 4px 8px;
  border-top: var(--border-width) solid var(--border-color);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
  box-sizing: border-box;
}
.status-meta {
  font-variant-numeric: tabular-nums;
}
.status-error {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-color-danger);
}
.separator-control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

@container composition-workspace (max-width: 680px) {
  .workbench-body {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    overflow: auto;
  }
  .part-pane {
    max-height: 220px;
    border-right: 0;
    border-bottom: var(--border-width) solid var(--border-color);
  }
  .edit-pane {
    min-height: 360px;
  }
}
</style>
