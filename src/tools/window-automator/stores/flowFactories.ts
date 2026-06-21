/**
 * 方案 / 步骤工厂函数（无副作用的纯函数）
 *
 * 把 store 中"生成初始数据"的纯逻辑独立出来，方便复用和单测。
 */

import { nanoid } from "nanoid";
import type {
  ActionFlow,
  Coordinate,
  FlowStep,
  RectArea,
  StepParams,
  StepType,
  SubFlow,
} from "../types";

/** 默认坐标 */
const DEFAULT_COORDINATE: Coordinate = { mode: "pixel", x: 0, y: 0 };

/** 默认矩形区域 */
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
    case "call":
      return {
        type: "call",
        params: {
          targetSubFlowId: "",
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
    case "call":
      return "调用函数";
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
    subFlows: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** 创建一个空白子流程 / 自定义函数 */
export function createSubFlow(name = "新函数"): SubFlow {
  return {
    id: nanoid(8),
    name,
    steps: [],
  };
}
