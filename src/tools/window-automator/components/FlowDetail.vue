<script setup lang="ts">
/**
 * 方案详情页（二级页）— Quicker 风格重构版
 *
 * 布局：
 *  - 顶部：返回按钮 + 方案名称 + 操作按钮 + VSCode 风格三边折叠开关
 *  - 主体左侧：StepToolbox（窗口绑定 + 步骤类型按钮），可向左折叠为 0 宽
 *  - 主体右侧工作区：
 *      - 上：FlowEditor（一体化步骤流，含内嵌配置与徽章）
 *      - 下：ControlPanel（运行控制 + 日志），可向下折叠为 0 高
 */
import { computed, ref, watch, onBeforeUnmount } from "vue";
import {
  ArrowLeft,
  Pencil,
  Save,
  Trash2,
  Check,
  X,
  PanelLeft,
  TerminalSquare,
} from "lucide-vue-next";
import { useWindowAutomatorStore } from "../stores/windowAutomator.store";
import { useFlowPersistence } from "../composables/useFlowPersistence";
import { useFlowExecutor } from "../composables/useFlowExecutor";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import FlowEditor from "./FlowEditor.vue";
import ControlPanel from "./ControlPanel.vue";
import StepToolbox from "./StepToolbox.vue";
import type { ActionFlow, StepType, WindowInfo } from "../types";

const store = useWindowAutomatorStore();
const persistence = useFlowPersistence();
const executor = useFlowExecutor();

const flow = computed<ActionFlow | null>(() => store.currentFlow);
const descriptionEditing = ref(false);
const descriptionDraft = ref("");

/** 折叠状态 */
const showSidebar = ref(true);
const showConsole = ref(true);

let saveCanceller: { trigger: () => void; cancel: () => void } | null = null;

function setupAutoSave(target: ActionFlow) {
  saveCanceller?.cancel();
  saveCanceller = persistence.debouncedSave(target, 1500);
}

watch(
  flow,
  (val) => {
    if (val) {
      setupAutoSave(val);
      descriptionDraft.value = val.description;
    }
  },
  { immediate: true }
);

function addStep(type: StepType) {
  if (!flow.value) return;
  const step = store.addStep(flow.value.id, type);
  if (step) {
    store.selectStep(step.id);
    saveCanceller?.trigger();
  }
}

function onWindowBound(_w: WindowInfo | null) {
  // 绑定/解绑时立即触发一次保存，便于会话恢复
  saveCanceller?.trigger();
}

function back() {
  store.backToList();
}

function saveNow() {
  if (!flow.value) return;
  void persistence.save(flow.value);
  customMessage.success("已保存");
}

function startEditDescription() {
  descriptionEditing.value = true;
  descriptionDraft.value = flow.value?.description ?? "";
}

function commitDescription() {
  if (!flow.value) return;
  store.updateFlow(flow.value.id, { description: descriptionDraft.value });
  saveCanceller?.trigger();
  descriptionEditing.value = false;
}

function cancelEditDescription() {
  descriptionEditing.value = false;
}

function quickRename() {
  if (!flow.value) return;
  ElMessageBox.prompt("重命名方案", "重命名", {
    inputValue: flow.value.name,
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    lockScroll: false,
  })
    .then(({ value }) => {
      if (!value || !flow.value) return;
      store.updateFlow(flow.value.id, {
        name: value.trim() || flow.value.name,
      });
      saveCanceller?.trigger();
    })
    .catch(() => {
      // 用户取消
    });
}

async function deleteFlow() {
  if (!flow.value) return;
  try {
    await ElMessageBox.confirm(
      `确定要删除方案 "${flow.value.name}" 吗？此操作无法撤销。`,
      "删除方案",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
  } catch {
    return;
  }
  saveCanceller?.cancel();
  await persistence.remove(flow.value.id);
  store.deleteFlow(flow.value.id);
  customMessage.success("已删除");
}

function toggleSidebar() {
  showSidebar.value = !showSidebar.value;
}
function toggleConsole() {
  showConsole.value = !showConsole.value;
}

onBeforeUnmount(() => {
  saveCanceller?.cancel();
  if (flow.value) {
    void persistence.save(flow.value);
  }
  // 如果有方案在运行，停止它
  executor.dispose();
});
</script>

<template>
  <div v-if="flow" class="flow-detail">
    <div class="detail-header">
      <div class="left">
        <el-button :icon="ArrowLeft" link @click="back">返回列表</el-button>
        <h2
          class="flow-name"
          @dblclick="quickRename"
          :title="`双击重命名: ${flow.name}`"
        >
          {{ flow.name }}
        </h2>
        <el-tooltip content="重命名" placement="top">
          <el-button :icon="Pencil" link size="small" @click="quickRename" />
        </el-tooltip>
        <el-tooltip content="保存" placement="top">
          <el-button :icon="Save" link size="small" @click="saveNow" />
        </el-tooltip>
        <el-tooltip content="删除方案" placement="top">
          <el-button :icon="Trash2" link size="small" @click="deleteFlow" />
        </el-tooltip>
      </div>
      <div class="right">
        <div class="fold-toggles">
          <el-tooltip
            :content="showSidebar ? '折叠左侧工具箱' : '展开左侧工具箱'"
            placement="bottom"
          >
            <button
              class="fold-btn"
              :class="{ active: showSidebar }"
              type="button"
              @click="toggleSidebar"
            >
              <PanelLeft :size="16" />
            </button>
          </el-tooltip>
          <el-tooltip
            :content="showConsole ? '折叠底部控制台' : '展开底部控制台'"
            placement="bottom"
          >
            <button
              class="fold-btn"
              :class="{ active: showConsole }"
              type="button"
              @click="toggleConsole"
            >
              <TerminalSquare :size="16" />
            </button>
          </el-tooltip>
        </div>
      </div>
    </div>

    <div class="description-row">
      <template v-if="!descriptionEditing">
        <span
          v-if="flow.description"
          class="desc"
          @dblclick="startEditDescription"
        >
          {{ flow.description }}
        </span>
        <span v-else class="desc placeholder" @click="startEditDescription">
          + 添加方案描述
        </span>
      </template>
      <template v-else>
        <el-input
          v-model="descriptionDraft"
          placeholder="简要描述本方案用途"
          size="small"
          @keyup.enter="commitDescription"
          @keyup.esc="cancelEditDescription"
        />
        <el-button :icon="Check" link @click="commitDescription" />
        <el-button :icon="X" link @click="cancelEditDescription" />
      </template>
    </div>

    <div class="detail-body">
      <div v-show="showSidebar" class="left-pane">
        <StepToolbox @add-step="addStep" @bound="onWindowBound" />
      </div>
      <div class="right-pane">
        <div class="right-top">
          <FlowEditor />
        </div>
        <div v-show="showConsole" class="right-bottom">
          <ControlPanel :flow="flow" :bound-window="store.boundWindow" />
        </div>
      </div>
    </div>
  </div>
  <div v-else class="empty">
    <p>未选择方案</p>
  </div>
</template>

<style scoped>
.flow-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 8px;
  overflow: hidden;
}
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.flow-name {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  cursor: pointer;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.flow-name:hover {
  color: var(--el-color-primary);
}
.fold-toggles {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: var(--card-bg);
}
.fold-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.fold-btn:hover {
  background-color: rgba(
    var(--el-text-color-primary-rgb, 128, 128, 128),
    calc(var(--card-opacity, 1) * 0.08)
  );
  color: var(--el-text-color-primary);
}
.fold-btn.active {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  color: var(--el-color-primary);
}
.description-row {
  padding: 0 4px;
  flex-shrink: 0;
}
.desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  cursor: text;
}
.desc.placeholder {
  color: var(--el-text-color-placeholder);
}
.detail-body {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
}
.left-pane {
  width: 260px;
  flex-shrink: 0;
  min-width: 220px;
  max-width: 320px;
  display: flex;
  flex-direction: column;
}
.right-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.right-top {
  flex: 1 1 auto;
  min-height: 0;
}
.right-bottom {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  height: 280px;
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--el-text-color-placeholder);
}
</style>
