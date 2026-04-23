<script setup lang="ts">
import { ref, computed } from "vue";
import {
  Plus,
  Trash2,
  GripVertical,
  Play,
  MousePointer2,
  Scroll,
  Timer,
  Keyboard,
  Target,
  EyeOff,
  Coffee,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-vue-next";
import { useWebDistilleryStore } from "../../stores/store";
import { useLivePreview } from "../../composables/useLivePreview";
import { actionRunner } from "../../core/action-runner";
import type { ActionStep } from "../../types";
import { VueDraggableNext as Draggable } from "vue-draggable-next";

const store = useWebDistilleryStore();
const { triggerLivePreview } = useLivePreview();

// 动作类型元数据
const ACTION_TYPES = [
  { type: "click", label: "点击", icon: MousePointer2, color: "#409eff" },
  { type: "scroll", label: "滚动", icon: Scroll, color: "#67c23a" },
  { type: "wait", label: "等待", icon: Timer, color: "#e6a23c" },
  { type: "wait-idle", label: "等待空闲", icon: Coffee, color: "#909399" },
  { type: "input", label: "输入", icon: Keyboard, color: "#f56c6c" },
  { type: "hover", label: "悬停", icon: Target, color: "#b37feb" },
  { type: "remove", label: "移除", icon: EyeOff, color: "#ff85c0" },
];

const actions = computed({
  get: () => store.recipeDraft?.actions || [],
  set: (val) => {
    if (store.recipeDraft) {
      store.recipeDraft.actions = val;
      store.isDraftDirty = true;
    }
  },
});

// 编辑状态
const editingIndex = ref<number | null>(null);
const editForm = ref<ActionStep | null>(null);

// 执行状态
const isRunning = ref(false);
const stepStatuses = ref<Record<number, "running" | "success" | "error" | "idle">>({});
const stepErrors = ref<Record<number, string>>({});

// 获取步骤描述
const getStepDescription = (step: ActionStep) => {
  switch (step.type) {
    case "click":
      return `点击 ${step.selector}`;
    case "scroll":
      if (step.selector) return `滚动到 ${step.selector}`;
      if (step.toBottom) return `滚动到底部`;
      return `向下滚动 ${step.distance || 500}px`;
    case "wait":
      if (step.selector) return `等待 ${step.selector} 出现`;
      return `等待 ${step.value || 1000}ms`;
    case "wait-idle":
      return `等待页面空闲 (${step.timeout || 2000}ms)`;
    case "input":
      return `输入 "${step.value}" 到 ${step.selector}`;
    case "hover":
      return `悬停 ${step.selector}`;
    case "remove":
      return `移除 ${step.selector}`;
    default:
      return "未知动作";
  }
};

const getActionIcon = (type: string) => {
  return ACTION_TYPES.find((t) => t.type === type)?.icon || MousePointer2;
};

const getActionColor = (type: string) => {
  return ACTION_TYPES.find((t) => t.type === type)?.color || "#909399";
};

// 动作操作
const handleAddAction = (type: string) => {
  const newStep: any = { type };
  if (["click", "input", "hover", "remove"].includes(type)) {
    newStep.selector = "";
  }
  if (type === "input") newStep.value = "";
  if (type === "wait") newStep.value = 1000;
  if (type === "scroll") newStep.distance = 500;

  store.addAction(newStep as ActionStep);
  // 自动开启编辑
  editingIndex.value = actions.value.length - 1;
  editForm.value = { ...newStep };
};

const handleRemoveAction = (index: number) => {
  store.removeAction(index);
  if (editingIndex.value === index) {
    editingIndex.value = null;
    editForm.value = null;
  }
};

const handleEditAction = (index: number) => {
  editingIndex.value = index;
  editForm.value = JSON.parse(JSON.stringify(actions.value[index]));
};

const handleSaveEdit = () => {
  if (editingIndex.value !== null && editForm.value) {
    store.updateAction(editingIndex.value, editForm.value);
    editingIndex.value = null;
    editForm.value = null;
  }
};

const handleCancelEdit = () => {
  editingIndex.value = null;
  editForm.value = null;
};

// 拾取器集成
const startPick = (index: number) => {
  store.setPickerMode("action", index);
};

// 回放测试
const runTest = async () => {
  if (isRunning.value) return;

  isRunning.value = true;
  stepStatuses.value = {};
  stepErrors.value = {};

  try {
    await actionRunner.runSequenceWithProgress(actions.value, (index, status, error) => {
      stepStatuses.value[index] = status;
      if (error) stepErrors.value[index] = error;
    });
    // 回放成功后自动触发实时预览（强制刷新 DOM）
    triggerLivePreview(true);
  } finally {
    isRunning.value = false;
  }
};

// 监听 store 中的拾取结果
// 注意：这部分逻辑通常在 InteractiveWorkbench 或 iframeBridge 处理
// ActionsTab 只需要响应 store.recipeDraft 的变化即可
</script>

<template>
  <div class="actions-tab">
    <div class="actions-header">
      <div class="title">动作序列 (Actions)</div>
      <div class="header-ops">
        <el-button type="primary" size="small" :loading="isRunning" @click="runTest">
          <template #icon><Play /></template>
          回放测试
        </el-button>

        <el-dropdown trigger="click" @command="handleAddAction">
          <el-button type="primary" size="small" plain>
            <template #icon><Plus /></template>
            添加步骤
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="item in ACTION_TYPES" :key="item.type" :command="item.type">
                <div class="action-menu-item">
                  <el-icon :style="{ color: item.color }">
                    <component :is="item.icon" />
                  </el-icon>
                  <span>{{ item.label }}</span>
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="actions-list-container">
      <el-empty v-if="actions.length === 0" description="暂无动作步骤" />

      <Draggable
        v-else
        v-model="actions"
        item-key="index"
        handle=".drag-handle"
        class="actions-list"
        ghost-class="ghost-step"
      >
        <div
          v-for="(step, index) in actions"
          :key="index"
          class="action-item"
          :class="{
            'is-editing': editingIndex === index,
            [`status-${stepStatuses[index] || 'idle'}`]: true,
          }"
        >
          <!-- 正常展示模式 -->
          <template v-if="editingIndex !== index">
            <div class="drag-handle">
              <GripVertical :size="16" />
            </div>

            <div
              class="action-icon"
              :style="{ backgroundColor: getActionColor(step.type) + '20', color: getActionColor(step.type) }"
            >
              <component :is="getActionIcon(step.type)" :size="16" />
            </div>

            <div class="action-content">
              <div class="action-title">
                {{ ACTION_TYPES.find((t) => t.type === step.type)?.label }}
              </div>
              <div class="action-desc" :title="getStepDescription(step)">
                {{ getStepDescription(step) }}
              </div>
            </div>

            <div class="action-status-icon">
              <el-icon v-if="stepStatuses[index] === 'running'" class="is-loading"><Loader2 /></el-icon>
              <el-icon v-else-if="stepStatuses[index] === 'success'" color="var(--el-color-success)"
                ><CheckCircle2
              /></el-icon>
              <el-tooltip v-else-if="stepStatuses[index] === 'error'" :content="stepErrors[index]" placement="top">
                <el-icon color="var(--el-color-danger)"><XCircle /></el-icon>
              </el-tooltip>
            </div>

            <div class="action-ops">
              <el-button link size="small" @click="handleEditAction(index)">编辑</el-button>
              <el-button link type="danger" size="small" @click="handleRemoveAction(index)">
                <Trash2 :size="14" />
              </el-button>
            </div>
          </template>

          <!-- 编辑模式 -->
          <template v-else>
            <div class="edit-panel" v-if="editForm">
              <div class="edit-header">
                <span class="edit-title">编辑步骤 {{ index + 1 }}</span>
                <div class="edit-ops">
                  <el-button size="small" @click="handleCancelEdit">取消</el-button>
                  <el-button size="small" type="primary" @click="handleSaveEdit">保存</el-button>
                </div>
              </div>

              <el-form :model="editForm" label-position="top" size="small">
                <!-- 选择器字段 -->
                <el-form-item v-if="'selector' in editForm" label="选择器 (Selector)">
                  <div class="selector-input">
                    <el-input v-model="editForm.selector" placeholder="请输入 CSS 选择器" />
                    <el-button
                      :type="store.pickerMode === 'action' && store.pickerActionIndex === index ? 'primary' : 'default'"
                      @click="startPick(index)"
                    >
                      <template #icon><Target :size="14" /></template>
                      拾取
                    </el-button>
                  </div>
                </el-form-item>
                <!-- 距离字段 (scroll) -->
                <el-form-item
                  v-if="editForm.type === 'scroll' && !('selector' in editForm && editForm.selector)"
                  label="滚动距离 (px)"
                >
                  <el-input-number v-model="(editForm as any).distance" :min="0" :step="100" />
                  <el-checkbox v-model="(editForm as any).toBottom" style="margin-left: 12px">到底部</el-checkbox>
                </el-form-item>

                <!-- 等待时长 (wait) -->
                <el-form-item
                  v-if="editForm.type === 'wait' && !('selector' in editForm && editForm.selector)"
                  label="等待时间 (ms)"
                >
                  <el-input-number v-model="(editForm as any).value" :min="0" :step="500" />
                </el-form-item>

                <!-- 超时时间 (wait/wait-idle) -->
                <el-form-item v-if="['wait', 'wait-idle'].includes(editForm.type)" label="超时限制 (ms)">
                  <el-input-number v-model="(editForm as any).timeout" :min="0" :step="1000" />
                </el-form-item>

                <!-- 输入内容 (input) -->
                <el-form-item v-if="editForm.type === 'input'" label="输入文本">
                  <el-input v-model="(editForm as any).value" placeholder="请输入要输入的内容" />
                </el-form-item>
              </el-form>
            </div>
          </template>
        </div>
      </Draggable>
    </div>
  </div>
</template>

<style scoped>
.actions-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  gap: 12px;
}

.actions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-ops {
  display: flex;
  gap: 8px;
}

.action-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.actions-list-container {
  flex: 1;
  overflow-y: auto;
}

.actions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-item {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.2s ease;
  position: relative;
}

.action-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.action-item.is-editing {
  flex-direction: column;
  align-items: stretch;
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px rgba(var(--el-color-primary-rgb), 0.1);
}

.drag-handle {
  cursor: grab;
  color: var(--el-text-color-placeholder);
  display: flex;
  align-items: center;
}

.action-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.action-content {
  flex: 1;
  min-width: 0;
}

.action-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.action-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.action-ops {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.action-item:hover .action-ops {
  opacity: 1;
}

.action-status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

/* 编辑面板样式 */
.edit-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.edit-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.selector-input {
  display: flex;
  gap: 8px;
  width: 100%;
}

.ghost-step {
  opacity: 0.5;
  background: var(--el-color-primary-light-9);
  border: 1px dashed var(--el-color-primary);
}

/* 状态样式 */
.status-running {
  border-left: 3px solid var(--el-color-primary);
}
.status-success {
  border-left: 3px solid var(--el-color-success);
}
.status-error {
  border-left: 3px solid var(--el-color-danger);
  background-color: rgba(var(--el-color-danger-rgb), 0.02);
}

:deep(.el-form-item) {
  margin-bottom: 8px;
}

:deep(.el-form-item__label) {
  font-size: 11px;
  padding-bottom: 4px;
  line-height: 1;
}
</style>
