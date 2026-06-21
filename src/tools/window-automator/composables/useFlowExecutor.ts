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
import type { ActionFlow, WindowInfo } from "../types";

const errorHandler = createModuleErrorHandler(
  "window-automator/useFlowExecutor"
);

function findStepIndex(flow: ActionFlow, stepId: string): number {
  return flow.steps.findIndex((s) => s.id === stepId);
}

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
    let nextIndex = 0;
    while (
      store.runtime.status === "running" ||
      store.runtime.status === "paused"
    ) {
      if (store.runtime.status === "paused") {
        await new Promise<void>((resolve) => {
          resumeResolver = resolve;
        });
        // 状态可能在等待期间被 stop() 改为 stopping/idle；
        // while 条件会在下一次迭代时自然终止。
      }
      if (nextIndex < 0 || nextIndex >= flow.steps.length) {
        store.appendLog("info", null, "动作流执行完毕");
        break;
      }
      const step = flow.steps[nextIndex];
      if (!step) break;
      if (!step.enabled) {
        nextIndex++;
        continue;
      }
      const nextStepId = await executeStep(ctx, step, nextIndex);
      store.runtime.totalStepsExecuted++;
      if (nextStepId === "__STOP__") {
        store.appendLog("error", null, "由于步骤执行失败，已停止");
        break;
      }
      if (nextStepId) {
        const target = findStepIndex(flow, nextStepId);
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
      if (nextIndex >= flow.steps.length) {
        store.appendLog("info", null, "动作流执行完毕");
        break;
      }
    }
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
