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

function remapStepJumpRefs(
  steps: FlowStep[],
  remapId: (id: string) => string
) {
  steps.forEach((s) => {
    const c = s.stepConfig;
    if (c.type === "goto") {
      c.params.targetStepId = remapId(c.params.targetStepId);
    } else if (c.type === "colorCheck") {
      c.params.matchGoto = remapId(c.params.matchGoto);
      c.params.mismatchGoto = remapId(c.params.mismatchGoto);
    } else if (c.type === "counter") {
      c.params.notReachedGotoId = remapId(c.params.notReachedGotoId);
      c.params.reachedGotoId = remapId(c.params.reachedGotoId);
    } else if (c.type === "ocr") {
      c.params.matchGoto = remapId(c.params.matchGoto);
      c.params.mismatchGoto = remapId(c.params.mismatchGoto);
    } else if (c.type === "call") {
      void c;
    }
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
    const cloned: ActionFlow = JSON.parse(JSON.stringify(source));
    cloned.id = nanoid(10);
    cloned.name = `${source.name} - 副本`;
    cloned.createdAt = new Date().toISOString();
    cloned.updatedAt = cloned.createdAt;
    // 重新生成主流程步骤 id，并把旧的 id -> 新 id 记录下来，
    // 后面同步修复主流程内的跳转引用。
    const stepIdMap = new Map<string, string>();
    cloned.steps = cloned.steps.map((step) => {
      const newId = nanoid(8);
      stepIdMap.set(step.id, newId);
      return { ...step, id: newId };
    });
    // 重映射子流程：重新生成 subFlow.id 及其内部步骤 id，
    // 同步修复主流程 / 各子流程内 call 步骤的 targetSubFlowId。
    const subFlowIdMap = new Map<string, string>();
    const subStepIdMaps = new Map<string, Map<string, string>>();
    if (Array.isArray(cloned.subFlows)) {
      cloned.subFlows = cloned.subFlows.map((sub) => {
        const oldSubId = sub.id;
        const newSubId = nanoid(8);
        subFlowIdMap.set(oldSubId, newSubId);
        const innerStepMap = new Map<string, string>();
        const newSteps = sub.steps.map((step) => {
          const nsId = nanoid(8);
          innerStepMap.set(step.id, nsId);
          return { ...step, id: nsId };
        });
        subStepIdMaps.set(newSubId, innerStepMap);
        return { ...sub, id: newSubId, steps: newSteps };
      });
    } else {
      cloned.subFlows = [];
    }
    remapStepJumpRefs(cloned.steps, (id) => stepIdMap.get(id) || "");
    cloned.subFlows.forEach((sub) => {
      const innerStepMap = subStepIdMaps.get(sub.id);
      remapStepJumpRefs(sub.steps, (id) => innerStepMap?.get(id) || "");
    });
    // 修正主流程步骤里 call 引用的 targetSubFlowId
    const remapCall = (steps: FlowStep[]) => {
      steps.forEach((s) => {
        if (s.stepConfig.type === "call") {
          const oldId = s.stepConfig.params.targetSubFlowId;
          if (oldId && subFlowIdMap.has(oldId)) {
            s.stepConfig.params.targetSubFlowId = subFlowIdMap.get(oldId) || "";
          }
        }
      });
    };
    remapCall(cloned.steps);
    if (Array.isArray(cloned.subFlows)) {
      cloned.subFlows.forEach((sub) => remapCall(sub.steps));
    }
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
    flow.steps.forEach((s) => clearDeletedRefs(s, stepId));
    flow.subFlows?.forEach((sub) =>
      sub.steps.forEach((s) => clearDeletedRefs(s, stepId))
    );
    flow.updatedAt = new Date().toISOString();
  }

  function clearDeletedRefs(step: FlowStep, removedId: string) {
    const c = step.stepConfig;
    if (c.type === "colorCheck") {
      if (c.params.matchGoto === removedId) c.params.matchGoto = "";
      if (c.params.mismatchGoto === removedId) c.params.mismatchGoto = "";
    } else if (c.type === "goto") {
      if (c.params.targetStepId === removedId) c.params.targetStepId = "";
    } else if (c.type === "counter") {
      if (c.params.notReachedGotoId === removedId)
        c.params.notReachedGotoId = "";
      if (c.params.reachedGotoId === removedId) c.params.reachedGotoId = "";
    } else if (c.type === "ocr") {
      if (c.params.matchGoto === removedId) c.params.matchGoto = "";
      if (c.params.mismatchGoto === removedId) c.params.mismatchGoto = "";
    } else if (c.type === "call") {
      // call 步骤引用的是子流程 ID；如果主流程步骤 ID 被删除，
      // 不需要清理这里（call 不会指向普通步骤 ID）。
      // 但仍保留分支便于将来扩展。
      void c;
    }
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

  /**
   * §8/§9: 更新子流程元信息（名称 / 形参 / 返回变量名）。
   * 任意字段为 undefined 表示不变。传空数组 / 空字符串表示清除。
   */
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

  /**
   * §11: 导入一个完整子流程对象（带 ID 重映射）。
   * 返回新子流程的 id。
   */
  function importSubFlow(imported: SubFlow): string | null {
    const flow = currentFlow.value;
    if (!flow) return null;
    const subs = ensureSubFlows(flow);
    const newId = nanoid(8);
    const stepIdMap = new Map<string, string>();
    const newSteps: FlowStep[] = (imported.steps || []).map((s) => {
      const newStepId = nanoid(8);
      stepIdMap.set(s.id, newStepId);
      return { ...s, id: newStepId };
    });
    remapStepJumpRefs(newSteps, (id) => stepIdMap.get(id) || "");
    const newSub: SubFlow = {
      ...imported,
      id: newId,
      steps: newSteps,
    };
    subs.push(newSub);
    flow.updatedAt = new Date().toISOString();
    return newId;
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
    // 清空所有 call 步骤对该 subFlowId 的引用
    let cleared = 0;
    const clearIn = (steps: FlowStep[]) => {
      steps.forEach((s) => {
        if (
          s.stepConfig.type === "call" &&
          s.stepConfig.params.targetSubFlowId === subFlowId
        ) {
          s.stepConfig.params.targetSubFlowId = "";
          cleared++;
        }
      });
    };
    clearIn(flow.steps);
    subs.forEach((sub) => clearIn(sub.steps));
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
    sub.steps.forEach((s) => clearDeletedRefs(s, stepId));
    // 也要清理主流程和其它子流程步骤对该步骤 ID 的引用（兼容旧数据）
    flow.steps.forEach((s) => clearDeletedRefs(s, stepId));
    flow.subFlows?.forEach((other) => {
      if (other.id === subFlowId) return;
      other.steps.forEach((s) => clearDeletedRefs(s, stepId));
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

  /**
   * §10 提取为函数：从当前编辑上下文中选中多步，提取为子流程。
   *
   * 行为：
   *  1. 在当前方案的 subFlows 中新建一个空子流程；
   *  2. 将选中的步骤（按顺序）深拷贝到该子流程内，并重新生成 step.id；
   *  3. 把选中步骤从原位置移除，在原第一个选中位置插入一个 call 步骤；
   *  4. 修复被移动步骤之间的内部跳转（A→B 都在子流程内则保持，否则置空警告）；
   *  5. 清理主流程 / 其它子流程里所有指向被移动步骤的外部跳转引用。
   *
   * 返回新建的子流程 + 清理掉的外部引用数量（供 UI 提示）。
   */
  function extractSelectedToSubFlow(
    stepIds: string[],
    name: string
  ): { subFlow: SubFlow | null; clearedRefs: number } {
    const flow = currentFlow.value;
    if (!flow || stepIds.length === 0) return { subFlow: null, clearedRefs: 0 };
    const sourceSteps = editingSteps.value;
    const selectedIds = Array.from(new Set(stepIds));
    const indices = selectedIds
      .map((id) => sourceSteps.findIndex((s) => s.id === id))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    if (indices.length === 0) return { subFlow: null, clearedRefs: 0 };
    const stepMap = new Map<string, string>();
    const extractedSteps: FlowStep[] = indices.map((i) => {
      const original = sourceSteps[i];
      const cloned: FlowStep = JSON.parse(JSON.stringify(original));
      const newId = nanoid(8);
      stepMap.set(original.id, newId);
      cloned.id = newId;
      return cloned;
    });
    // 把提取出来的步骤内部的跳转引用按 stepMap 重映射
    let clearedInternalRefs = 0;
    const remapInternal = (steps: FlowStep[]) => {
      steps.forEach((s) => {
        remapStepJumpRefs([s], (id) => {
          if (!id) return "";
          const mapped = stepMap.get(id);
          if (mapped) return mapped;
          clearedInternalRefs++;
          return "";
        });
      });
    };
    remapInternal(extractedSteps);
    // 创建子流程对象
    const sub = createSubFlowFactory(name);
    sub.steps = extractedSteps;
    ensureSubFlows(flow).push(sub);
    // 从源步骤列表中移除选中的步骤（倒序删除避免索引错乱）
    const reversed = [...indices].reverse();
    const insertIndex = indices[0];
    const targetSteps = currentEditingSubFlow.value
      ? currentEditingSubFlow.value.steps
      : flow.steps;
    for (const idx of reversed) {
      targetSteps.splice(idx, 1);
    }
    // 在原位置插入 call 步骤
    const callStep: FlowStep = {
      id: nanoid(8),
      label: `调用 ${sub.name}`,
      enabled: true,
      stepConfig: {
        type: "call" as const,
        params: { targetSubFlowId: sub.id },
      },
    };
    targetSteps.splice(insertIndex, 0, callStep);
    // 清理外部对被移动步骤 ID 的所有跳转引用
    let clearedRefs = 0;
    const allScannable = [
      ...flow.steps,
      ...(flow.subFlows ?? []).flatMap((s) => s.steps),
    ];
    for (const s of allScannable) {
      const c = s.stepConfig;
      const clearIfMoved = (field: string) => {
        const val = (c.params as unknown as Record<string, string>)[field];
        if (typeof val === "string" && stepMap.has(val)) {
          (c.params as unknown as Record<string, string>)[field] = "";
          clearedRefs++;
        }
      };
      if (c.type === "goto") {
        clearIfMoved("targetStepId");
      } else if (c.type === "colorCheck") {
        clearIfMoved("matchGoto");
        clearIfMoved("mismatchGoto");
      } else if (c.type === "counter") {
        clearIfMoved("notReachedGotoId");
        clearIfMoved("reachedGotoId");
      } else if (c.type === "ocr") {
        clearIfMoved("matchGoto");
        clearIfMoved("mismatchGoto");
      }
    }
    clearedRefs += clearedInternalRefs;
    flow.updatedAt = new Date().toISOString();
    logger.info("提取为函数", {
      subFlowId: sub.id,
      name: sub.name,
      moved: extractedSteps.length,
      clearedRefs,
    });
    return { subFlow: sub, clearedRefs };
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
