/**
 * 步骤执行器（按 StepType 分派到具体实现）
 *
 * 与 useFlowExecutor 解耦：所有副作用都通过 StepExecContext 注入，
 * 便于以后脱离 store 做单元测试。
 *
 * 返回值约定：
 *   - null            顺延下一步
 *   - "__STOP__"      主动终止整条动作流
 *   - 其它 string     跳转到该 step.id（由 executor 解析为下标）
 */

import { invoke } from "@tauri-apps/api/core";
import { toolRegistryManager } from "@/services/registry";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type {
  ColorCheckStepParams,
  CounterStepParams,
  ExecutorLogLevel,
  FlowStep,
  LogStepParams,
  OcrEngineConfig,
  OcrStepParams,
  StepParams,
  WindowInfo,
} from "../types";
import {
  ClientSize,
  colorDistancePercent,
  interpolateVariables,
  loadImage,
  parseHex,
  resolveCoordinate,
  resolveRect,
  rgbToHex,
  sleep,
  sleepWithRandom,
  stepTypeLabel,
  truncate,
} from "./flowUtils";

/** 步骤执行期上下文：所有副作用都通过它注入 */
export interface StepExecContext {
  /** 当前绑定窗口 hwnd（null 表示未绑定） */
  boundHwnd: number | null;
  /** 写一条执行日志 */
  appendLog: (
    level: ExecutorLogLevel,
    stepIndex: number | null,
    message: string
  ) => void;
  /** 获取当前绑定窗口的客户区尺寸，用于百分比坐标转像素 */
  getClientSize: () => Promise<ClientSize | null>;
  /** 运行时变量表（直接读写即可） */
  variables: Record<string, string>;
  /** counter 步骤用的计数器表（key = step.id） */
  counters: Record<string, number>;
}

const errorHandler = createModuleErrorHandler(
  "window-automator/stepExecutors"
);

// ===================== 调度入口 =====================

/** 执行单个步骤；返回跳转目标 / 终止信号 / null */
export async function executeStep(
  ctx: StepExecContext,
  step: FlowStep,
  index: number
): Promise<string | null> {
  const c = step.stepConfig;
  ctx.appendLog(
    "info",
    index,
    `[${index + 1}] ${step.label} (${stepTypeLabel(c)})`
  );
  switch (c.type) {
    case "click":
      return runClick(ctx, c.params, index);
    case "keypress":
      return runKeyPress(ctx, c.params, index);
    case "delay":
      return runDelay(c.params);
    case "colorCheck":
      return runColorCheck(ctx, c.params, index);
    case "goto":
      return c.params.targetStepId || null;
    case "counter":
      return runCounter(c.params, step.id, index, ctx);
    case "log":
      return runLog(c.params, ctx);
    case "ocr":
      return runOcr(ctx, c.params, index);
  }
}

// ===================== 步骤实现 =====================

async function runClick(
  ctx: StepExecContext,
  params: Extract<StepParams, { type: "click" }>["params"],
  index: number
): Promise<string | null> {
  if (!ctx.boundHwnd) {
    ctx.appendLog("error", index, "未绑定窗口，跳过点击步骤");
    return null;
  }
  const coord = await resolveCoordinate(
    params.coordinate.x,
    params.coordinate.y,
    params.coordinate.mode,
    ctx.getClientSize
  );
  const ok = await errorHandler.wrapAsync(
    () =>
      invoke<void>("wa_send_click", {
        hwnd: ctx.boundHwnd,
        x: coord.x,
        y: coord.y,
        button: params.button,
        doubleClick: params.clickType === "double",
      }),
    { userMessage: "后台点击失败" }
  );
  if (ok === null) {
    ctx.appendLog("error", index, "点击失败，停止执行");
    return "__STOP__";
  }
  await sleep(params.delayAfter);
  return null;
}

async function runKeyPress(
  ctx: StepExecContext,
  params: Extract<StepParams, { type: "keypress" }>["params"],
  index: number
): Promise<string | null> {
  if (!ctx.boundHwnd) {
    ctx.appendLog("error", index, "未绑定窗口，跳过按键步骤");
    return null;
  }
  const ok = await errorHandler.wrapAsync(
    () =>
      invoke<void>("wa_send_keypress", {
        hwnd: ctx.boundHwnd,
        key: params.key,
        modifiers: params.modifiers,
      }),
    { userMessage: "后台按键失败" }
  );
  if (ok === null) {
    ctx.appendLog("error", index, "按键失败，停止执行");
    return "__STOP__";
  }
  await sleep(params.delayAfter);
  return null;
}

async function runDelay(
  params: Extract<StepParams, { type: "delay" }>["params"]
): Promise<string | null> {
  await sleepWithRandom(params.duration, params.randomRange);
  return null;
}

async function runColorCheck(
  ctx: StepExecContext,
  params: ColorCheckStepParams,
  index: number
): Promise<string | null> {
  if (!ctx.boundHwnd) {
    ctx.appendLog("error", index, "未绑定窗口，跳过颜色判断");
    return null;
  }
  const clientSize = await ctx.getClientSize();
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
          hwnd: ctx.boundHwnd,
          x: coord.x,
          y: coord.y,
        }),
      { userMessage: "取色失败" }
    );
    if (!rgb) return "__STOP__";
    const actualHex = rgbToHex(rgb[0], rgb[1], rgb[2]);
    const distance = colorDistancePercent(actualHex, params.expectedColor);
    match = distance <= params.tolerance;
    ctx.appendLog(
      match ? "info" : "debug",
      index,
      `单点颜色 ${actualHex} 距期望 ${params.expectedColor} = ${distance.toFixed(1)}% (容差 ${params.tolerance}%) -> ${match ? "匹配" : "不匹配"}`
    );
  } else if (params.checkMode === "rect" && params.rect) {
    const rect = resolveRect(params.rect, clientSize);
    match = await runRectColorCheck(ctx, rect, params, index);
  }
  return match ? params.matchGoto || null : params.mismatchGoto || null;
}

async function runRectColorCheck(
  ctx: StepExecContext,
  rect: { x: number; y: number; width: number; height: number },
  params: ColorCheckStepParams,
  index: number
): Promise<boolean> {
  const buffer = await errorHandler.wrapAsync(
    () =>
      invoke<ArrayBuffer>("wa_capture_window", {
        hwnd: ctx.boundHwnd,
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
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx2d) {
      ctx.appendLog("error", index, "Canvas 2D 上下文不可用");
      return false;
    }
    ctx2d.drawImage(img, 0, 0);
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
      ctx.appendLog("error", index, "区域尺寸为 0");
      return false;
    }
    const data = ctx2d.getImageData(x0, y0, w, h).data;
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
      ctx.appendLog(
        "debug",
        index,
        `区域颜色占比 ${actualPct.toFixed(1)}% (阈值 ${minPct}%) -> ${match ? "匹配" : "不匹配"}`
      );
    } else {
      match = matchCount > 0;
      ctx.appendLog(
        "debug",
        index,
        `区域包含期望颜色像素 ${matchCount}/${total} -> ${match ? "匹配" : "不匹配"}`
      );
    }
  } catch (e) {
    ctx.appendLog("error", index, `区域颜色判断异常: ${String(e)}`);
    match = false;
  } finally {
    URL.revokeObjectURL(url);
  }
  return match;
}

function runCounter(
  params: CounterStepParams,
  stepId: string,
  index: number,
  ctx: StepExecContext
): string | null {
  const cur = (ctx.counters[stepId] ?? 0) + 1;
  ctx.counters[stepId] = cur;
  ctx.appendLog(
    "debug",
    index,
    `counter ${stepId} = ${cur} / ${params.maxCount}`
  );
  if (cur >= params.maxCount) {
    return params.reachedGotoId || null;
  }
  return params.notReachedGotoId || null;
}

function runLog(
  params: LogStepParams,
  ctx: StepExecContext
): string | null {
  const text = interpolateVariables(params.message, ctx.variables);
  ctx.appendLog(params.level, null, text);
  return null;
}

async function runOcr(
  ctx: StepExecContext,
  params: OcrStepParams,
  index: number
): Promise<string | null> {
  if (!ctx.boundHwnd) {
    ctx.appendLog("error", index, "未绑定窗口，跳过 OCR");
    return null;
  }
  const clientSize = await ctx.getClientSize();
  const rect = resolveRect(params.rect, clientSize);
  if (rect.width <= 0 || rect.height <= 0) {
    ctx.appendLog("error", index, "OCR 区域尺寸无效");
    return null;
  }
  const buffer = await errorHandler.wrapAsync(
    () =>
      invoke<ArrayBuffer>("wa_capture_window", {
        hwnd: ctx.boundHwnd,
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
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
      ctx.appendLog("error", index, "Canvas 2D 上下文不可用");
      return "__STOP__";
    }
    ctx2d.drawImage(img, 0, 0);
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = Math.max(1, Math.floor(rect.width));
    cropCanvas.height = Math.max(1, Math.floor(rect.height));
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) {
      ctx.appendLog("error", index, "Canvas 2D 上下文不可用");
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
      ctx.appendLog("error", index, `smart-ocr 注册器不可用: ${String(e)}`);
      return "__STOP__";
    }
    if (!registry || typeof registry.runOcr !== "function") {
      ctx.appendLog("error", index, "smart-ocr 注册器缺少 runOcr");
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
      ctx.variables[params.saveToVariable] = recognizedText;
    }
    if (!params.keyword) {
      matched = recognizedText.length > 0;
    } else if (params.useRegex) {
      try {
        const re = new RegExp(params.keyword, "i");
        matched = re.test(recognizedText);
      } catch (e) {
        ctx.appendLog("error", index, `正则非法: ${String(e)}`);
        matched = false;
      }
    } else {
      matched = recognizedText.includes(params.keyword);
    }
    ctx.appendLog(
      matched ? "info" : "debug",
      index,
      `OCR 文本: ${truncate(recognizedText, 80)} -> ${matched ? "匹配" : "不匹配"}`
    );
  } catch (e) {
    ctx.appendLog("error", index, `OCR 异常: ${String(e)}`);
    return "__STOP__";
  } finally {
    URL.revokeObjectURL(url);
  }
  return matched ? params.matchGoto || null : params.mismatchGoto || null;
}

// 避免未使用类型告警
export type { WindowInfo };
