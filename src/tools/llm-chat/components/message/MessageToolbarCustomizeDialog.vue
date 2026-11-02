<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton, ElInput } from "element-plus";
import { VueDraggableNext } from "vue-draggable-next";
import {
  ArrowUp,
  ArrowDown,
  GripVertical,
  MoreHorizontal,
  ChevronsLeftRight,
  Search,
} from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { MESSAGE_TOOLBAR_ACTIONS } from "./messageToolbarActions";
import {
  createDefaultMessageToolbarLayout,
  normalizeMessageToolbarLayout,
} from "../../config/messageToolbar";
import { reorderToolbarIds } from "../../config/inputToolbar";
import type { MessageToolbarLayout } from "../../types/message-toolbar";

const props = defineProps<{
  modelValue: boolean;
  layout: MessageToolbarLayout;
  saveLayout: (layout: MessageToolbarLayout) => Promise<void>;
}>();
const emit = defineEmits<{ "update:modelValue": [visible: boolean] }>();
const draft = ref(normalizeMessageToolbarLayout(props.layout));
const saving = ref(false);
const saveError = ref("");
const search = ref("");
const definitions = new Map(
  MESSAGE_TOOLBAR_ACTIONS.map((action) => [action.id as string, action])
);
const pinned = computed(() =>
  draft.value.pinnedActionIds.flatMap((id) =>
    definitions.has(id) ? [definitions.get(id)!] : []
  )
);
const matches = (label: string) =>
  label.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase());
const filteredPinned = computed({
  get: () => pinned.value.filter((action) => matches(action.label)),
  set: (actions) => {
    draft.value.pinnedActionIds = reorderToolbarIds(
      draft.value.pinnedActionIds,
      actions.map((action) => action.id)
    );
  },
});
const menu = computed(() =>
  MESSAGE_TOOLBAR_ACTIONS.filter(
    (action) =>
      !draft.value.pinnedActionIds.includes(action.id) && matches(action.label)
  )
);
function pin(id: string) {
  if (!draft.value.pinnedActionIds.includes(id))
    draft.value.pinnedActionIds.push(id);
}
function unpin(id: string) {
  draft.value.pinnedActionIds = draft.value.pinnedActionIds.filter(
    (item) => item !== id
  );
}
function move(id: string, direction: number) {
  const index = draft.value.pinnedActionIds.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= draft.value.pinnedActionIds.length)
    return;
  const ids = [...draft.value.pinnedActionIds];
  [ids[index], ids[target]] = [ids[target], ids[index]];
  draft.value.pinnedActionIds = ids;
}
function close(visible: boolean) {
  if (!saving.value) emit("update:modelValue", visible);
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    await props.saveLayout(normalizeMessageToolbarLayout(draft.value));
    emit("update:modelValue", false);
  } catch {
    saveError.value = "布局保存失败，修改已保留，请重试。";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    title="自定义消息工具栏"
    width="min(760px, calc(100vw - 32px))"
    :close-on-backdrop-click="!saving"
    :show-close-button="!saving"
    @update:model-value="close"
  >
    <div class="customizer" data-testid="message-toolbar-customizer">
      <section class="layout-preview" aria-label="消息工具栏布局预览">
        <div class="preview-actions">
          <span v-for="action in pinned" :key="action.id" :title="action.label"
            ><component :is="action.icon" :size="16"
          /></span>
          <span class="preview-fixed" title="展开操作"
            ><ChevronsLeftRight :size="16"
          /></span>
          <span class="preview-fixed" title="更多"
            ><MoreHorizontal :size="16"
          /></span>
        </div>
        <p>
          常驻操作从左到右排列，其余操作收纳到“更多”。分支切换与停止生成始终保留。
        </p>
      </section>
      <ElInput
        v-model="search"
        placeholder="搜索操作"
        :prefix-icon="Search"
        clearable
        aria-label="搜索消息操作"
        :disabled="saving"
      />
      <fieldset class="placement-editor" :disabled="saving">
        <section class="placement-column">
          <h4>
            常驻工具栏 <span>{{ pinned.length }}</span>
          </h4>
          <VueDraggableNext
            v-model="filteredPinned"
            class="action-list"
            handle=".drag-handle"
            :animation="150"
            :disabled="saving"
            ghost-class="action-ghost"
          >
            <div
              v-for="action in filteredPinned"
              :key="action.id"
              class="action-row"
              :data-action-id="action.id"
            >
              <span class="drag-handle" aria-hidden="true"
                ><GripVertical :size="14"
              /></span>
              <component :is="action.icon" :size="16" class="action-icon" />
              <span class="action-label">{{ action.label }}</span>
              <div class="row-controls">
                <button
                  type="button"
                  class="order-btn"
                  :aria-label="'前移' + action.label"
                  :disabled="
                    saving || draft.pinnedActionIds.indexOf(action.id) === 0
                  "
                  @click="move(action.id, -1)"
                >
                  <ArrowUp :size="14" />
                </button>
                <button
                  type="button"
                  class="order-btn"
                  :aria-label="'后移' + action.label"
                  :disabled="
                    saving ||
                    draft.pinnedActionIds.indexOf(action.id) ===
                      draft.pinnedActionIds.length - 1
                  "
                  @click="move(action.id, 1)"
                >
                  <ArrowDown :size="14" />
                </button>
                <button
                  type="button"
                  class="placement-link"
                  @click="unpin(action.id)"
                >
                  收纳
                </button>
              </div>
            </div>
          </VueDraggableNext>
          <p v-if="!filteredPinned.length" class="empty-list">
            {{ search ? "没有匹配的操作" : "从右侧挑选常用操作" }}
          </p>
        </section>
        <section class="placement-column">
          <h4>
            更多菜单 <span>{{ menu.length }}</span>
          </h4>
          <div class="action-list">
            <div
              v-for="action in menu"
              :key="action.id"
              class="action-row"
              :data-action-id="action.id"
            >
              <component
                :is="action.icon"
                :size="16"
                class="action-icon"
              /><span class="action-label">{{ action.label }}</span>
              <button
                type="button"
                class="placement-link"
                @click="pin(action.id)"
              >
                常驻
              </button>
            </div>
          </div>
          <p v-if="!menu.length" class="empty-list">
            {{ search ? "没有匹配的操作" : "所有操作已加入常驻区" }}
          </p>
        </section>
      </fieldset>
      <p v-if="saveError" class="save-error" role="alert">{{ saveError }}</p>
    </div>
    <template #footer>
      <div class="customizer-footer">
        <ElButton
          :disabled="saving"
          @click="draft = createDefaultMessageToolbarLayout()"
          >恢复默认</ElButton
        >
        <div>
          <ElButton :disabled="saving" @click="close(false)">取消</ElButton
          ><ElButton
            type="primary"
            :loading="saving"
            data-testid="message-toolbar-save"
            @click="save"
            >保存</ElButton
          >
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.customizer {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--text-color);
}
.layout-preview {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
}
.preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-items: center;
}
.preview-actions > span {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--text-color-light);
}
.preview-fixed {
  opacity: 0.65;
}
.layout-preview p {
  margin: 8px 0 0;
  color: var(--text-color-light);
  font-size: 12px;
  line-height: 1.6;
}
.placement-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.placement-column {
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.placement-column h4 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  font-weight: 500;
}
.placement-column h4 span {
  color: var(--text-color-light);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.action-list {
  min-height: 36px;
  max-height: min(360px, 42vh);
  overflow-y: auto;
  padding: 6px;
}
.action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 6px;
  border-radius: 5px;
}
.action-row:hover {
  background: var(--hover-bg);
}
.action-icon {
  flex: none;
  color: var(--text-color-light);
}
.action-label {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
}
.drag-handle {
  display: flex;
  flex: none;
  cursor: grab;
  color: var(--text-color-light);
}
.row-controls {
  display: flex;
  align-items: center;
  flex: none;
  gap: 2px;
}
.order-btn,
.placement-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  padding: 4px;
  min-height: 28px;
  border-radius: 4px;
  background: transparent;
  color: var(--text-color-light);
  cursor: pointer;
}
.order-btn {
  width: 24px;
}
.placement-link {
  color: var(--primary-color);
  font-size: 12px;
  white-space: nowrap;
}
.order-btn:hover:enabled,
.placement-link:hover:enabled {
  background: var(--hover-bg);
}
.order-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.order-btn:focus-visible,
.placement-link:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}
.action-ghost {
  opacity: 0.35;
  background: var(--hover-bg);
}
.empty-list {
  margin: 0;
  padding: 20px 12px;
  text-align: center;
  color: var(--text-color-light);
  font-size: 12px;
}
.save-error {
  margin: 0;
  color: var(--error-color);
  font-size: 13px;
}
.customizer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
@media (max-width: 620px) {
  .placement-editor {
    grid-template-columns: minmax(0, 1fr);
  }
  .action-list {
    max-height: 25vh;
  }
}
</style>
