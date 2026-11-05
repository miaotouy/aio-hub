import type { MessageRole } from "./common";

/**
 * 正则规则生效阶段。
 * - render：消息显示前应用，只影响界面，不改写持久化内容。
 * - request：发送给模型前应用，只影响本次请求上下文。
 */
export type RegexStage = "render" | "request";

/**
 * 阶段开关。旧配置只声明 request 时，渲染阶段按 false 安全降级。
 */
export interface RegexRuleApplyTo {
  render: boolean;
  request: boolean;
}

/**
 * 移动端最小可执行正则规则，字段对齐桌面 `ChatRegexRule` 的子集。
 */
export interface ChatRegexRule {
  id?: string;
  enabled: boolean;
  name?: string;
  regex: string;
  replacement: string;
  flags?: string;
  applyTo: RegexRuleApplyTo;
  targetRoles: MessageRole[];
  depthRange?: { min?: number; max?: number };
  /** 移动端不执行脚本规则，仅保留字段用于统计与降级提示。 */
  replacementType?: "regex" | "script";
  /**
   * 宏替换模式，对齐 ST `substituteRegex`：
   * - NONE（缺省）：不对规则中的 `{{user}}`/`{{char}}` 宏做替换；
   * - RAW：宏结果原样写入 regex / trimStrings；
   * - ESCAPED：宏结果先做正则元字符转义再写入。
   */
  substitutionMode?: "NONE" | "RAW" | "ESCAPED";
  /** 捕获组后处理裁剪串，用于在替换前从捕获组内容中移除指定子串。 */
  trimStrings?: string[];
  order?: number;
}

export interface ChatRegexPreset {
  id?: string;
  name?: string;
  enabled: boolean;
  /** 预设优先级，数值越小越先执行，缺省 100。 */
  priority?: number;
  /** 预设内/预设间排序位，缺省 0。 */
  order?: number;
  rules: ChatRegexRule[];
}

export interface ChatRegexConfig {
  presets: ChatRegexPreset[];
}
