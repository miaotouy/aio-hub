<script setup lang="ts">
import { computed } from "vue";
/**
 * 步骤工具箱
 *
 * 左侧折叠栏内容：
 *  - 顶部：目标窗口绑定（WindowSelector inline）
 *  - 下方：所有可添加的步骤类型按钮（点击触发 add-step 事件）
 */
import {
  MousePointerClick,
  Keyboard,
  Hourglass,
  Palette,
  CornerDownRight,
  Repeat,
  FileText,
  TextCursorInput,
  Crosshair,
  Workflow,
  Pencil,
  Trash2,
  Plus,
  Download,
  Upload,
} from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import WindowSelector from "./WindowSelector.vue";
import { useWindowAutomatorStore } from "../stores/windowAutomator.store";
import { useSubFlowIO } from "../composables/useSubFlowIO";
import type { SubFlow, WindowInfo, StepType } from "../types";

const store = useWindowAutomatorStore();
const { exportSubFlow, importSubFlow } = useSubFlowIO();

const emit = defineEmits<{
  (e: "add-step", type: StepType): void;
  (e: "bound", window: WindowInfo | null): void;
  (e: "edit-sub-flow", subFlowId: string): void;
}>();

/** 当前方案下的自定义函数列表 */
const subFlows = computed<SubFlow[]>(() => store.currentFlow?.subFlows ?? []);

/** 当前正在编辑的子流程（用于在工具箱上打高亮标记） */
const editingSubFlowId = computed(() => store.currentEditingSubFlowId);

/** 新建一个空函数（追加到当前方案的 subFlows） */
async function onCreateSubFlow() {
  let name = "新函数";
  try {
    const { value } = await ElMessageBox.prompt("输入函数名称", "新建函数", {
      inputValue: name,
      confirmButtonText: "创建",
      cancelButtonText: "取消",
      lockScroll: false,
    });
    if (!value) return;
    name = value.trim() || "新函数";
  } catch {
    return;
  }
  const sub = store.addSubFlow(name);
  if (!sub) {
    customMessage.warning("请先在编辑器中打开一个方案");
    return;
  }
  customMessage.success(`已创建函数: ${sub.name}`);
}

/** 点击函数行：在当前编辑上下文的步骤末尾追加一个 call 步骤 */
function onCallSubFlow(sub: SubFlow) {
  const type: StepType = "call";
  const editingSubId = store.currentEditingSubFlowId;
  const mainFlow = store.currentFlow;
  let created: ReturnType<typeof store.addStep> = null;
  if (editingSubId) {
    created = store.addSubFlowStep(editingSubId, type);
  } else if (mainFlow) {
    created = store.addStep(mainFlow.id, type);
  }
  if (!created || !mainFlow) {
    customMessage.warning("请先在编辑器中打开一个方案");
    return;
  }
  // 默认绑定到被点击的函数
  const next = {
    stepConfig: {
      type: "call" as const,
      params: { targetSubFlowId: sub.id },
    },
    label: `调用 ${sub.name}`,
  };
  if (editingSubId) {
    store.updateSubFlowStep(editingSubId, created.id, next);
  } else {
    store.updateStep(mainFlow.id, created.id, next);
  }
  store.selectStep(created.id);
}

function onEditSubFlow(sub: SubFlow) {
  emit("edit-sub-flow", sub.id);
}

async function onDeleteSubFlow(sub: SubFlow) {
  try {
    await ElMessageBox.confirm(
      `确定删除函数 "${sub.name}" 吗？引用了它的 call 步骤会被清空目标。`,
      "删除函数",
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
  const cleared = store.deleteSubFlow(sub.id);
  if (cleared > 0) {
    customMessage.warning(`已清空 ${cleared} 处 call 引用`);
  } else {
    customMessage.success("已删除");
  }
}

const stepTypes: Array<{
  type: StepType;
  label: string;
  icon: typeof MousePointerClick;
  hint: string;
}> = [
  {
    type: "click",
    label: "点击",
    icon: MousePointerClick,
    hint: "后台/前台点击目标坐标",
  },
  {
    type: "keypress",
    label: "按键",
    icon: Keyboard,
    hint: "向绑定窗口发送按键",
  },
  {
    type: "delay",
    label: "延时",
    icon: Hourglass,
    hint: "等待指定毫秒数（可叠加随机波动）",
  },
  {
    type: "colorCheck",
    label: "颜色判断",
    icon: Palette,
    hint: "按颜色/区域判定，决定跳转分支",
  },
  {
    type: "goto",
    label: "跳转",
    icon: CornerDownRight,
    hint: "无条件跳转到指定步骤",
  },
  {
    type: "counter",
    label: "循环计数",
    icon: Repeat,
    hint: "按次数控制循环逻辑",
  },
  {
    type: "log",
    label: "日志",
    icon: FileText,
    hint: "输出日志，支持 {var} 插值",
  },
  {
    type: "ocr",
    label: "OCR 识别",
    icon: TextCursorInput,
    hint: "识别文字并按关键字决定跳转",
  },
];

function onBound(w: WindowInfo | null) {
  emit("bound", w);
}
</script>

<template>
  <div class="step-toolbox">
    <div class="toolbox-section window-section">
      <div class="section-title">
        <Crosshair :size="14" />
        <span>目标窗口</span>
      </div>
      <WindowSelector mode="inline" @bound="onBound" />
    </div>

    <div class="toolbox-section add-section">
      <div class="section-title">
        <span>添加步骤</span>
        <span class="section-sub">点击下方按钮追加到末尾</span>
      </div>
      <div class="step-types">
        <el-tooltip
          v-for="t in stepTypes"
          :key="t.type"
          :content="t.hint"
          placement="right"
        >
          <button
            class="step-type-btn"
            type="button"
            @click="emit('add-step', t.type)"
          >
            <component :is="t.icon" :size="18" class="icon" />
            <span class="label">{{ t.label }}</span>
          </button>
        </el-tooltip>
      </div>
    </div>

    <div class="toolbox-section library-section">
      <div class="section-title">
        <Workflow :size="14" />
        <span>函数库</span>
        <div class="title-actions">
          <el-tooltip content="导入函数" placement="top">
            <button
              class="mini-add-btn"
              type="button"
              aria-label="导入函数"
              @click="importSubFlow"
            >
              <Upload :size="12" />
            </button>
          </el-tooltip>
          <el-tooltip content="新建函数" placement="top">
            <button
              class="mini-add-btn"
              type="button"
              aria-label="新建函数"
              @click="onCreateSubFlow"
            >
              <Plus :size="12" />
            </button>
          </el-tooltip>
        </div>
      </div>
      <div v-if="subFlows.length === 0" class="library-empty">
        暂无自定义函数，点击右上角 + 创建
      </div>
      <div v-else class="library-list">
        <div
          v-for="sub in subFlows"
          :key="sub.id"
          class="library-item"
          :class="{ editing: editingSubFlowId === sub.id }"
        >
          <button
            class="library-call"
            type="button"
            :title="`在当前步骤流末尾追加一个调用 ${sub.name} 的步骤`"
            @click="onCallSubFlow(sub)"
          >
            <Workflow :size="14" class="lib-icon" />
            <span class="lib-name">{{ sub.name }}</span>
            <span class="lib-count">{{ sub.steps.length }}步</span>
          </button>
          <el-tooltip content="编辑函数" placement="top">
            <button
              class="icon-btn"
              type="button"
              aria-label="编辑函数"
              @click="onEditSubFlow(sub)"
            >
              <Pencil :size="12" />
            </button>
          </el-tooltip>
          <el-tooltip content="导出函数" placement="top">
            <button
              class="icon-btn"
              type="button"
              aria-label="导出函数"
              @click="exportSubFlow(sub)"
            >
              <Download :size="12" />
            </button>
          </el-tooltip>
          <el-tooltip content="删除函数" placement="top">
            <button
              class="icon-btn danger"
              type="button"
              aria-label="删除函数"
              @click="onDeleteSubFlow(sub)"
            >
              <Trash2 :size="12" />
            </button>
          </el-tooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step-toolbox {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.toolbox-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 12px;
  border-bottom: var(--border-width) solid var(--border-color-light);
}
.toolbox-section:last-child {
  border-bottom: none;
  flex: 1;
  min-height: 0;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.title-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}
.section-sub {
  margin-left: auto;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}
.step-types {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding-right: 2px;
}
.step-type-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: var(--bg-color);
  color: var(--el-text-color-primary);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: all 0.15s ease;
}
.step-type-btn:hover {
  border-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.5)
  );
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  color: var(--el-color-primary);
}
.step-type-btn:active {
  transform: translateY(1px);
}
.step-type-btn .icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.step-type-btn .label {
  font-size: 13px;
  font-weight: 500;
}
.library-section {
  flex: 0 0 auto;
  max-height: 45%;
}
.library-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding: 4px 2px;
}
.mini-add-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: var(--border-width) solid var(--border-color);
  background-color: var(--bg-color);
  color: var(--el-text-color-secondary);
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  transition: all 0.15s;
}
.mini-add-btn:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.library-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  max-height: 240px;
  padding-right: 2px;
}
.library-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 4px 4px 0;
  border: var(--border-width) solid transparent;
  border-radius: 6px;
  transition: all 0.15s;
}
.library-item:hover {
  border-color: var(--border-color);
  background-color: rgba(
    var(--el-text-color-primary-rgb, 128, 128, 128),
    calc(var(--card-opacity, 1) * 0.05)
  );
}
.library-item.editing {
  border-color: var(--el-color-primary);
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.08)
  );
}
.library-call {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  background-color: var(--bg-color);
  color: var(--el-text-color-primary);
  cursor: pointer;
  font: inherit;
  text-align: left;
  min-width: 0;
  transition: all 0.15s;
}
.library-call:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.library-call .lib-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.library-call .lib-name {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.library-call .lib-count {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-family: ui-monospace, Consolas, monospace;
  flex-shrink: 0;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: var(--border-width) solid var(--border-color);
  background-color: var(--bg-color);
  color: var(--el-text-color-secondary);
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  transition: all 0.15s;
  flex-shrink: 0;
}
.icon-btn:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.icon-btn.danger:hover {
  border-color: var(--el-color-danger);
  color: var(--el-color-danger);
}
</style>
