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
 */

import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { toolRegistryManager } from "@/services/registry";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useWindowAutomatorStore } from "../stores/windowAutomator.store";
import type {
  ActionFlow,
  ColorCheckStepParams,
  CounterStepParams,
  FlowStep,
  LogStepParams,
  OcrStepParams,
  OcrEngineConfig,
  StepParams,
  WindowInfo,
} from "../types";

const errorHandler = createModuleErrorHandler(
  "window-automator/useFlowExecutor"
);

/** 把任意坐标按当前客户区尺寸转换为像素坐标（百分比模式） */
async function resolveCoordinate(
  x: number,
  y: number,
  mode: "pixel" | "percent",
  getClientSize: () => Promise<{ width: number; height: number } | null>
): Promise<{ x: number; y: number }> {
  if (mode === "pixel") return { x, y };
  const size = await getClientSize();
  if (!size) return { x: 0, y: 0 };
  return {
    x: Math.round((x / 100) * size.width),
    y: Math.round((y / 100) * size.height),
  };
}

function resolveRect(
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    mode: "pixel" | "percent";
  },
  size: { width: number; height: number } | null
) {
  if (rect.mode === "pixel" || !size) {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }
  return {
    x: Math.round((rect.x / 100) * size.width),
    y: Math.round((rect.y / 100) * size.height),
    width: Math.round((rect.width / 100) * size.width),
    height: Math.round((rect.height / 100) * size.height),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function sleepWithRandom(base: number, range: number): Promise<void> {
  if (!range) return sleep(base);
  const offset = (Math.random() * 2 - 1) * range;
  return sleep(Math.max(0, base + offset));
}

/** 欧氏颜色距离百分比（0~100） */
function colorDistancePercent(hex1: string, hex2: string): number {
  const a = parseHex(hex1);
  const b = parseHex(hex2);
  if (!a || !b) return 100;
  const d = Math.sqrt(
    Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2)
  );
  return (d / Math.sqrt(255 * 255 * 3)) * 100;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m || !m[1]) return null;
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

function interpolateVariables(
  text: string,
  variables: Record<string, string>
): string {
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      return variables[key] ?? full;
    }
    return full;
  });
}

function findStepIndex(flow: ActionFlow, stepId: string): number {
  return flow.steps.findIndex((s) => s.id === stepId);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function labelOf(c: StepParams): string {
  return c.type;
}

export function useFlowExecutor() {
  const store = useWindowAutomatorStore();
  /** 暂停时挂起的 resolve 句柄；resume() 通过它解除阻塞 */
  let resumeResolver: (() => void) | null = null;
  /** 当前运行的方案 ID（冗余存一份，避免读取 store 跨帧竞态） */
  const currentFlowIdRef = ref<string | null>(null);

  const status = computed(() => store.runtime.status);
  const isRunning = computed(() => store.runtime.status === "running");
  const isPaused = computed(() => store.runtime.status === "paused");

  /** 取当前绑定窗口的客户区尺寸（用于百分比坐标转换） */
  async function getCurrentClientSize(): Promise<{
    width: number;
    height: number;
  } | null> {
    if (!store.boundWindow) return null;
    const size = await errorHandler.wrapAsync(
      () =>
        invoke<{ width: number; height: number }>("wa_get_client_rect", {
          hwnd: store.boundWindow!.hwnd,
        }),
      { userMessage: "获取窗口尺寸失败" }
    );
    return size;
  }

  async function executeStep(
    step: FlowStep,
    index: number
  ): Promise<string | null> {
    store.runtime.currentStepIndex = index;
    const c = step.stepConfig;
    store.appendLog(
      "info",
      index,
      `[${index + 1}] ${step.label} (${labelOf(c)})`
    );

    switch (c.type) {
      case "click": {
        if (!store.boundWindow) {
          store.appendLog("error", index, "未绑定窗口，跳过点击步骤");
          return null;
        }
        const coord = await resolveCoordinate(
          c.params.coordinate.x,
          c.params.coordinate.y,
          c.params.coordinate.mode,
          getCurrentClientSize
        );
        const ok = await errorHandler.wrapAsync(
          () =>
            invoke<void>("wa_send_click", {
              hwnd: store.boundWindow!.hwnd,
              x: coord.x,
              y: coord.y,
              button: c.params.button,
              doubleClick: c.params.clickType === "double",
            }),
          { userMessage: "后台点击失败" }
        );
        if (ok === null) {
          store.appendLog("error", index, "点击失败，停止执行");
          return "__STOP__";
        }
        await sleep(c.params.delayAfter);
        return null;
      }
      case "keypress": {
        if (!store.boundWindow) {
          store.appendLog("error", index, "未绑定窗口，跳过按键步骤");
          return null;
        }
        const ok = await errorHandler.wrapAsync(
          () =>
            invoke<void>("wa_send_keypress", {
              hwnd: store.boundWindow!.hwnd,
              key: c.params.key,
              modifiers: c.params.modifiers,
            }),
          { userMessage: "后台按键失败" }
        );
        if (ok === null) {
          store.appendLog("error", index, "按键失败，停止执行");
          return "__STOP__";
        }
        await sleep(c.params.delayAfter);
        return null;
      }
      case "delay": {
        await sleepWithRandom(c.params.duration, c.params.randomRange);
        return null;
      }
      case "colorCheck": {
        return await runColorCheck(c.params, index);
      }
      case "goto": {
        return c.params.targetStepId || null;
      }
      case "counter": {
        return runCounter(c.params, step.id, index);
      }
      case "log": {
        return runLog(c.params, index);
      }
      case "ocr": {
        return await runOcr(c.params, index);
      }
    }
  }

  async function runColorCheck(
    params: ColorCheckStepParams,
    index: number
  ): Promise<string | null> {
    if (!store.boundWindow) {
      store.appendLog("error", index, "未绑定窗口，跳过颜色判断");
      return null;
    }
    const clientSize = await getCurrentClientSize();
    let match = false;
    if (params.checkMode === "point" && params.coordinate) {
      const coord = await resolveCoordinate(
        params.coordinate.x,
        params.coordinate.y,
        params.coordinate.mode,
        async () => clientSize
      );
      const rgb = await errorHandler.wrapAsync(
        () =>
          invoke<[number, number, number]>("wa_get_pixel", {
            hwnd: store.boundWindow!.hwnd,
            x: coord.x,
            y: coord.y,
          }),
        { userMessage: "取色失败" }
      );
      if (!rgb) return "__STOP__";
      const actualHex = rgbToHex(rgb[0], rgb[1], rgb[2]);
      const distance = colorDistancePercent(actualHex, params.expectedColor);
      match = distance <= params.tolerance;
      store.appendLog(
        match ? "info" : "debug",
        index,
        `单点颜色 ${actualHex} 距期望 ${params.expectedColor} = ${distance.toFixed(1)}% (容差 ${params.tolerance}%) -> ${match ? "匹配" : "不匹配"}`
      );
    } else if (params.checkMode === "rect" && params.rect) {
      const rect = resolveRect(params.rect, clientSize);
      match = await runRectColorCheck(rect, params, index);
    }
    return match ? params.matchGoto || null : params.mismatchGoto || null;
  }

  async function runRectColorCheck(
    rect: { x: number; y: number; width: number; height: number },
    params: ColorCheckStepParams,
    index: number
  ): Promise<boolean> {
    if (!store.boundWindow) return false;
    const buffer = await errorHandler.wrapAsync(
      () =>
        invoke<ArrayBuffer>("wa_capture_window", {
          hwnd: store.boundWindow!.hwnd,
        }),
      { userMessage: "截图失败" }
    );
    if (!buffer) return false;
    const blob = new Blob([buffer], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    let match = false;
    try {
      const img = await loadImage(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        store.appendLog("error", index, "Canvas 2D 上下文不可用");
        return false;
      }
      ctx.drawImage(img, 0, 0);
      const x0 = Math.max(0, Math.floor(rect.x));
      const y0 = Math.max(0, Math.floor(rect.y));
      const w = Math.max(
        0,
        Math.min(img.naturalWidth - x0, Math.floor(rect.width))
      );
      const h = Math.max(
        0,
        Math.min(img.naturalHeight - y0, Math.floor(rect.height))
      );
      if (w === 0 || h === 0) {
        store.appendLog("error", index, "区域尺寸为 0");
        return false;
      }
      const data = ctx.getImageData(x0, y0, w, h).data;
      const expected = parseHex(params.expectedColor);
      if (!expected) return false;
      const tol = Math.max(0, Math.min(100, params.tolerance));
      const maxDist = (tol / 100) * Math.sqrt(255 * 255 * 3);
      let matchCount = 0;
      const total = (data.length / 4) | 0;
      for (let i = 0; i < data.length; i += 4) {
        const dr = (data[i] ?? 0) - expected.r;
        const dg = (data[i + 1] ?? 0) - expected.g;
        const db = (data[i + 2] ?? 0) - expected.b;
        const d = Math.sqrt(dr * dr + dg * dg + db * db);
        if (d <= maxDist) matchCount++;
      }
      if (params.rectCheckType === "percentage") {
        const minPct = Math.max(0, Math.min(100, params.minPercentage ?? 0));
        const actualPct = total > 0 ? (matchCount / total) * 100 : 0;
        match = actualPct >= minPct;
        store.appendLog(
          "debug",
          index,
          `区域颜色占比 ${actualPct.toFixed(1)}% (阈值 ${minPct}%) -> ${match ? "匹配" : "不匹配"}`
        );
      } else {
        match = matchCount > 0;
        store.appendLog(
          "debug",
          index,
          `区域包含期望颜色像素 ${matchCount}/${total} -> ${match ? "匹配" : "不匹配"}`
        );
      }
    } catch (e) {
      store.appendLog("error", index, `区域颜色判断异常: ${String(e)}`);
      match = false;
    } finally {
      URL.revokeObjectURL(url);
    }
    return match;
  }

  function runCounter(
    params: CounterStepParams,
    stepId: string,
    index: number
  ): string | null {
    const cur = (store.runtime.counters[stepId] ?? 0) + 1;
    store.runtime.counters[stepId] = cur;
    store.appendLog(
      "debug",
      index,
      `counter ${stepId} = ${cur} / ${params.maxCount}`
    );
    if (cur >= params.maxCount) {
      return params.reachedGotoId || null;
    }
    return params.notReachedGotoId || null;
  }

  function runLog(params: LogStepParams, index: number): string | null {
    const text = interpolateVariables(params.message, store.runtime.variables);
    store.appendLog(params.level, index, text);
    return null;
  }

  async function runOcr(
    params: OcrStepParams,
    index: number
  ): Promise<string | null> {
    if (!store.boundWindow) {
      store.appendLog("error", index, "未绑定窗口，跳过 OCR");
      return null;
    }
    const clientSize = await getCurrentClientSize();
    const rect = resolveRect(params.rect, clientSize);
    if (rect.width <= 0 || rect.height <= 0) {
      store.appendLog("error", index, "OCR 区域尺寸无效");
      return null;
    }
    const buffer = await errorHandler.wrapAsync(
      () =>
        invoke<ArrayBuffer>("wa_capture_window", {
          hwnd: store.boundWindow!.hwnd,
        }),
      { userMessage: "截图失败" }
    );
    if (!buffer) return "__STOP__";
    const blob = new Blob([buffer], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    let matched = false;
    let recognizedText = "";
    try {
      const img = await loadImage(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        store.appendLog("error", index, "Canvas 2D 上下文不可用");
        return "__STOP__";
      }
      ctx.drawImage(img, 0, 0);
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = Math.max(1, Math.floor(rect.width));
      cropCanvas.height = Math.max(1, Math.floor(rect.height));
      const cropCtx = cropCanvas.getContext("2d");
      if (!cropCtx) {
        store.appendLog("error", index, "Canvas 2D 上下文不可用");
        return "__STOP__";
      }
      cropCtx.drawImage(
        canvas,
        Math.max(0, Math.floor(rect.x)),
        Math.max(0, Math.floor(rect.y)),
        cropCanvas.width,
        cropCanvas.height,
        0,
        0,
        cropCanvas.width,
        cropCanvas.height
      );
      const dataUrl = cropCanvas.toDataURL("image/png");
      const blockId = `ocr-${Date.now()}`;
      let registry: any = null;
      try {
        registry = toolRegistryManager.getRegistry("smart-ocr");
      } catch (e) {
        store.appendLog("error", index, `smart-ocr 注册器不可用: ${String(e)}`);
        return "__STOP__";
      }
      if (!registry || typeof registry.runOcr !== "function") {
        store.appendLog("error", index, "smart-ocr 注册器缺少 runOcr");
        return "__STOP__";
      }
      const block = {
        id: blockId,
        imageId: "window-automator",
        canvas: cropCanvas,
        dataUrl,
        startY: 0,
        endY: cropCanvas.height,
        width: cropCanvas.width,
        height: cropCanvas.height,
      };
      const results = await registry.runOcr(
        [block],
        params.engineConfig as OcrEngineConfig
      );
      recognizedText = (results ?? [])
        .map((r: { text?: string }) => r.text)
        .filter(Boolean)
        .join("\n");
      if (params.saveToVariable) {
        store.runtime.variables[params.saveToVariable] = recognizedText;
      }
      if (!params.keyword) {
        matched = recognizedText.length > 0;
      } else if (params.useRegex) {
        try {
          const re = new RegExp(params.keyword, "i");
          matched = re.test(recognizedText);
        } catch (e) {
          store.appendLog("error", index, `正则非法: ${String(e)}`);
          matched = false;
        }
      } else {
        matched = recognizedText.includes(params.keyword);
      }
      store.appendLog(
        matched ? "info" : "debug",
        index,
        `OCR 文本: ${truncate(recognizedText, 80)} -> ${matched ? "匹配" : "不匹配"}`
      );
    } catch (e) {
      store.appendLog("error", index, `OCR 异常: ${String(e)}`);
      return "__STOP__";
    } finally {
      URL.revokeObjectURL(url);
    }
    return matched ? params.matchGoto || null : params.mismatchGoto || null;
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
    currentFlowIdRef.value = flow.id;
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
      const nextStepId = await executeStep(step, nextIndex);
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
    currentFlowIdRef.value = null;
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
