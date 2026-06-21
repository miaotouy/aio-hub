/**
 * 动作流执行器 composable
 *
 * 状态机：
 *   idle -- start --> running -- pause --> paused -- resume --> running
 *                       \                                /
 *                        \------- stop ----------------/
 *                                  ↓
 *                              stopping → idle
 *
 * 设计要点：
 *  - 单实例（同一时刻只能跑一个方案）；切方案前会自动停止。
 *  - 步骤间跳转通过 step.id 而非下标，拖拽后仍有效。
 *  - 协作用户按下的 ESC / 切窗口等行为时，组件层主动调 stop() 即可。
 *
 * 具体的步骤执行逻辑见 ./stepExecutors.ts；
 * 纯工具函数（坐标转换、颜色解析等）见 ./flowUtils.ts。
 */

import { computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useWindowAutomatorStore } from "../stores/windowAutomator.store";
import { executeStep, StepExecContext } from "./stepExecutors";
import { ClientSize } from "./flowUtils";
import type {
  ActionFlow,
  ExecutorCallFrame,
  FlowStep,
  SubFlow,
  WindowInfo,
} from "../types";

const errorHandler = createModuleErrorHandler(
  "window-automator/useFlowExecutor"
);

function findStepIndex(steps: FlowStep[], stepId: string): number {
  return steps.findIndex((s) => s.id === stepId);
}

/** 子流程最大嵌套调用深度（防止无限递归） */
const MAX_CALL_DEPTH = 10;

export function useFlowExecutor() {
  const store = useWindowAutomatorStore();
  /** 暂停时挂起的 resolve 句柄；resume() 通过它解除阻塞 */
  let resumeResolver: (() => void) | null = null;

  const status = computed(() => store.runtime.status);
  const isRunning = computed(() => store.runtime.status === "running");
  const isPaused = computed(() => store.runtime.status === "paused");

  /** 取当前绑定窗口的客户区尺寸（用于百分比坐标转换） */
  async function getCurrentClientSize(): Promise<ClientSize | null> {
    if (!store.boundWindow) return null;
    return await errorHandler.wrapAsync(
      () =>
        invoke<{ width: number; height: number }>("wa_get_client_rect", {
          hwnd: store.boundWindow!.hwnd,
        }),
      { userMessage: "获取窗口尺寸失败" }
    );
  }

  /** 为 stepExecutors 构造当前运行上下文 */
  function buildContext(): StepExecContext {
    return {
      boundHwnd: store.boundWindow ? store.boundWindow.hwnd : null,
      appendLog: (level, stepIndex, message) =>
        store.appendLog(level, stepIndex, message),
      getClientSize: getCurrentClientSize,
      variables: store.runtime.variables,
      counters: store.runtime.counters,
    };
  }

  async function start(flow: ActionFlow, boundWindow: WindowInfo | null) {
    if (
      store.runtime.status === "running" ||
      store.runtime.status === "paused"
    ) {
      store.appendLog("warn", null, "已有方案在运行，请先停止");
      return;
    }
    if (!boundWindow) {
      store.appendLog("warn", null, "未绑定目标窗口，无法启动");
      return;
    }
    if (flow.steps.length === 0) {
      store.appendLog("warn", null, "方案无步骤，无法启动");
      return;
    }
    // 启动前先校验句柄
    const valid = await errorHandler.wrapAsync(
      () => invoke<boolean>("wa_is_window_valid", { hwnd: boundWindow.hwnd }),
      { userMessage: "校验窗口失败" }
    );
    if (!valid) {
      store.appendLog(
        "error",
        null,
        `目标窗口已关闭或句柄失效: ${boundWindow.title}`
      );
      return;
    }
    store.resetRuntime();
    store.runtime.status = "running";
    store.runtime.currentFlowId = flow.id;
    store.runtime.boundHwnd = boundWindow.hwnd;
    store.runtime.startTime = Date.now();
    store.appendLog("info", null, `开始执行: ${flow.name}`);
    void runLoop(flow);
  }

  function pause() {
    if (store.runtime.status !== "running") return;
    store.runtime.status = "paused";
    store.appendLog("warn", null, "已暂停");
  }

  function resume() {
    if (store.runtime.status !== "paused") return;
    store.runtime.status = "running";
    store.appendLog("info", null, "已恢复");
    if (resumeResolver) {
      const r = resumeResolver;
      resumeResolver = null;
      r();
    }
  }

  function stop() {
    const s = store.runtime.status;
    if (s === "idle" || s === "stopping") {
      return;
    }
    store.runtime.status = "stopping";
    store.appendLog("warn", null, "正在停止...");
    if (resumeResolver) {
      const r = resumeResolver;
      resumeResolver = null;
      r();
    }
  }

  async function runLoop(flow: ActionFlow) {
    const ctx = buildContext();

    // 子流程索引表：id -> SubFlow。执行过程中可能新增/删除子流程，
    // 因此每次 call 都会实时查询当前最新版本。
    const findSubFlow = (id: string): SubFlow | undefined =>
      flow.subFlows?.find((s) => s.id === id);

    // 当前执行上下文：主流程或某个子流程
    let currentSteps: FlowStep[] = flow.steps;
    let currentSubFlowId: string | null = null;
    // 调用栈：每帧记录调用方的步骤列表 / 步骤索引 / 触发的子流程信息
    const callStack: Array<{
      steps: FlowStep[];
      subFlowId: string | null;
      stepIndex: number;
      /**
       * 调用发生前，主流程 currentStepIndex 的取值。
       * 出栈时若栈已空则恢复为这个值，让主流程 UI 高亮回到调用方步骤。
       */
      mainHighlight: number;
    }> = [];
    /** 是否有循环调用（同一子流程在栈中重复出现） */
    const hasRecursion = (subFlowId: string) =>
      callStack.some((f) => f.subFlowId === subFlowId);

    let nextIndex = 0;

    /** 把当前调用栈写回 store.runtime，供 UI 面包屑/日志使用 */
    const syncRuntimeCallStack = () => {
      // 只暴露子流程帧（主流程不计入），并把最后一帧的 stepIndex 同步为当前 nextIndex，
      // 这样 UI 在子流程编辑器里能直接看到"当前正在跑的是哪一步"。
      const cleaned: ExecutorCallFrame[] = [];
      for (let i = 0; i < callStack.length; i++) {
        const f = callStack[i]!;
        if (!f.subFlowId) continue;
        const isLast = i === callStack.length - 1;
        cleaned.push({
          subFlowId: f.subFlowId,
          subFlowName: findSubFlow(f.subFlowId)?.name ?? "(已删除)",
          callerStepId: f.steps[f.stepIndex]?.id ?? "",
          stepIndex: isLast ? nextIndex : f.stepIndex,
        });
      }
      store.runtime.currentCallStack = cleaned;
    };

    while (
      store.runtime.status === "running" ||
      store.runtime.status === "paused"
    ) {
      if (store.runtime.status === "paused") {
        await new Promise<void>((resolve) => {
          resumeResolver = resolve;
        });
      }
      syncRuntimeCallStack();

      // 到达当前执行上下文的末尾
      if (nextIndex < 0 || nextIndex >= currentSteps.length) {
        if (callStack.length > 0) {
          // 出栈：恢复调用方
          const frame = callStack.pop()!;
          currentSteps = frame.steps;
          currentSubFlowId = frame.subFlowId;
          nextIndex = frame.stepIndex + 1;
          // 主流程高亮回到调用方 call 步骤
          if (callStack.length === 0) {
            store.runtime.currentStepIndex = frame.mainHighlight;
          }
          continue;
        }
        store.appendLog("info", null, "动作流执行完毕");
        break;
      }

      const step = currentSteps[nextIndex];
      if (!step) {
        nextIndex++;
        continue;
      }
      if (!step.enabled) {
        nextIndex++;
        continue;
      }

      // 记录"主流程高亮位置"：
      // - 在主流程跑时就是 nextIndex；
      // - 在子流程跑时，仍保持调用方 call 步骤的索引，让主流程 UI 持续高亮。
      const mainHighlight = currentSubFlowId
        ? (callStack[callStack.length - 1]?.mainHighlight ?? nextIndex)
        : nextIndex;
      if (!currentSubFlowId) {
        store.runtime.currentStepIndex = nextIndex;
      }

      const nextStepId = await executeStep(ctx, step, nextIndex);
      store.runtime.totalStepsExecuted++;

      if (nextStepId === "__STOP__") {
        store.appendLog("error", null, "由于步骤执行失败，已停止");
        break;
      }

      if (nextStepId === "__CALL__") {
        const params = step.stepConfig;
        if (params.type !== "call") {
          nextIndex++;
          continue;
        }
        const targetId = params.params.targetSubFlowId;
        const target = findSubFlow(targetId);
        if (!target) {
          store.appendLog(
            "error",
            null,
            `调用目标函数不存在: ${targetId || "(空)"}`
          );
          break;
        }
        if (hasRecursion(targetId)) {
          store.appendLog(
            "error",
            null,
            `检测到循环调用: 函数 "${target.name}" 已在调用栈中，已停止`
          );
          break;
        }
        if (callStack.length >= MAX_CALL_DEPTH) {
          store.appendLog(
            "error",
            null,
            `调用栈深度超过上限 (${MAX_CALL_DEPTH})，已停止`
          );
          break;
        }
        // 压栈并切到子流程
        callStack.push({
          steps: currentSteps,
          subFlowId: currentSubFlowId,
          stepIndex: nextIndex,
          mainHighlight,
        });
        currentSteps = target.steps;
        currentSubFlowId = target.id;
        nextIndex = 0;
        store.appendLog("info", null, `→ 调用函数: ${target.name}`);
        continue;
      }

      if (nextStepId) {
        // 步骤返回的跳转目标 ID 必须在当前执行上下文（主流程或当前子流程）内解析
        const target = findStepIndex(currentSteps, nextStepId);
        if (target < 0) {
          store.appendLog(
            "warn",
            null,
            `跳转目标 ${nextStepId} 不存在，顺延下一步`
          );
          nextIndex++;
        } else {
          nextIndex = target;
        }
      } else {
        nextIndex++;
      }
    }
    // 清空调用栈
    store.runtime.currentCallStack = [];
    if (store.runtime.status !== "idle") {
      store.runtime.status = "idle";
    }
    const cost = store.runtime.startTime
      ? Date.now() - store.runtime.startTime
      : 0;
    store.appendLog(
      "info",
      null,
      `执行结束，共 ${store.runtime.totalStepsExecuted} 步，耗时 ${cost}ms`
    );
  }

  // 组件卸载时强制停止，防止后台循环泄漏
  function dispose() {
    if (store.runtime.status !== "idle") {
      store.runtime.status = "stopping";
      if (resumeResolver) {
        const r = resumeResolver;
        resumeResolver = null;
        r();
      }
    }
  }

  return {
    status,
    isRunning,
    isPaused,
    start,
    pause,
    resume,
    stop,
    dispose,
  };
}
