// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 窗口自动化助手 (Window Automator) - 类型定义
 *
 * 步骤参数面向运行时使用：坐标用 Coordinate 统一描述，
 * 跳转一律使用步骤 ID (FlowStep.id) 而非显示序号，避免拖拽后错乱。
 */

// ===================== 窗口信息 =====================

/** 从 Rust 后端 wa_get_windows 返回的窗口信息 */
export interface WindowInfo {
  hwnd: number;
  title: string;
  className: string;
  processName: string;
}

/** 窗口客户区尺寸 */
export interface ClientRect {
  width: number;
  height: number;
}

// ===================== 坐标系统 =====================

export type CoordinateMode = "pixel" | "percent";

export interface Coordinate {
  mode: CoordinateMode;
  /** pixel 模式为像素值，percent 模式为 0~100 */
  x: number;
  y: number;
}

export interface RectArea {
  x: number;
  y: number;
  width: number;
  height: number;
  mode: CoordinateMode;
}

// ===================== 步骤类型 =====================

export type StepType =
  | "click"
  | "keypress"
  | "delay"
  | "colorCheck"
  | "goto"
  | "counter"
  | "log"
  | "ocr"
  | "call";

export type MouseButton = "left" | "right" | "middle";
export type ClickType = "single" | "double";
export type OperationMode = "background" | "foreground";

// --- 各步骤参数 ---

export interface ClickStepParams {
  coordinate: Coordinate;
  button: MouseButton;
  clickType: ClickType;
  mode: OperationMode;
  /** 点击后等待的毫秒数 */
  delayAfter: number;
}

export interface KeyPressStepParams {
  /** 按键标识，如 'Enter' 'Space' 'a' 'F1' */
  key: string;
  /** 修饰键，如 ['ctrl', 'shift'] */
  modifiers: string[];
  mode: OperationMode;
  delayAfter: number;
}

export interface DelayStepParams {
  /** 毫秒数 */
  duration: number;
  /** 随机波动范围（±ms），0 表示精确延时 */
  randomRange: number;
}

export type ColorCheckMode = "point" | "rect";
export type RectCheckType = "contains" | "percentage";

export interface ColorCheckStepParams {
  checkMode: ColorCheckMode;
  /** 单点模式下的坐标 */
  coordinate?: Coordinate;
  /** 区域模式下的矩形 */
  rect?: RectArea;
  /** Hex 颜色，如 '#FF0000' */
  expectedColor: string;
  /** 容差百分比 0~100 */
  tolerance: number;
  /** 区域模式专属 */
  rectCheckType?: RectCheckType;
  /** 占比阈值 0~100（rectCheckType=percentage 时使用） */
  minPercentage?: number;
  /** 匹配时跳转的步骤 ID（空字符串表示顺延下一步） */
  matchGoto: string;
  /** 不匹配时跳转的步骤 ID */
  mismatchGoto: string;
}

export interface GotoStepParams {
  /** 跳转目标步骤 ID */
  targetStepId: string;
}

export interface CounterStepParams {
  maxCount: number;
  /** 未达上限时跳转的步骤 ID（空字符串表示顺延下一步） */
  notReachedGotoId: string;
  /** 达到上限时跳转的步骤 ID */
  reachedGotoId: string;
}

export type LogLevel = "info" | "warn" | "debug";

export interface LogStepParams {
  /** 自定义日志文本，支持变量插值如 "当前血量: {hp}" */
  message: string;
  level: LogLevel;
}

/**
 * OCR 步骤参数。
 *
 * 引擎配置复用 smart-ocr 的 OcrEngineConfig 联合类型（从
 * "@/tools/smart-ocr/platform/types" import），不在本工具内复制定义。
 * 执行时通过 toolRegistryManager.getRegistry("smart-ocr") 拿到
 * runOcr(blocks, config) 复用，从而与 SmartOcr 共享引擎真理来源。
 */
export interface OcrStepParams {
  rect: RectArea;
  engineType: OcrEngineType;
  engineConfig: OcrEngineConfig;
  /** 期望匹配的关键字（支持正则或普通文本） */
  keyword: string;
  useRegex: boolean;
  matchGoto: string;
  mismatchGoto: string;
  /** 可选：将识别到的文本存入变量名（如 "hp"） */
  saveToVariable?: string;
}

export interface CallStepParams {
  /** 调用的子流程 ID（对应 ActionFlow.subFlows[].id）；空字符串表示未配置 */
  targetSubFlowId: string;
  /**
   * 实参键值对：key = 形参 name，value = 实际传入的值。
   * 支持变量插值，例如 { "targetHp": "{global_min_hp}" } 或 { "targetHp": "80" }。
   * 缺省或未列出的形参使用子流程定义的 defaultValue。
   */
  arguments?: Record<string, string>;
  /**
   * 可选：把子流程的返回值（returnVariableName 指向的局部变量）写入
   * 调用方作用域的哪个变量中。空字符串 / 缺省表示丢弃返回值。
   */
  saveResultToVariable?: string;
}

/**
 * 子流程形参定义。
 *
 * 设计为字符串值类型：变量插值由执行器在压栈时一次性解析，
 * 形参不区分 number / string / boolean，统一在配置侧通过 defaultValue
 * 字符串表达，运行期由用户业务代码自行转换（避免在前端做类型推断）。
 */
export interface SubFlowParamDefine {
  /** 形参名（英文标识，用于变量插值，如 "targetHp"） */
  name: string;
  /** 显示名称（如 "目标血量百分比"） */
  label: string;
  /** 默认值（缺省时使用，支持变量插值字符串） */
  defaultValue: string;
}

// --- 步骤联合 ---

export type StepParams =
  | { type: "click"; params: ClickStepParams }
  | { type: "keypress"; params: KeyPressStepParams }
  | { type: "delay"; params: DelayStepParams }
  | { type: "colorCheck"; params: ColorCheckStepParams }
  | { type: "goto"; params: GotoStepParams }
  | { type: "counter"; params: CounterStepParams }
  | { type: "log"; params: LogStepParams }
  | { type: "ocr"; params: OcrStepParams }
  | { type: "call"; params: CallStepParams };

/** 单个步骤 */
export interface FlowStep {
  /** nanoid 生成的唯一 ID，跨增删/拖拽后跳转引用始终有效 */
  id: string;
  /** 用户自定义标签（如"点击池塘"） */
  label: string;
  /** 是否启用（禁用的步骤在执行时跳过） */
  enabled: boolean;
  stepConfig: StepParams;
}

// ===================== 动作流方案 =====================

/**
 * 自定义函数 / 子流程（sub-flow）。
 *
 * 归属于某个 ActionFlow，保存在 ActionFlow.subFlows 中，
 * 导入导出时与主流程一起作为完整单元迁移，避免跨文件引用丢失。
 *
 * 子流程内部跳转（goto / colorCheck / counter / ocr）只能跳转到
 * 自身 steps 列表中的步骤；跨流程跳转被禁止。调用通过 call 步骤实现。
 */
export interface SubFlow {
  /** nanoid 生成的唯一 ID */
  id: string;
  /** 用户自定义名称（如"打坐回血"） */
  name: string;
  steps: FlowStep[];
  /**
   * 可选：形参定义列表。
   * 调用方在 CallStepParams.arguments 中按 name 提供实参；缺省使用 defaultValue。
   */
  params?: SubFlowParamDefine[];
  /**
   * 可选：把哪个局部变量的值作为函数返回值。
   * 执行器在子流程执行完毕（出栈）时读取该变量并交给调用方。
   */
  returnVariableName?: string;
}

/** 完整的动作流方案（可保存/加载的单元） */
export interface ActionFlow {
  id: string;
  name: string;
  description: string;
  /** 绑定窗口信息（用于自动重连；运行时以 boundWindow 为准） */
  targetWindow: {
    title: string;
    className: string;
  } | null;
  steps: FlowStep[];
  /** 子流程/自定义函数列表（可选，向下兼容旧方案文件） */
  subFlows?: SubFlow[];
  createdAt: string;
  updatedAt: string;
}

// ===================== 执行器状态 =====================

export type ExecutorStatus = "idle" | "running" | "paused" | "stopping";

/** 运行时上下文 */
export interface ExecutorRuntime {
  status: ExecutorStatus;
  /**
   * 当前正在执行的"主流程步骤"索引（0-based）。
   * 当正在执行子流程时，这里记录的是触发该调用的主流程 call 步骤索引，
   * 便于主流程编辑器把 call 卡片保持高亮。
   */
  currentStepIndex: number;
  /** 各 counter 步骤的计数器，key = step.id */
  counters: Record<string, number>;
  /** 运行时变量表（key=变量名） */
  variables: Record<string, string>;
  startTime: number | null;
  totalStepsExecuted: number;
  logs: ExecutorLog[];
  /** 当前执行方案的 ID（用于在 UI 中高亮对应卡片） */
  currentFlowId: string | null;
  /** 当前绑定的窗口信息（运行时快照） */
  boundHwnd: number | null;
  /**
   * 当前调用栈快照：空数组表示正在执行主流程；
   * 数组最后一个元素是最深层子流程。用于面包屑/日志展示，
   * 也供子流程编辑器判断"哪个步骤正在跑"。
   */
  currentCallStack: ExecutorCallFrame[];
}

/** 执行器调用栈中的一帧（描述当前所在子流程的上下文） */
export interface ExecutorCallFrame {
  /** 所在子流程的 ID */
  subFlowId: string;
  /** 子流程名称（日志/面包屑用） */
  subFlowName: string;
  /** 触发该次调用的原步骤 ID（主流程 call 步骤的 id，或上级子流程 call 步骤的 id） */
  callerStepId: string;
  /** 当前在该子流程内执行到的步骤索引（0-based） */
  stepIndex: number;
}

export type ExecutorLogLevel = "info" | "warn" | "error" | "debug";

export interface ExecutorLog {
  timestamp: number;
  level: ExecutorLogLevel;
  /** 关联的步骤索引，null 表示系统日志 */
  stepIndex: number | null;
  message: string;
}

// ===================== 截图取点 =====================

export interface ScreenshotPickerResult {
  x: number;
  y: number;
  xPercent: number;
  yPercent: number;
  color: string;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
    xPercent: number;
    yPercent: number;
    widthPercent: number;
    heightPercent: number;
  };
}

// ===================== OCR 引擎类型（透传自 smart-ocr） =====================

/**
 * 透传自 smart-ocr 的引擎类型与配置联合。
 * 这里仅在类型层面引用，避免在本工具内复制定义。
 * 实际运行通过 toolRegistryManager.getRegistry("smart-ocr").runOcr() 调用。
 */
export type {
  OcrEngineType,
  OcrEngineConfig,
} from "@/tools/smart-ocr/platform/types";
import type {
  OcrEngineType,
  OcrEngineConfig,
} from "@/tools/smart-ocr/platform/types";
