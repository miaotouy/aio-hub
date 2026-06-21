/**
 * 窗口自动化助手 Pinia Store
 *
 * 关注点：
 *  - 方案列表与当前方案的纯数据管理；
 *  - 运行时（runtime）只承载执行期状态、计数器、日志、当前步骤；
 *  - 真正的执行循环放在 composables/useFlowExecutor.ts 中，
 *    Store 通过该 composable 暴露出的 reactive 对象读写状态。
 *  - 步骤/方案的工厂函数独立在 ./flowFactories.ts。
 */

import { defineStore } from "pinia";
import { ref, computed, reactive, markRaw } from "vue";
import { nanoid } from "nanoid";
import { createModuleLogger } from "@/utils/logger";
import type {
  ActionFlow,
  ExecutorLog,
  ExecutorRuntime,
  FlowStep,
  StepType,
  SubFlow,
  SubFlowParamDefine,
  WindowInfo,
} from "../types";
import {
  createEmptyFlow,
  createStep,
  createSubFlow as createSubFlowFactory,
} from "./flowFactories";
import {
  clearDeletedStepRefs,
  clearDeletedStepRefsInFlow,
  clearSubFlowCallRefs,
  cloneFlowWithFreshIds,
  extractSelectedToSubFlow as extractSelectedToSubFlowTransform,
  importSubFlowWithFreshIds,
} from "./flowTransforms";

const logger = createModuleLogger("window-automator/store");

/** 创建默认的运行时状态 */
function createDefaultRuntime(): ExecutorRuntime {
  return reactive<ExecutorRuntime>({
    status: "idle",
    currentStepIndex: 0,
    counters: {},
    variables: {},
    startTime: null,
    totalStepsExecuted: 0,
    logs: [],
    currentFlowId: null,
    boundHwnd: null,
    currentCallStack: [],
  });
}

export const useWindowAutomatorStore = defineStore("window-automator", () => {
  // ---- 方案与视图状态 ----
  const savedFlows = ref<ActionFlow[]>([]);
  const currentFlowId = ref<string | null>(null);
  const selectedStepId = ref<string | null>(null);
  const currentView = ref<"list" | "detail">("list");
  /**
   * 当前正在编辑的子流程 ID。null 表示正在编辑主流程。
   * FlowEditor / StepToolbox 通过该状态切换读写主流程 vs 子流程。
   */
  const currentEditingSubFlowId = ref<string | null>(null);

  // ---- 窗口绑定（运行时） ----
  const boundWindow = ref<WindowInfo | null>(null);

  // ---- 运行时状态 ----
  // markRaw 防止 runtime 被深度响应式代理（包含 counters / variables 动态增删）
  const runtime = markRaw(createDefaultRuntime());

  // ---- 派生 ----
  const currentFlow = computed<ActionFlow | null>(() => {
    if (!currentFlowId.value) return null;
    return savedFlows.value.find((f) => f.id === currentFlowId.value) ?? null;
  });

  const currentSelectedStep = computed<FlowStep | null>(() => {
    if (!currentFlow.value || !selectedStepId.value) return null;
    const list = editingSteps.value;
    return list.find((s) => s.id === selectedStepId.value) ?? null;
  });

  /** 当前正在编辑的子流程（null = 主流程） */
  const currentEditingSubFlow = computed<SubFlow | null>(() => {
    if (!currentFlow.value || !currentEditingSubFlowId.value) return null;
    return (
      currentFlow.value.subFlows?.find(
        (s) => s.id === currentEditingSubFlowId.value
      ) ?? null
    );
  });

  /**
   * 编辑器当前显示的步骤列表：主流程步骤 或 当前编辑子流程的步骤。
   * FlowEditor.vue 通过这个 computed 零改动复用。
   */
  const editingSteps = computed<FlowStep[]>(() => {
    if (!currentFlow.value) return [];
    if (currentEditingSubFlowId.value) {
      return currentEditingSubFlow.value?.steps ?? [];
    }
    return currentFlow.value.steps;
  });

  // ---- 方案 CRUD ----
  function addFlow(flow: ActionFlow) {
    savedFlows.value.push(flow);
    logger.info("新增方案", { id: flow.id, name: flow.name });
  }

  function createFlow(name?: string): ActionFlow {
    const flow = createEmptyFlow(name);
    addFlow(flow);
    return flow;
  }

  function deleteFlow(id: string) {
    const index = savedFlows.value.findIndex((f) => f.id === id);
    if (index >= 0) {
      savedFlows.value.splice(index, 1);
      if (currentFlowId.value === id) {
        currentFlowId.value = null;
        selectedStepId.value = null;
        // 删除主流程时一并清掉编辑上下文
        currentEditingSubFlowId.value = null;
        if (currentView.value === "detail") currentView.value = "list";
      }
      logger.info("删除方案", { id });
    }
  }

  function updateFlow(id: string, patch: Partial<ActionFlow>) {
    const flow = savedFlows.value.find((f) => f.id === id);
    if (!flow) return;
    Object.assign(flow, patch, { updatedAt: new Date().toISOString() });
  }

  function duplicateFlow(id: string): ActionFlow | null {
    const source = savedFlows.value.find((f) => f.id === id);
    if (!source) return null;
    const now = new Date().toISOString();
    const cloned = cloneFlowWithFreshIds(source, {
      flowId: nanoid(10),
      stepId: () => nanoid(8),
      subFlowId: () => nanoid(8),
      now,
      name: `${source.name} - 副本`,
    });
    addFlow(cloned);
    return cloned;
  }

  function setSavedFlows(flows: ActionFlow[]) {
    savedFlows.value = flows;
  }

  // ---- 步骤 CRUD ----
  function addStep(
    flowId: string,
    type: StepType,
    atIndex?: number
  ): FlowStep | null {
    const flow = savedFlows.value.find((f) => f.id === flowId);
    if (!flow) return null;
    const step = createStep(type);
    if (
      typeof atIndex === "number" &&
      atIndex >= 0 &&
      atIndex <= flow.steps.length
    ) {
      flow.steps.splice(atIndex, 0, step);
    } else {
      flow.steps.push(step);
    }
    flow.updatedAt = new Date().toISOString();
    return step;
  }

  function deleteStep(flowId: string, stepId: string) {
    const flow = savedFlows.value.find((f) => f.id === flowId);
    if (!flow) return;
    const index = flow.steps.findIndex((s) => s.id === stepId);
    if (index < 0) return;
    flow.steps.splice(index, 1);
    if (selectedStepId.value === stepId) selectedStepId.value = null;
    // 清理主流程其它步骤对已删除步骤的引用，
    // 以及所有子流程内部步骤对已删除步骤的引用。
    clearDeletedStepRefsInFlow(flow, stepId);
    flow.updatedAt = new Date().toISOString();
  }

  function updateStep(
    flowId: string,
    stepId: string,
    patch: Partial<FlowStep>
  ) {
    const flow = savedFlows.value.find((f) => f.id === flowId);
    if (!flow) return;
    const step = flow.steps.find((s) => s.id === stepId);
    if (!step) return;
    Object.assign(step, patch);
    flow.updatedAt = new Date().toISOString();
  }

  function moveStep(flowId: string, fromIndex: number, toIndex: number) {
    const flow = savedFlows.value.find((f) => f.id === flowId);
    if (!flow) return;
    if (fromIndex < 0 || fromIndex >= flow.steps.length) return;
    if (toIndex < 0 || toIndex > flow.steps.length) return;
    const [step] = flow.steps.splice(fromIndex, 1);
    // 调整目标索引：移除后后续元素前移
    const target = toIndex > fromIndex ? toIndex - 1 : toIndex;
    flow.steps.splice(target, 0, step);
    flow.updatedAt = new Date().toISOString();
  }

  function setSteps(flowId: string, steps: FlowStep[]) {
    const flow = savedFlows.value.find((f) => f.id === flowId);
    if (!flow) return;
    flow.steps = steps;
    flow.updatedAt = new Date().toISOString();
  }

  // ---- 子流程 / 自定义函数 CRUD ----
  function ensureSubFlows(flow: ActionFlow): SubFlow[] {
    if (!Array.isArray(flow.subFlows)) flow.subFlows = [];
    return flow.subFlows;
  }

  /** 在当前方案中新建一个子流程，返回新建的对象 */
  function addSubFlow(name?: string): SubFlow | null {
    const flow = currentFlow.value;
    if (!flow) return null;
    const sub = createSubFlowFactory(name);
    ensureSubFlows(flow).push(sub);
    flow.updatedAt = new Date().toISOString();
    return sub;
  }

  /** 重命名子流程 */
  function renameSubFlow(subFlowId: string, name: string) {
    const flow = currentFlow.value;
    if (!flow) return;
    const sub = ensureSubFlows(flow).find((s) => s.id === subFlowId);
    if (!sub) return;
    sub.name = name;
    flow.updatedAt = new Date().toISOString();
  }

  /** 更新子流程元信息：名称、形参定义和返回变量名。 */
  function updateSubFlowMeta(
    subFlowId: string,
    patch: {
      name?: string;
      params?: SubFlowParamDefine[] | null;
      returnVariableName?: string | null;
    }
  ) {
    const flow = currentFlow.value;
    if (!flow) return;
    const sub = ensureSubFlows(flow).find((s) => s.id === subFlowId);
    if (!sub) return;
    if (typeof patch.name === "string") {
      sub.name = patch.name;
    }
    if (patch.params === null) {
      delete sub.params;
    } else if (Array.isArray(patch.params)) {
      sub.params = patch.params;
    }
    if (patch.returnVariableName === null) {
      delete sub.returnVariableName;
    } else if (typeof patch.returnVariableName === "string") {
      sub.returnVariableName = patch.returnVariableName;
    }
    flow.updatedAt = new Date().toISOString();
  }

  /** 导入一个完整子流程对象，重新生成 ID 并修复内部跳转引用。 */
  function importSubFlow(imported: SubFlow): string | null {
    const flow = currentFlow.value;
    if (!flow) return null;
    const subs = ensureSubFlows(flow);
    const newSub = importSubFlowWithFreshIds(imported, nanoid(8), () =>
      nanoid(8)
    );
    subs.push(newSub);
    flow.updatedAt = new Date().toISOString();
    return newSub.id;
  }

  /**
   * 删除子流程。同时清理主流程 + 所有其它子流程中对它的 call 引用，
   * 并在当前正在编辑它时切回主流程。
   * 返回被清理的 call 步骤数量（供 UI 提示）。
   */
  function deleteSubFlow(subFlowId: string): number {
    const flow = currentFlow.value;
    if (!flow) return 0;
    const subs = ensureSubFlows(flow);
    const idx = subs.findIndex((s) => s.id === subFlowId);
    if (idx < 0) return 0;
    subs.splice(idx, 1);
    const cleared = clearSubFlowCallRefs(flow, subFlowId);
    if (currentEditingSubFlowId.value === subFlowId) {
      currentEditingSubFlowId.value = null;
      selectedStepId.value = null;
    }
    flow.updatedAt = new Date().toISOString();
    return cleared;
  }

  // ---- 子流程步骤 CRUD（操作的是当前编辑的子流程） ----
  function addSubFlowStep(
    subFlowId: string,
    type: StepType,
    atIndex?: number
  ): FlowStep | null {
    const flow = currentFlow.value;
    if (!flow) return null;
    const sub = ensureSubFlows(flow).find((s) => s.id === subFlowId);
    if (!sub) return null;
    const step = createStep(type);
    if (
      typeof atIndex === "number" &&
      atIndex >= 0 &&
      atIndex <= sub.steps.length
    ) {
      sub.steps.splice(atIndex, 0, step);
    } else {
      sub.steps.push(step);
    }
    flow.updatedAt = new Date().toISOString();
    return step;
  }

  function updateSubFlowStep(
    subFlowId: string,
    stepId: string,
    patch: Partial<FlowStep>
  ) {
    const flow = currentFlow.value;
    if (!flow) return;
    const sub = ensureSubFlows(flow).find((s) => s.id === subFlowId);
    if (!sub) return;
    const step = sub.steps.find((s) => s.id === stepId);
    if (!step) return;
    Object.assign(step, patch);
    flow.updatedAt = new Date().toISOString();
  }

  function deleteSubFlowStep(subFlowId: string, stepId: string) {
    const flow = currentFlow.value;
    if (!flow) return;
    const sub = ensureSubFlows(flow).find((s) => s.id === subFlowId);
    if (!sub) return;
    const idx = sub.steps.findIndex((s) => s.id === stepId);
    if (idx < 0) return;
    sub.steps.splice(idx, 1);
    if (selectedStepId.value === stepId) selectedStepId.value = null;
    // 清理子流程内部其它步骤对它的引用
    sub.steps.forEach((s) => clearDeletedStepRefs(s, stepId));
    // 也要清理主流程和其它子流程步骤对该步骤 ID 的引用（兼容旧数据）
    flow.steps.forEach((s) => clearDeletedStepRefs(s, stepId));
    flow.subFlows?.forEach((other) => {
      if (other.id === subFlowId) return;
      other.steps.forEach((s) => clearDeletedStepRefs(s, stepId));
    });
    flow.updatedAt = new Date().toISOString();
  }

  function moveSubFlowStep(
    subFlowId: string,
    fromIndex: number,
    toIndex: number
  ) {
    const flow = currentFlow.value;
    if (!flow) return;
    const sub = ensureSubFlows(flow).find((s) => s.id === subFlowId);
    if (!sub) return;
    if (fromIndex < 0 || fromIndex >= sub.steps.length) return;
    if (toIndex < 0 || toIndex > sub.steps.length) return;
    const [step] = sub.steps.splice(fromIndex, 1);
    const target = toIndex > fromIndex ? toIndex - 1 : toIndex;
    sub.steps.splice(target, 0, step);
    flow.updatedAt = new Date().toISOString();
  }

  function setSubFlowSteps(subFlowId: string, steps: FlowStep[]) {
    const flow = currentFlow.value;
    if (!flow) return;
    const sub = ensureSubFlows(flow).find((s) => s.id === subFlowId);
    if (!sub) return;
    sub.steps = steps;
    flow.updatedAt = new Date().toISOString();
  }

  // ---- 编辑上下文切换 ----
  function enterSubFlow(subFlowId: string) {
    const flow = currentFlow.value;
    if (!flow) return;
    if (!ensureSubFlows(flow).some((s) => s.id === subFlowId)) return;
    currentEditingSubFlowId.value = subFlowId;
    selectedStepId.value = null;
  }

  function exitSubFlow() {
    currentEditingSubFlowId.value = null;
    selectedStepId.value = null;
  }

  /** 从当前编辑上下文中选中多步，剪切为子流程并插入 call 步骤。 */
  function extractSelectedToSubFlow(
    stepIds: string[],
    name: string
  ): { subFlow: SubFlow | null; clearedRefs: number } {
    const flow = currentFlow.value;
    if (!flow || stepIds.length === 0) return { subFlow: null, clearedRefs: 0 };
    const result = extractSelectedToSubFlowTransform(flow, {
      currentSubFlowId: currentEditingSubFlowId.value,
      stepIds,
      name,
      stepId: () => nanoid(8),
      subFlowId: () => nanoid(8),
    });
    flow.updatedAt = new Date().toISOString();
    if (result.subFlow) {
      logger.info("提取为函数", {
        subFlowId: result.subFlow.id,
        name: result.subFlow.name,
        moved: result.subFlow.steps.length,
        clearedRefs: result.clearedRefs,
      });
    }
    return result;
  }

  // ---- 视图切换 ----
  function enterFlow(id: string) {
    currentFlowId.value = id;
    selectedStepId.value = null;
    currentView.value = "detail";
  }

  function backToList() {
    currentView.value = "list";
    selectedStepId.value = null;
  }

  function selectStep(stepId: string | null) {
    selectedStepId.value = stepId;
  }

  // ---- 窗口绑定 ----
  function setBoundWindow(window: WindowInfo | null) {
    boundWindow.value = window;
    runtime.boundHwnd = window ? window.hwnd : null;
    if (window && currentFlowId.value) {
      updateFlow(currentFlowId.value, {
        targetWindow: { title: window.title, className: window.className },
      });
    }
  }

  // ---- 运行时 helpers ----
  function resetRuntime() {
    runtime.status = "idle";
    runtime.currentStepIndex = 0;
    runtime.counters = {};
    runtime.variables = {};
    runtime.startTime = null;
    runtime.totalStepsExecuted = 0;
    runtime.logs = [];
    runtime.currentFlowId = null;
    runtime.currentCallStack = [];
  }

  function appendLog(
    level: ExecutorLog["level"],
    stepIndex: number | null,
    message: string
  ) {
    runtime.logs.push({
      timestamp: Date.now(),
      level,
      stepIndex,
      message,
    });
    // 限制日志最多 500 条，防止长时间运行时无限增长
    if (runtime.logs.length > 500) {
      runtime.logs.splice(0, runtime.logs.length - 500);
    }
  }

  function clearLogs() {
    runtime.logs = [];
  }

  return {
    // state
    savedFlows,
    currentFlowId,
    selectedStepId,
    currentView,
    currentEditingSubFlowId,
    boundWindow,
    runtime,
    // derived
    currentFlow,
    currentSelectedStep,
    currentEditingSubFlow,
    editingSteps,
    // actions
    addFlow,
    createFlow,
    deleteFlow,
    updateFlow,
    duplicateFlow,
    setSavedFlows,
    addStep,
    deleteStep,
    updateStep,
    moveStep,
    setSteps,
    // subflow
    addSubFlow,
    renameSubFlow,
    updateSubFlowMeta,
    importSubFlow,
    deleteSubFlow,
    extractSelectedToSubFlow,
    addSubFlowStep,
    updateSubFlowStep,
    deleteSubFlowStep,
    moveSubFlowStep,
    setSubFlowSteps,
    enterSubFlow,
    exitSubFlow,
    // view
    enterFlow,
    backToList,
    selectStep,
    // window / runtime
    setBoundWindow,
    resetRuntime,
    appendLog,
    clearLogs,
  };
});
