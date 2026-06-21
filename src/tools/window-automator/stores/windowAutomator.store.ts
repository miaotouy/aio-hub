/**
 * 窗口自动化助手 Pinia Store
 *
 * 关注点：
 *  - 方案列表与当前方案的纯数据管理；
 *  - 运行时（runtime）只承载执行期状态、计数器、日志、当前步骤；
 *  - 真正的执行循环放在 composables/useFlowExecutor.ts 中，
 *    Store 通过该 composable 暴露出的 reactive 对象读写状态。
 */

import { defineStore } from "pinia";
import { ref, computed, reactive, markRaw } from "vue";
import { nanoid } from "nanoid";
import { createModuleLogger } from "@/utils/logger";
import type {
  ActionFlow,
  FlowStep,
  StepParams,
  WindowInfo,
  ExecutorRuntime,
  ExecutorLog,
  StepType,
  RectArea,
  Coordinate,
} from "../types";

const logger = createModuleLogger("window-automator/store");

/** 默认坐标 */
const DEFAULT_COORDINATE: Coordinate = { mode: "pixel", x: 0, y: 0 };
const DEFAULT_RECT: RectArea = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  mode: "pixel",
};

/** 创建指定类型的初始 stepConfig */
export function createDefaultStepParams(type: StepType): StepParams {
  switch (type) {
    case "click":
      return {
        type: "click",
        params: {
          coordinate: { ...DEFAULT_COORDINATE },
          button: "left",
          clickType: "single",
          mode: "background",
          delayAfter: 200,
        },
      };
    case "keypress":
      return {
        type: "keypress",
        params: {
          key: "Enter",
          modifiers: [],
          mode: "background",
          delayAfter: 100,
        },
      };
    case "delay":
      return {
        type: "delay",
        params: {
          duration: 1000,
          randomRange: 0,
        },
      };
    case "colorCheck":
      return {
        type: "colorCheck",
        params: {
          checkMode: "point",
          coordinate: { ...DEFAULT_COORDINATE },
          expectedColor: "#FF0000",
          tolerance: 10,
          matchGoto: "",
          mismatchGoto: "",
        },
      };
    case "goto":
      return {
        type: "goto",
        params: {
          targetStepId: "",
        },
      };
    case "counter":
      return {
        type: "counter",
        params: {
          maxCount: 1,
          notReachedGotoId: "",
          reachedGotoId: "",
        },
      };
    case "log":
      return {
        type: "log",
        params: {
          message: "",
          level: "info",
        },
      };
    case "ocr":
      return {
        type: "ocr",
        params: {
          rect: { ...DEFAULT_RECT },
          engineType: "tesseract",
          engineConfig: {
            type: "tesseract",
            name: "default",
            language: "chi_sim+eng",
          },
          keyword: "",
          useRegex: false,
          matchGoto: "",
          mismatchGoto: "",
        },
      };
  }
}

/** 步骤默认标签（按类型给出中文名） */
export function defaultStepLabel(type: StepType): string {
  switch (type) {
    case "click":
      return "点击";
    case "keypress":
      return "按键";
    case "delay":
      return "延时";
    case "colorCheck":
      return "颜色判断";
    case "goto":
      return "跳转";
    case "counter":
      return "循环计数";
    case "log":
      return "日志";
    case "ocr":
      return "OCR 识别";
  }
}

/** 创建一个全新的步骤 */
export function createStep(type: StepType): FlowStep {
  return {
    id: nanoid(8),
    label: defaultStepLabel(type),
    enabled: true,
    stepConfig: createDefaultStepParams(type),
  };
}

/** 创建一个空白方案 */
export function createEmptyFlow(name = "未命名方案"): ActionFlow {
  const now = new Date().toISOString();
  return {
    id: nanoid(10),
    name,
    description: "",
    targetWindow: null,
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}

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
  });
}

export const useWindowAutomatorStore = defineStore("window-automator", () => {
  // ---- 方案与视图状态 ----
  const savedFlows = ref<ActionFlow[]>([]);
  const currentFlowId = ref<string | null>(null);
  const selectedStepId = ref<string | null>(null);
  const currentView = ref<"list" | "detail">("list");

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
    return (
      currentFlow.value.steps.find((s) => s.id === selectedStepId.value) ?? null
    );
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
    // 重新生成步骤 id，避免内部跳转引用错乱
    cloned.steps = cloned.steps.map((step) => ({ ...step, id: nanoid(8) }));
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
    // 清理其他步骤对已删除步骤的引用
    flow.steps.forEach((s) => clearDeletedRefs(s, stepId));
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
    boundWindow,
    runtime,
    // derived
    currentFlow,
    currentSelectedStep,
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
    enterFlow,
    backToList,
    selectStep,
    setBoundWindow,
    resetRuntime,
    appendLog,
    clearLogs,
  };
});
