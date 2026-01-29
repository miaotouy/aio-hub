<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useQuickActionStore } from "../../stores/quickActionStore";
import type { QuickAction, QuickActionSet } from "../../types/quick-action";
import { Plus, Trash2, Copy, Settings2, ChevronRight, Zap, Save, Info } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { useDebounceFn } from "@vueuse/core";

const props = defineProps<{
  id: string;
}>();

const store = useQuickActionStore();
const loading = ref(false);
const currentSet = ref<QuickActionSet | null>(null);
const selectedActionId = ref<string | null>(null);

// 加载数据
const loadSet = async () => {
  if (!props.id) return;
  loading.value = true;
  try {
    const set = await store.getQuickActionSet(props.id);
    if (set) {
      // 深拷贝
      currentSet.value = JSON.parse(JSON.stringify(set));

      if (!selectedActionId.value && set.actions.length > 0) {
        selectedActionId.value = set.actions[0].id;
      }
    }
  } catch (error) {
    customMessage.error("加载快捷操作组失败");
  } finally {
    loading.value = false;
  }
};

watch(() => props.id, loadSet, { immediate: true });

const currentAction = computed(() => {
  if (!currentSet.value || !selectedActionId.value) return null;
  return currentSet.value.actions.find((a) => a.id === selectedActionId.value);
});

const handleAddAction = () => {
  if (!currentSet.value) return;
  const newId = `action-${Date.now()}`;
  const newAction: QuickAction = {
    id: newId,
    label: "新操作",
    content: "{{input}}",
    autoSend: false,
    icon: "Zap",
  };
  currentSet.value.actions.push(newAction);
  selectedActionId.value = newId;
  saveChanges();
};

const handleDeleteAction = (id: string) => {
  if (!currentSet.value) return;
  const index = currentSet.value.actions.findIndex((a) => a.id === id);
  if (index !== -1) {
    currentSet.value.actions.splice(index, 1);
    if (selectedActionId.value === id) {
      selectedActionId.value =
        currentSet.value.actions.length > 0 ? currentSet.value.actions[0].id : null;
    }
    saveChanges();
  }
};

const handleDuplicateAction = (action: QuickAction) => {
  if (!currentSet.value) return;
  const newId = `action-${Date.now()}`;
  const newAction = {
    ...JSON.parse(JSON.stringify(action)),
    id: newId,
    label: `${action.label} (副本)`,
  };
  currentSet.value.actions.push(newAction);
  selectedActionId.value = newId;
  saveChanges();
};

// 自动保存
const saveChanges = useDebounceFn(async () => {
  if (!currentSet.value || !props.id) return;
  await store.updateQuickActionSet(props.id, currentSet.value);
}, 500);

watch(
  currentSet,
  () => {
    saveChanges();
  },
  { deep: true }
);

const handleManualSave = async () => {
  if (!currentSet.value || !props.id) return;
  await store.updateQuickActionSet(props.id, currentSet.value);
  customMessage.success("已保存");
};
</script>

<template>
  <div class="qa-detail-container" v-loading="loading">
    <aside class="qa-sidebar">
      <div class="sidebar-header">
        <span class="title">操作列表</span>
        <el-button :icon="Plus" type="primary" circle size="small" @click="handleAddAction" />
      </div>

      <div class="action-list custom-scrollbar">
        <div
          v-for="action in currentSet?.actions"
          :key="action.id"
          class="action-item-row"
          :class="{ active: selectedActionId === action.id }"
          @click="selectedActionId = action.id"
        >
          <div class="col-icon">
            <el-icon><Zap /></el-icon>
          </div>
          <div class="col-name">
            <span class="label-text">{{ action.label }}</span>
          </div>
          <div class="col-handle">
            <ChevronRight :size="14" />
          </div>
        </div>
        <el-empty v-if="!currentSet?.actions.length" description="暂无操作" :image-size="40" />
      </div>
    </aside>

    <main class="qa-editor-area" v-if="currentAction">
      <div class="editor-header">
        <div class="header-left">
          <el-input
            v-model="currentAction.label"
            placeholder="操作名称"
            class="action-name-input"
          />
        </div>
        <div class="header-actions">
          <el-button :icon="Save" circle @click="handleManualSave" title="手动保存" />
          <el-button
            :icon="Copy"
            circle
            @click="handleDuplicateAction(currentAction)"
            title="克隆"
          />
          <el-popconfirm title="确定删除此操作吗？" @confirm="handleDeleteAction(currentAction.id)">
            <template #reference>
              <el-button :icon="Trash2" circle plain type="danger" title="删除" />
            </template>
          </el-popconfirm>
        </div>
      </div>

      <div class="editor-scroll-content custom-scrollbar">
        <div class="section-core">
          <div class="form-group">
            <label class="form-label">
              模板内容 (Template)
              <el-tooltip content="使用 {{input}} 代表输入框内容或选中内容">
                <el-icon class="info-icon"><Info /></el-icon>
              </el-tooltip>
            </label>
            <div class="editor-wrapper">
              <RichCodeEditor
                v-model="currentAction.content"
                language="markdown"
                :height="'200px'"
              />
            </div>
          </div>

          <div class="advanced-grid">
            <div class="control-item">
              <span class="label">自动发送</span>
              <el-switch v-model="currentAction.autoSend" active-text="执行后立即发送" />
            </div>
            <div class="control-item full-width">
              <span class="label">描述</span>
              <el-input
                v-model="currentAction.description"
                type="textarea"
                :rows="2"
                placeholder="简要说明此操作的作用..."
              />
            </div>
          </div>
        </div>

        <div class="section-group-settings" v-if="currentSet">
          <div class="section-header">
            <el-icon><Settings2 /></el-icon>
            <span>组设置</span>
          </div>
          <div class="advanced-grid">
            <div class="control-item">
              <span class="label">组启用状态</span>
              <el-switch v-model="currentSet.isEnabled" active-text="在输入框显示" />
            </div>
            <div class="control-item full-width">
              <span class="label">组描述</span>
              <el-input v-model="currentSet.description" placeholder="此组的用途说明..." />
            </div>
          </div>
        </div>
      </div>
    </main>

    <div v-else class="empty-selection">
      <el-empty description="选择一个操作开始编辑" />
    </div>
  </div>
</template>

<style scoped>
.qa-detail-container {
  display: flex;
  height: 100%;
  background-color: var(--card-bg);
}

.qa-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  background-color: var(--sidebar-bg);
}

.sidebar-header {
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-header .title {
  font-weight: 600;
  font-size: 13px;
}

.action-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.action-item-row {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
  gap: 8px;
}

.action-item-row:hover {
  background-color: var(--el-fill-color-light);
}

.action-item-row.active {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.col-icon {
  display: flex;
  align-items: center;
  color: var(--el-text-color-secondary);
}

.active .col-icon {
  color: var(--el-color-primary);
}

.col-name {
  flex: 1;
  min-width: 0;
}

.label-text {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.col-handle {
  opacity: 0;
  transition: opacity 0.2s;
}

.action-item-row:hover .col-handle,
.action-item-row.active .col-handle {
  opacity: 1;
}

.qa-editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.editor-header {
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--card-bg);
}

.header-left {
  flex: 1;
  margin-right: 16px;
}

.action-name-input :deep(.el-input__wrapper) {
  box-shadow: none;
  border: 1px solid var(--border-color);
  background: transparent;
}

.action-name-input :deep(.el-input__inner) {
  font-size: 16px;
  font-weight: 600;
}

.editor-scroll-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.section-core {
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-weight: 500;
  font-size: 14px;
}

.info-icon {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.editor-wrapper {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.advanced-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-item.full-width {
  grid-column: 1 / -1;
}

.control-item .label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.section-group-settings {
  border-top: 1px solid var(--border-color);
  padding-top: 20px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 16px;
}

.empty-selection {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}
</style>
