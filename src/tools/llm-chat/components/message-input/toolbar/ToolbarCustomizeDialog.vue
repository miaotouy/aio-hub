<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElButton, ElInput, ElSwitch } from "element-plus";
import { VueDraggableNext } from "vue-draggable-next";
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
import { INPUT_TOOLBAR_STATUSES } from "./inputToolbarStatuses";
import {
  createCompactToolbarLayout,
  createFullToolbarLayout,
  normalizeInputToolbarLayout,
  reorderToolbarIds,
} from "../../../config/inputToolbar";
import type { InputToolbarLayout } from "../../../types/input-toolbar";

const props = defineProps<{ isDetached?: boolean }>();
const inputStore = useMessageInputStore();
const { settings, saveInputToolbarLayout } = useChatSettings();
const bus = useWindowSyncBus();
const draft = ref<InputToolbarLayout>(createCompactToolbarLayout());
const search = ref("");
const section = ref("actions");
const sections = [
  { id: "actions", label: "左侧操作" },
  { id: "statuses", label: "右侧状态" },
  { id: "quick-actions", label: "快捷操作" },
];
const statusDefinitions = new Map(
  INPUT_TOOLBAR_STATUSES.map((status) => [status.id as string, status])
);
const enabledStatuses = computed(() =>
  draft.value.statusIds.flatMap((id) =>
    statusDefinitions.has(id) ? [statusDefinitions.get(id)!] : []
  )
);
const statusRows = computed({
  get: () => [
    ...enabledStatuses.value,
    ...INPUT_TOOLBAR_STATUSES.filter(
      (status) => !draft.value.statusIds.includes(status.id)
    ),
  ],
  set: (statuses) => {
    draft.value.statusIds = reorderToolbarIds(
      draft.value.statusIds,
      statuses
        .filter((status) => draft.value.statusIds.includes(status.id))
        .map((status) => status.id)
    );
  },
});
type OrderKey = "pinnedActionIds" | "statusIds";
function focusSection(id: string, direction: number) {
  const index = sections.findIndex((item) => item.id === id);
  const next =
    sections[(index + direction + sections.length) % sections.length];
  section.value = next.id;
  document.getElementById("toolbar-tab-" + next.id)?.focus();
}
const saving = ref(false);
const saveError = ref("");
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
const filteredPinned = computed({
  get: () => pinnedActions.value.filter((action) => matches(action.label)),
  set: (actions) => {
    draft.value.pinnedActionIds = reorderToolbarIds(
      draft.value.pinnedActionIds,
      actions.map((action) => action.id)
    );
  },
});
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
    section.value = "actions";
    saveError.value = "";
  },
  { immediate: true }
);

function pin(id: string, key: OrderKey = "pinnedActionIds") {
  if (!draft.value[key].includes(id)) draft.value[key].push(id);
}
function unpin(id: string, key: OrderKey = "pinnedActionIds") {
  draft.value[key] = draft.value[key].filter((item) => item !== id);
}
function toggleStatus(id: string, enabled: boolean | string | number) {
  if (enabled) pin(id, "statusIds");
  else unpin(id, "statusIds");
}
function move(
  id: string,
  direction: number,
  key: OrderKey = "pinnedActionIds"
) {
  const index = draft.value[key].indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= draft.value[key].length) return;
  const ids = [...draft.value[key]];
  [ids[index], ids[target]] = [ids[target], ids[index]];
  draft.value[key] = ids;
}
function canMoveStatus(event: { related: HTMLElement }) {
  return event.related.classList.contains("is-enabled");
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
          <div class="preview-statuses">
            <span
              v-for="status in enabledStatuses"
              :key="status.id"
              class="preview-status"
              :title="status.label"
            >
              <component :is="status.icon" :size="13" />
              <span>{{ status.sample }}</span>
            </span>
          </div>
          <span class="preview-send" title="发送"
            ><ArrowUpRight :size="16"
          /></span>
        </div>
        <p class="preview-caption">布局预览 · 状态内容为示例</p>
      </section>
      <div class="editor-navigation">
        <div class="editor-tabs" role="tablist" aria-label="工具栏配置区域">
          <button
            v-for="item in sections"
            :id="'toolbar-tab-' + item.id"
            :key="item.id"
            type="button"
            role="tab"
            :aria-selected="section === item.id"
            :tabindex="section === item.id ? 0 : -1"
            @keydown.right.prevent="focusSection(item.id, 1)"
            @keydown.left.prevent="focusSection(item.id, -1)"
            :aria-controls="'toolbar-panel-' + item.id"
            :disabled="saving"
            @click="section = item.id"
          >
            {{ item.label }}
          </button>
        </div>
        <el-input
          v-if="section === 'actions'"
          v-model="search"
          placeholder="搜索操作"
          clearable
          class="action-search"
          aria-label="搜索操作"
          ><template #prefix><Search :size="14" /></template
        ></el-input>
      </div>
      <fieldset :disabled="saving" class="editor-fieldset">
        <div
          v-if="section === 'actions'"
          id="toolbar-panel-actions"
          class="placement-columns"
          role="tabpanel"
          aria-labelledby="toolbar-tab-actions"
        >
          <section class="placement-column">
            <h4>
              常驻 <span>{{ pinnedActions.length }}</span>
            </h4>
            <div class="action-list">
              <VueDraggableNext
                v-model="filteredPinned"
                item-key="id"
                handle=".drag-handle"
                :disabled="saving"
                :force-fallback="true"
                :fallback-tolerance="3"
                :animation="150"
                ghost-class="toolbar-sort-ghost"
                chosen-class="toolbar-sort-chosen"
              >
                <div
                  v-for="action in filteredPinned"
                  :key="action.id"
                  class="action-row"
                  :data-toolbar-item-id="action.id"
                >
                  <span class="drag-handle"><GripVertical :size="14" /></span
                  ><component
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
              </VueDraggableNext>
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
        <section
          v-else-if="section === 'statuses'"
          id="toolbar-panel-statuses"
          class="status-editor"
          role="tabpanel"
          aria-labelledby="toolbar-tab-statuses"
        >
          <p class="section-description">
            开启需要的状态，拖动或使用箭头调整从左到右的顺序。
          </p>
          <VueDraggableNext
            v-model="statusRows"
            class="status-list"
            item-key="id"
            handle=".drag-handle"
            draggable=".status-row.is-enabled"
            :move="canMoveStatus"
            :disabled="saving"
            :force-fallback="true"
            :fallback-tolerance="3"
            :animation="150"
            ghost-class="toolbar-sort-ghost"
            chosen-class="toolbar-sort-chosen"
          >
            <div
              v-for="status in statusRows"
              :key="status.id"
              class="action-row status-row"
              :class="{ 'is-enabled': draft.statusIds.includes(status.id) }"
              :data-toolbar-item-id="status.id"
            >
              <span
                class="drag-handle"
                :class="{ 'is-muted': !draft.statusIds.includes(status.id) }"
                ><GripVertical :size="14"
              /></span>
              <component :is="status.icon" :size="16" class="action-icon" />
              <div class="status-label">
                <span>{{ status.label }}</span
                ><small>{{ status.description }}</small>
              </div>
              <div class="row-actions">
                <button
                  type="button"
                  :aria-label="'上移' + status.label"
                  :disabled="draft.statusIds.indexOf(status.id) <= 0"
                  @click="move(status.id, -1, 'statusIds')"
                >
                  <ArrowUp :size="13" />
                </button>
                <button
                  type="button"
                  :aria-label="'下移' + status.label"
                  :disabled="
                    !draft.statusIds.includes(status.id) ||
                    draft.statusIds.indexOf(status.id) ===
                      draft.statusIds.length - 1
                  "
                  @click="move(status.id, 1, 'statusIds')"
                >
                  <ArrowDown :size="13" />
                </button>
              </div>
              <el-switch
                :model-value="draft.statusIds.includes(status.id)"
                :aria-label="'显示' + status.label"
                size="small"
                :disabled="saving"
                @update:model-value="toggleStatus(status.id, $event)"
              />
            </div>
          </VueDraggableNext>
        </section>
        <section
          v-else
          id="toolbar-panel-quick-actions"
          class="quick-actions-editor"
          role="tabpanel"
          aria-labelledby="toolbar-tab-quick-actions"
        >
          <div class="quick-actions-setting">
            <div class="status-label">
              <span>快捷按钮按组分行</span
              ><small>每个关联操作组单独占一行。</small>
            </div>
            <el-switch
              v-model="draft.groupQuickActionsBySet"
              aria-label="快捷按钮按组分行"
              :disabled="saving"
            />
          </div>
        </section>
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
  flex: 0 1 auto;
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
  width: 28px;
  border-radius: 50%;
  background: var(--primary-color);
  color: var(--el-color-white);
}
.preview-statuses {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
  max-width: 62%;
  margin-left: auto;
}
.preview-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--text-color-secondary);
  font-size: 11px;
}
.preview-status svg {
  flex: none;
}
.preview-status > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-caption {
  margin: 8px 0 0;
  color: var(--text-color-secondary);
  font-size: 11px;
}
.editor-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.editor-tabs button {
  padding: 7px 10px;
  border: 0;
  border-radius: 6px;
  color: var(--text-color-secondary);
  background: transparent;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.editor-tabs button[aria-selected="true"] {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}
.editor-tabs button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}
.status-editor,
.quick-actions-editor {
  min-height: min(396px, calc(42vh + 46px));
}
.section-description {
  margin: 0 0 12px;
  color: var(--text-color-secondary);
  font-size: 12px;
}
.status-list {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px;
}
.status-row {
  min-height: 48px;
}
.status-label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  min-width: 0;
  font-size: 13px;
}
.status-label small {
  color: var(--text-color-secondary);
  font-size: 12px;
}
.drag-handle.is-muted {
  opacity: 0.25;
  cursor: default;
}
.quick-actions-setting {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
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
.toolbar-sort-ghost {
  opacity: 0.3;
}
.toolbar-sort-chosen {
  background: var(--el-fill-color-light);
}
.toolbar-sort-chosen .drag-handle {
  cursor: grabbing;
}
.action-icon,
.drag-handle {
  flex: none;
  color: var(--text-color-secondary);
}
.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  min-height: 24px;
  cursor: grab;
  touch-action: none;
  user-select: none;
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
  .status-editor,
  .quick-actions-editor {
    min-height: 0;
  }
  .preview-statuses {
    max-width: 55%;
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
