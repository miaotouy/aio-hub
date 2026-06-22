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
import { ClientSize, interpolateVariables } from "./flowUtils";
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
  function buildContext(scope: {
    local: Record<string, string>;
    useLocalVariables: boolean;
  }): StepExecContext {
    return {
      boundHwnd: store.boundWindow ? store.boundWindow.hwnd : null,
      appendLog: (level, stepIndex, message) =>
        store.appendLog(level, stepIndex, message),
      getClientSize: getCurrentClientSize,
      // 全局变量表（与旧 API 兼容；写操作会同时回写主流程 global）
      variables: store.runtime.variables,
      // 当前调用栈帧的局部变量表（写操作只影响当前函数）
      localVariables: scope.local,
      // 完整作用域：步骤执行器在需要 {var} 插值时统一用这个
      scope: { local: scope.local, global: store.runtime.variables },
      setVariable: (key, value) => {
        if (scope.useLocalVariables) {
          scope.local[key] = value;
        } else {
          store.runtime.variables[key] = value;
        }
      },
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
    // 子流程索引表：id -> SubFlow。执行过程中可能新增/删除子流程，
    // 因此每次 call 都会实时查询当前最新版本。
    const findSubFlow = (id: string): SubFlow | undefined =>
      flow.subFlows?.find((s) => s.id === id);

    // 当前执行上下文：主流程或某个子流程
    let currentSteps: FlowStep[] = flow.steps;
    let currentSubFlowId: string | null = null;
    // 当前调用栈帧的局部变量表；主流程时为空对象，函数调用时填入形参 + 局部变量
    let currentLocalVariables: Record<string, string> = {};
    // 调用栈：每帧记录调用方的步骤列表 / 步骤索引 / 触发的子流程信息 / 局部变量表
    // 局部变量表保存该子流程内的形参与运行期局部变量；进入新子流程时新建空表，
    // 出栈时整张表随之销毁。
    const callStack: Array<{
      steps: FlowStep[];
      subFlowId: string | null;
      stepIndex: number;
      /**
       * 调用发生前，主流程 currentStepIndex 的取值。
       * 出栈时若栈已空则恢复为这个值，让主流程 UI 高亮回到调用方步骤。
       */
      mainHighlight: number;
      /** 当前调用栈帧的局部变量表（每次 push 时新建对象） */
      localVariables: Record<string, string>;
      /** 用于出栈时把返回值写回调用方的保存变量名（call 步骤的 saveResultToVariable） */
      saveResultTo?: string;
    }> = [];
    /** 是否有循环调用（同一子流程在当前调用链中重复出现） */
    const hasRecursion = (subFlowId: string) =>
      currentSubFlowId === subFlowId ||
      callStack.some((f) => f.subFlowId === subFlowId);

    let nextIndex = 0;

    /**
     * 返回值处理：子流程出栈时调用。
     * 从被弹出栈帧的 localVariables 中读取 returnVariableName 对应的值，
     * 写回调用方作用域（栈顶帧或主流程全局表）。
     */
    function handleReturnValue(
      frame: { saveResultTo?: string },
      childLocal: Record<string, string>
    ) {
      if (!frame.saveResultTo) return;
      // 读取正在退出的子流程定义里的 returnVariableName
      const childSub = findSubFlow(currentSubFlowId || "");
      if (!childSub?.returnVariableName) return;
      const v = childLocal[childSub.returnVariableName];
      if (typeof v !== "string") return;
      // 写入调用方作用域：栈顶帧的 localVariables（若还有），否则主流程全局
      if (callStack.length > 0) {
        const callerFrame = callStack[callStack.length - 1]!;
        callerFrame.localVariables[frame.saveResultTo] = v;
      } else {
        store.runtime.variables[frame.saveResultTo] = v;
      }
    }

    /** 把当前调用栈写回 store.runtime，供 UI 面包屑/日志使用 */
    const syncRuntimeCallStack = () => {
      // callStack 内部帧保存的是"调用方上下文 + 被调函数局部变量"。
      // 对 UI 暴露时要转换成真实的活跃子流程链：A 调 B 时显示 [A, B]。
      const cleaned: ExecutorCallFrame[] = [];
      for (let i = 0; i < callStack.length; i++) {
        const f = callStack[i]!;
        const nextFrame = callStack[i + 1];
        const activeSubFlowId = nextFrame?.subFlowId ?? currentSubFlowId;
        if (!activeSubFlowId) continue;
        const isLast = i === callStack.length - 1;
        cleaned.push({
          subFlowId: activeSubFlowId,
          subFlowName: findSubFlow(activeSubFlowId)?.name ?? "(已删除)",
          callerStepId: f.steps[f.stepIndex]?.id ?? "",
          stepIndex: isLast ? nextIndex : (nextFrame?.stepIndex ?? f.stepIndex),
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
          // 出栈：恢复调用方；同时把返回值写回调用方作用域
          const frame = callStack.pop()!;
          handleReturnValue(frame, currentLocalVariables);
          currentSteps = frame.steps;
          currentSubFlowId = frame.subFlowId;
          currentLocalVariables =
            callStack.length > 0
              ? callStack[callStack.length - 1]!.localVariables
              : {};
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

      // 每步重建 ctx，使当前帧的 localVariables 反映最新（写操作会回写到 currentLocalVariables）
      const ctx = buildContext({
        local: currentLocalVariables,
        useLocalVariables: currentSubFlowId !== null,
      });
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
        // 形参绑定：先把形参默认值写入新局部表，再用 arguments 实参覆盖
        const newLocal: Record<string, string> = {};
        if (Array.isArray(target.params)) {
          for (const p of target.params) {
            if (!p?.name) continue;
            newLocal[p.name] = interpolateVariables(p.defaultValue ?? "", {
              global: store.runtime.variables,
            });
          }
        }
        const argOverrides = params.params.arguments;
        if (argOverrides && typeof argOverrides === "object") {
          for (const [k, raw] of Object.entries(argOverrides)) {
            if (typeof raw !== "string") continue;
            // 实参值在调用方作用域中解析（局部优先）
            newLocal[k] = interpolateVariables(raw, {
              local: currentLocalVariables,
              global: store.runtime.variables,
            });
          }
        }
        // 压栈并切到子流程
        callStack.push({
          steps: currentSteps,
          subFlowId: currentSubFlowId,
          stepIndex: nextIndex,
          mainHighlight,
          localVariables: newLocal,
          saveResultTo: params.params.saveResultToVariable || "",
        });
        currentSteps = target.steps;
        currentSubFlowId = target.id;
        currentLocalVariables = newLocal;
        nextIndex = 0;
        const callArgsCount = Object.keys(argOverrides || {}).length;
        store.appendLog(
          "info",
          null,
          `→ 调用函数: ${target.name} (传参 ${callArgsCount} 个)`
        );
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
