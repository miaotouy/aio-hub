<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "@/i18n";
import { customDialog } from "@/utils/feedback";
import {
  ChevronLeft,
  ChevronRight,
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
} from "@aiohub/agent-preset-core";
const { tRaw } = useI18n();
const t = (key: string, params?: Record<string, unknown>) =>
  params
    ? tRaw(`tools.agent-manager.PresetEditor.${key}`, params)
    : tRaw(`tools.agent-manager.PresetEditor.${key}`);
const props = defineProps<{ modelValue: PresetComposition }>();
const emit = defineEmits<{ "update:modelValue": [value: PresetComposition] }>();
const selectedId = ref<string | null>(null);
const editedId = ref<string | null>(null);
const showPreview = ref(false);
const history = ref<PresetStructureEdit[]>([]);
const part = computed(() =>
  props.modelValue.parts.find((item) => item.id === selectedId.value)
);
const option = computed(() => {
  const value = part.value;
  return value?.kind === "choice"
    ? (value.options.find((entry) => entry.id === editedId.value) ??
        value.options.find((entry) => entry.id === value.selectedOptionId) ??
        value.options[0])
    : undefined;
});
const selectionIndex = computed(() => {
  const value = part.value;
  return value?.kind === "choice"
    ? value.options.findIndex((entry) => entry.id === value.selectedOptionId)
    : -1;
});
const partIndex = computed(() =>
  props.modelValue.parts.findIndex((item) => item.id === selectedId.value)
);
const optionIndex = computed(() =>
  part.value?.kind === "choice" && option.value
    ? part.value.options.findIndex((entry) => entry.id === option.value!.id)
    : -1
);
function choiceLabel(value: PresetPart): string {
  const index = value.options.findIndex(
    (entry) => entry.id === value.selectedOptionId
  );
  return `${index < 0 ? "—" : index + 1}/${value.options.length}`;
}
const preview = computed(() => {
  try {
    return compilePresetComposition(props.modelValue).content;
  } catch (error) {
    return (error as Error).message;
  }
});
function partPreview(value: PresetPart): string {
  return (
    presetPartContent(value).replace(/\s+/g, " ").trim() ||
    (value.kind === "choice" && !selectedPresetOptions(value).length
      ? t("留空")
      : t("空内容"))
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
function patch(change: (target: PresetPart) => void, remember = true) {
  update((draft) => {
    const target = draft.parts.find((item) => item.id === selectedId.value);
    if (target) change(target);
  }, remember);
}
const content = computed({
  get: () => option.value?.content ?? "",
  set: (text: string) =>
    patch((target) => {
      const entry = target.options.find((item) => item.id === option.value?.id);
      if (entry) entry.content = text;
    }, false),
});
function open(item: PresetPart) {
  selectedId.value = item.id;
  editedId.value = null;
}
function add() {
  const next = createPresetPart();
  update((draft) => draft.parts.push(next));
  selectedId.value = next.id;
  editedId.value = null;
}
function move(delta: number) {
  update((draft) => {
    const index = draft.parts.findIndex((item) => item.id === selectedId.value);
    const next = index + delta;
    if (index >= 0 && next >= 0 && next < draft.parts.length)
      [draft.parts[index], draft.parts[next]] = [
        draft.parts[next],
        draft.parts[index],
      ];
  });
}
function addOption(duplicate = false) {
  const id = crypto.randomUUID();
  const text = duplicate ? content.value : "";
  patch((target) => {
    if (target.kind !== "choice") return;
    const wasEmpty = target.options.length === 0;
    target.options.push({ id, content: text });
    if (wasEmpty) setPresetOptionSelected(target, id);
  });
  editedId.value = id;
}
function moveOption(delta: number) {
  const id = option.value?.id;
  patch((target) => {
    if (target.kind !== "choice") return;
    const index = target.options.findIndex((entry) => entry.id === id);
    const next = index + delta;
    if (index >= 0 && next >= 0 && next < target.options.length)
      [target.options[index], target.options[next]] = [
        target.options[next],
        target.options[index],
      ];
  });
}
async function removeOption() {
  if (
    !(await customDialog({
      title: t("删除备选"),
      message: t("删除备选提示"),
    }))
  )
    return;
  const id = option.value?.id;
  patch((target) => {
    if (target.kind !== "choice") return;
    if (id) setPresetOptionSelected(target, id, false);
    target.options = target.options.filter((item) => item.id !== id);
  });
  editedId.value = null;
}
async function removePart() {
  if (
    !(await customDialog({
      title: t("删除片段"),
      message: t("删除片段提示"),
    }))
  )
    return;
  update((draft) => {
    draft.parts = draft.parts.filter((item) => item.id !== selectedId.value);
  });
  selectedId.value = null;
}
function duplicatePart() {
  if (!part.value) return;
  const cloned = clonePresetComposition({
    version: props.modelValue.version,
    separator: "",
    parts: [part.value],
  }).parts[0];
  update((draft) => draft.parts.push(cloned));
  selectedId.value = cloned.id;
  editedId.value = null;
}
function undo() {
  const previous = history.value.pop();
  if (previous) {
    emit(
      "update:modelValue",
      undoPresetStructureEdit(props.modelValue, previous)
    );
    selectedId.value = null;
  }
}
</script>
<template>
  <section class="composition-field">
    <span class="field-label">{{ t("内容") }}</span>
    <div class="composition-card">
      <!-- 片段列表 -->
      <template v-if="!part">
        <div class="card-heading">
          <strong>{{ t("消息片段") }}</strong>
          <span class="count">{{ modelValue.parts.length }}</span>
          <button
            type="button"
            class="ghost-icon"
            :disabled="!history.length"
            :aria-label="t('撤销结构调整')"
            @click="undo"
          >
            <Undo2 :size="18" />
          </button>
        </div>
        <ul class="part-list">
          <li v-for="(item, index) in modelValue.parts" :key="item.id">
            <label class="part-check-target">
              <input
                type="checkbox"
                :checked="item.enabled !== false"
                :aria-label="t('选入片段', { index: index + 1 })"
                @change="
                  update((draft) => {
                    const target = draft.parts.find(
                      (entry) => entry.id === item.id
                    );
                    if (target)
                      target.enabled = (
                        $event.target as HTMLInputElement
                      ).checked;
                  })
                "
              />
            </label>
            <button
              type="button"
              class="part-row"
              :class="{ muted: item.enabled === false }"
              @click="open(item)"
            >
              <span class="part-index">{{ index + 1 }}</span>
              <span class="part-body">
                <strong>{{
                  item.name || t("片段编号", { index: index + 1 })
                }}</strong>
                <span
                  v-if="item.options.length > 1 || item.enabled === false"
                  class="part-meta"
                  >{{ choiceLabel(item)
                  }}<template v-if="item.enabled === false">
                    · {{ t("已停用") }}</template
                  ></span
                >
                <span class="part-preview">{{ partPreview(item) }}</span>
              </span>
              <ChevronRight :size="18" class="part-chevron" />
            </button>
          </li>
        </ul>
        <div class="add-row">
          <button type="button" class="dashed-button" @click="add">
            <Plus :size="16" />{{ t("添加片段") }}
          </button>
        </div>
      </template>
      <!-- 片段编辑 -->
      <template v-else>
        <div class="card-heading">
          <button type="button" class="back-button" @click="selectedId = null">
            <ChevronLeft :size="18" />{{ t("片段列表") }}
          </button>
          <span class="detail-title">{{
            part.name || t("片段编号", { index: partIndex + 1 })
          }}</span>
          <label class="part-check-target" :aria-label="t('选入此片段')">
            <input
              type="checkbox"
              :checked="part.enabled !== false"
              @change="
                patch((target) => {
                  target.enabled = ($event.target as HTMLInputElement).checked;
                })
              "
            />
          </label>
        </div>
        <div class="detail-body">
          <label class="block-setting"
            >{{ t("名称")
            }}<input
              :value="part.name ?? ''"
              :placeholder="t('内容块名称占位')"
              @input="
                patch((target) => {
                  target.name = ($event.target as HTMLInputElement).value;
                }, false)
              "
          /></label>
          <div class="action-row">
            <span class="action-label">{{ t("片段") }}</span>
            <button
              type="button"
              class="ghost-icon"
              :disabled="partIndex <= 0"
              :aria-label="t('上移片段')"
              @click="move(-1)"
            >
              <ArrowUp :size="18" />
            </button>
            <button
              type="button"
              class="ghost-icon"
              :disabled="partIndex >= modelValue.parts.length - 1"
              :aria-label="t('下移片段')"
              @click="move(1)"
            >
              <ArrowDown :size="18" />
            </button>
            <button
              type="button"
              class="ghost-icon"
              :aria-label="t('复制片段')"
              @click="duplicatePart"
            >
              <Copy :size="18" />
            </button>
            <button
              type="button"
              class="ghost-icon danger"
              :aria-label="t('删除片段')"
              @click="removePart"
            >
              <Trash2 :size="18" />
            </button>
          </div>
          <template v-if="part.kind === 'choice'">
            <div class="option-tabs" role="tablist" :aria-label="t('编辑备选')">
              <button
                v-for="(entry, index) in part.options"
                :key="entry.id"
                type="button"
                role="tab"
                :aria-selected="option?.id === entry.id"
                :class="{
                  active: option?.id === entry.id,
                  using: isPresetOptionSelected(part, entry.id),
                }"
                @click="editedId = entry.id"
              >
                {{ entry.name || index + 1 }}
              </button>
              <button
                type="button"
                class="option-add"
                :aria-label="t('新增备选')"
                @click="addOption()"
              >
                <Plus :size="16" />
              </button>
            </div>
            <div class="selection-row">
              <span>{{
                t("当前使用", {
                  value:
                    selectionIndex < 0
                      ? t("留空")
                      : t("备选", { index: selectionIndex + 1 }),
                })
              }}</span>
              <button
                v-if="option && !isPresetOptionSelected(part, option.id)"
                type="button"
                class="text-button primary"
                @click="
                  patch((target) => {
                    if (target.kind === 'choice')
                      setPresetOptionSelected(target, option!.id);
                  })
                "
              >
                {{ t("选入此项") }}
              </button>
              <button
                v-if="selectedPresetOptions(part).length"
                type="button"
                class="text-button"
                @click="
                  patch((target) => {
                    if (target.kind === 'choice') clearPresetSelection(target);
                  })
                "
              >
                {{ t("清空选择") }}
              </button>
            </div>
            <div v-if="option" class="action-row">
              <span class="action-label">{{
                t("备选", { index: optionIndex + 1 })
              }}</span>
              <button
                type="button"
                class="ghost-icon"
                :disabled="optionIndex <= 0"
                :aria-label="t('左移备选')"
                @click="moveOption(-1)"
              >
                <ArrowLeft :size="18" />
              </button>
              <button
                type="button"
                class="ghost-icon"
                :disabled="optionIndex >= part.options.length - 1"
                :aria-label="t('右移备选')"
                @click="moveOption(1)"
              >
                <ArrowRight :size="18" />
              </button>
              <button
                type="button"
                class="ghost-icon"
                :aria-label="t('复制备选')"
                @click="addOption(true)"
              >
                <Copy :size="18" />
              </button>
              <button
                type="button"
                class="ghost-icon danger"
                :aria-label="t('删除备选')"
                @click="removeOption"
              >
                <Trash2 :size="18" />
              </button>
            </div>
          </template>
          <label v-if="part.kind === 'choice' && option" class="block-setting"
            >{{ t("备选名称")
            }}<input
              :value="option.name ?? ''"
              :placeholder="t('备选名称占位')"
              @input="
                patch((target) => {
                  if (target.kind === 'choice') {
                    const entry = target.options.find(
                      (item) => item.id === option?.id
                    );
                    if (entry)
                      entry.name = ($event.target as HTMLInputElement).value;
                  }
                }, false)
              "
          /></label>
          <textarea
            v-if="option"
            v-model="content"
            rows="12"
            :aria-label="t('片段正文')"
            spellcheck="false"
          />
          <div v-else class="empty-option">
            <span>{{ t("无备选提示") }}</span>
            <button type="button" class="dashed-button" @click="addOption()">
              <Plus :size="16" />{{ t("添加第一个备选") }}
            </button>
          </div>
        </div>
      </template>
      <pre v-if="showPreview" class="merged-preview">{{
        preview || t("空正文")
      }}</pre>
      <div class="card-footer">
        <button
          type="button"
          class="text-button"
          :aria-expanded="showPreview"
          @click="showPreview = !showPreview"
        >
          {{ showPreview ? t("收起完整正文") : t("完整正文") }}
        </button>
        <label class="separator">
          {{ t("块间连接") }}
          <select
            :value="modelValue.separator"
            @change="
              update((draft) => {
                draft.separator = ($event.target as HTMLSelectElement).value;
              })
            "
          >
            <option value="">{{ t("原样") }}</option>
            <option value="&#10;">{{ t("换行") }}</option>
            <option value="&#10;&#10;">{{ t("空行") }}</option>
          </select>
        </label>
      </div>
    </div>
  </section>
</template>
<style scoped>
.block-setting {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--color-on-surface-variant);
}
.block-setting input,
.block-setting select {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  padding: 6px 8px;
  color: var(--text-color);
  background: var(--bg-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  font: inherit;
}

.composition-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.field-label {
  color: var(--color-on-surface-variant);
  font-size: 0.82rem;
}
.composition-card {
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  color: var(--text-color);
}
button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}
button:disabled {
  opacity: 0.35;
  cursor: default;
}
.card-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 6px 0 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: var(--input-bg);
}
.card-heading strong {
  font-size: 0.9rem;
}
.count {
  flex: 1;
  color: var(--color-on-surface-variant);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}
.back-button {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 40px;
  margin-left: -6px;
  padding: 0 8px 0 2px;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  font-size: 0.85rem;
}
.detail-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-on-surface-variant);
  font-size: 0.8rem;
}
.ghost-icon {
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
}
.ghost-icon:active:enabled {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
}
.ghost-icon.danger {
  color: var(--color-danger);
}
.text-button {
  min-height: 36px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-on-surface-variant);
  font-size: 0.82rem;
}
.text-button.primary {
  color: var(--color-primary);
}
.dashed-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 40px;
  padding: 0 12px;
  border: var(--border-width) dashed var(--border-color);
  border-radius: 8px;
  background: transparent;
  font-size: 0.85rem;
}
/* 片段列表 */
.part-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.part-list li {
  display: flex;
  align-items: center;
}
.part-check-target {
  display: grid;
  place-items: center;
  min-width: 40px;
  min-height: 40px;
  flex-shrink: 0;
}
.part-check-target input {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--color-primary);
}
.part-list li + li {
  border-top: var(--border-width) solid var(--border-color);
}
.part-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  padding: 10px 8px 10px 12px;
  border: 0;
  background: transparent;
  text-align: left;
}
.part-row:active {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}
.part-row.muted .part-preview,
.part-row.muted .part-index {
  opacity: 0.5;
}
.part-index {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--color-on-surface-variant);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}
.part-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.part-meta {
  color: var(--color-on-surface-variant);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}
.part-preview {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: 0.88rem;
  line-height: 1.45;
}
.part-chevron {
  flex-shrink: 0;
  color: var(--color-on-surface-variant);
}
.add-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 10px 12px;
  border-top: var(--border-width) solid var(--border-color);
}

/* 片段编辑 */
.detail-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px 12px 12px;
}
.action-row {
  display: flex;
  align-items: center;
  gap: 2px;
}
.action-label {
  flex: 1;
  color: var(--color-on-surface-variant);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}
.option-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.option-tabs button {
  position: relative;
  min-width: 40px;
  height: 36px;
  padding: 0 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 7px;
  background: transparent;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
.option-tabs button.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
}
/* 当前使用项：右上角圆点 */
.option-tabs button.using::after {
  content: "";
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
}
.option-tabs .option-add {
  display: inline-grid;
  place-items: center;
  border-style: dashed;
  color: var(--color-on-surface-variant);
}
.selection-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  color: var(--color-on-surface-variant);
  font-size: 0.8rem;
}
.selection-row > span {
  margin-right: auto;
}
textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 36vh;
  padding: 11px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  color: var(--text-color);
  background: var(--input-bg);
  font: inherit;
  font-size: 0.88rem;
  line-height: 1.55;
  resize: vertical;
}
.empty-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px 12px;
  border: var(--border-width) dashed var(--border-color);
  border-radius: 8px;
  color: var(--color-on-surface-variant);
  font-size: 0.85rem;
}
/* 完整正文与连接方式 */
.merged-preview {
  max-height: 200px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  border-top: var(--border-width) solid var(--border-color);
  background: var(--input-bg);
  color: var(--color-on-surface-variant);
  font: inherit;
  font-size: 0.8rem;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 48px;
  padding: 0 8px 0 4px;
  border-top: var(--border-width) solid var(--border-color);
}
.separator {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-on-surface-variant);
  font-size: 0.8rem;
}
.separator select {
  min-height: 36px;
  padding: 0 8px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 7px;
  color: var(--text-color);
  background: var(--input-bg);
  font: inherit;
}

/* 开关：与 PresetMessageCard 保持一致 */
</style>
