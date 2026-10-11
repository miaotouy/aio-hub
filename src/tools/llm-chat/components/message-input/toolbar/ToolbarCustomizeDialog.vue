<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElButton, ElInput } from "element-plus";
import {
  ArrowUp,
  ArrowDown,
  GripVertical,
  MoreHorizontal,
  ArrowUpRight,
  Search,
} from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useMessageInputStore } from "../../../stores/messageInputStore";
import { useChatSettings } from "../../../composables/settings/useChatSettings";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { INPUT_TOOLBAR_ACTIONS } from "./inputToolbarActions";
import {
  createCompactToolbarLayout,
  createFullToolbarLayout,
  normalizeInputToolbarLayout,
} from "../../../config/inputToolbar";
import type { InputToolbarLayout } from "../../../types/input-toolbar";

const props = defineProps<{ isDetached?: boolean }>();
const inputStore = useMessageInputStore();
const { settings, saveInputToolbarLayout } = useChatSettings();
const bus = useWindowSyncBus();
const draft = ref<InputToolbarLayout>(createCompactToolbarLayout());
const search = ref("");
const saving = ref(false);
const saveError = ref("");
const draggedId = ref<string | null>(null);
const definitions = new Map(
  INPUT_TOOLBAR_ACTIONS.map((action) => [action.id as string, action])
);
const matches = (label: string) =>
  label.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase());
const pinnedActions = computed(() =>
  draft.value.pinnedActionIds.flatMap((id) =>
    definitions.has(id) ? [definitions.get(id)!] : []
  )
);
const filteredPinned = computed(() =>
  pinnedActions.value.filter((action) => matches(action.label))
);
const menuActions = computed(() =>
  INPUT_TOOLBAR_ACTIONS.filter(
    (action) =>
      !draft.value.pinnedActionIds.includes(action.id) && matches(action.label)
  )
);
watch(
  () => inputStore.toolbarCustomizeVisible,
  (visible) => {
    if (!visible) return;
    draft.value = normalizeInputToolbarLayout(
      settings.value.uiPreferences.inputToolbar
    );
    search.value = "";
    saveError.value = "";
    draggedId.value = null;
  },
  { immediate: true }
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
function startDrag(id: string, event: DragEvent) {
  draggedId.value = id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }
}
function dropOn(targetId: string) {
  const source = draggedId.value;
  draggedId.value = null;
  if (!source || source === targetId || saving.value) return;
  const ids = draft.value.pinnedActionIds.filter((id) => id !== source);
  ids.splice(ids.indexOf(targetId), 0, source);
  draft.value.pinnedActionIds = ids;
}
function close(visible: boolean) {
  if (!saving.value) inputStore.toolbarCustomizeVisible = visible;
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    const layout = normalizeInputToolbarLayout(draft.value);
    if (props.isDetached)
      await bus.requestAction("llm-chat:update-input-toolbar-layout", {
        layout,
      });
    else await saveInputToolbarLayout(layout);
    inputStore.toolbarCustomizeVisible = false;
  } catch {
    saveError.value = "布局保存失败，修改已保留，请重试。";
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <BaseDialog
    :model-value="inputStore.toolbarCustomizeVisible"
    title="自定义工具栏"
    dialog-class="input-toolbar-customizer-dialog"
    width="min(780px, calc(100vw - 32px))"
    :close-on-backdrop-click="!saving"
    :show-close-button="!saving"
    @update:model-value="close"
  >
    <div class="customizer" data-testid="chat-toolbar-customizer">
      <section class="layout-preview" aria-label="工具栏布局预览">
        <div class="preview-bottom">
          <div class="preview-actions">
            <span
              v-for="action in pinnedActions"
              :key="action.id"
              :title="action.label"
              ><component :is="action.icon" :size="16"
            /></span>
          </div>
          <span class="preview-more" title="更多"
            ><MoreHorizontal :size="16"
          /></span>
          <span class="preview-send" title="发送"
            ><ArrowUpRight :size="16"
          /></span>
        </div>
      </section>
      <div class="editor-navigation">
        <h3 class="editor-title">系统操作</h3>
        <el-input
          v-model="search"
          placeholder="搜索操作"
          clearable
          class="action-search"
          aria-label="搜索操作"
          ><template #prefix><Search :size="14" /></template
        ></el-input>
      </div>
      <fieldset :disabled="saving" class="editor-fieldset">
        <div id="toolbar-system-panel" class="placement-columns">
          <section class="placement-column">
            <h4>
              常驻 <span>{{ pinnedActions.length }}</span>
            </h4>
            <div class="action-list">
              <div
                v-for="action in filteredPinned"
                :key="action.id"
                class="action-row"
                :class="{ 'is-dragging': draggedId === action.id }"
                :draggable="!saving"
                @dragstart="startDrag(action.id, $event)"
                @dragend="draggedId = null"
                @dragover.prevent
                @drop.prevent="dropOn(action.id)"
              >
                <GripVertical :size="14" class="drag-handle" /><component
                  :is="action.icon"
                  :size="16"
                  class="action-icon"
                />
                <span class="action-label">{{ action.label }}</span>
                <div class="row-actions">
                  <button
                    type="button"
                    :aria-label="'上移' + action.label"
                    :disabled="draft.pinnedActionIds.indexOf(action.id) === 0"
                    @click="move(action.id, -1)"
                  >
                    <ArrowUp :size="13" />
                  </button>
                  <button
                    type="button"
                    :aria-label="'下移' + action.label"
                    :disabled="
                      draft.pinnedActionIds.indexOf(action.id) ===
                      draft.pinnedActionIds.length - 1
                    "
                    @click="move(action.id, 1)"
                  >
                    <ArrowDown :size="13" />
                  </button>
                  <button
                    type="button"
                    class="placement-link"
                    data-testid="chat-toolbar-unpin"
                    :data-action-id="action.id"
                    @click="unpin(action.id)"
                  >
                    收纳
                  </button>
                </div>
              </div>
              <p v-if="!filteredPinned.length" class="empty-list">
                {{ search ? "没有匹配的操作" : "从右侧挑选常用操作" }}
              </p>
            </div>
          </section>
          <section class="placement-column">
            <h4>
              更多菜单 <span>{{ menuActions.length }}</span>
            </h4>
            <div class="action-list">
              <div
                v-for="action in menuActions"
                :key="action.id"
                class="action-row"
              >
                <component
                  :is="action.icon"
                  :size="16"
                  class="action-icon"
                /><span class="action-label">{{ action.label }}</span
                ><button
                  type="button"
                  class="placement-link"
                  data-testid="chat-toolbar-pin"
                  :data-action-id="action.id"
                  @click="pin(action.id)"
                >
                  常驻
                </button>
              </div>
              <p v-if="!menuActions.length" class="empty-list">
                {{ search ? "没有匹配的操作" : "所有操作已加入常驻区" }}
              </p>
            </div>
          </section>
        </div>
      </fieldset>
      <p v-if="saveError" class="save-error" role="alert">{{ saveError }}</p>
    </div>
    <template #footer
      ><div class="customizer-footer">
        <div class="presets">
          <el-button
            size="small"
            :disabled="saving"
            data-testid="chat-toolbar-layout-compact"
            @click="draft = createCompactToolbarLayout()"
            >简洁布局</el-button
          >
          <el-button
            size="small"
            :disabled="saving"
            data-testid="chat-toolbar-layout-full"
            @click="draft = createFullToolbarLayout()"
            >完整布局</el-button
          >
          <el-button
            size="small"
            :disabled="saving"
            @click="draft = createCompactToolbarLayout()"
            >恢复默认</el-button
          >
        </div>
        <div class="confirm-actions">
          <el-button
            :disabled="saving"
            data-testid="chat-toolbar-cancel"
            @click="close(false)"
            >取消</el-button
          ><el-button
            type="primary"
            :loading="saving"
            data-testid="chat-toolbar-save"
            @click="save"
            >保存</el-button
          >
        </div>
      </div></template
    >
  </BaseDialog>
</template>
<style scoped>
.customizer {
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: var(--text-color-primary);
}
.layout-preview {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
}
.preview-bottom {
  display: flex;
  gap: 2px;
  align-items: center;
}
.preview-actions {
  display: flex;
  min-width: 0;
  overflow-x: auto;
  gap: 2px;
}
.preview-actions > span,
.preview-more,
.preview-send {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 28px;
  color: var(--text-color-secondary);
}
.preview-send {
  margin-left: auto;
  width: 28px;
  border-radius: 50%;
  background: var(--primary-color);
  color: var(--el-color-white);
}
.editor-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.editor-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.action-search {
  max-width: 220px;
}
.editor-fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.placement-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.placement-column {
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
h4 {
  margin: 0;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
}
h4 > span {
  color: var(--text-color-secondary);
  font-weight: 400;
}
.action-list {
  height: min(350px, 42vh);
  overflow-y: auto;
  padding: 6px;
}
.action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 4px 6px;
  border-radius: 5px;
  font-size: 12px;
}
.action-row:hover {
  background: var(--el-fill-color-light);
}
.action-row.is-dragging {
  opacity: 0.45;
}
.action-icon,
.drag-handle {
  flex: none;
  color: var(--text-color-secondary);
}
.drag-handle {
  cursor: grab;
}
.action-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-actions {
  display: flex;
  gap: 2px;
  align-items: center;
  flex: none;
}
.row-actions > button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 24px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
}
.row-actions > button:hover:not(:disabled) {
  background: var(--el-fill-color-darker);
}
.row-actions > button:disabled {
  opacity: 0.25;
  cursor: default;
}
.placement-link,
.row-actions > .placement-link {
  width: auto;
  flex: none;
  padding: 4px;
  border: 0;
  background: transparent;
  color: var(--primary-color);
  font: inherit;
  cursor: pointer;
}
.empty-list {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-color-secondary);
}
.customizer-footer,
.presets,
.confirm-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.customizer-footer {
  width: 100%;
  justify-content: space-between;
  flex-wrap: wrap;
}
.presets :deep(.el-button + .el-button),
.confirm-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.save-error {
  margin: 0;
  color: var(--error-color);
  font-size: 12px;
}
@media (max-width: 600px) {
  .placement-columns {
    grid-template-columns: 1fr;
  }
  .action-list {
    height: 180px;
  }
  .editor-navigation {
    flex-wrap: wrap;
  }
  .action-search {
    max-width: none;
  }
  .customizer-footer {
    gap: 12px;
  }
}
</style>

<style>
.input-toolbar-customizer-dialog {
  background: var(--card-bg-solid);
}
</style>
