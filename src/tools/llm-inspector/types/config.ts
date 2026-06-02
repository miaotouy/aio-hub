/**
 * LLM Inspector — 配置 / 设置相关类型
 *
 * 包含：
 * - {@link HeaderOverrideRule} — 请求头覆盖规则；
 * - {@link InspectorConfig} — 检查器核心配置（端口 / 目标 / 规则）；
 * - {@link InspectorStatus} — 后端运行状态；
 * - {@link InspectorServiceState} — 前端运行状态视图；
 * - {@link InspectorLayoutSettings} — UI 布局持久化；
 * - {@link LlmInspectorSettings} — 持久化到磁盘的完整设置。
 */

/** 单条请求头覆盖规则 */
export interface HeaderOverrideRule {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

/** 检查器核心配置 */
export interface InspectorConfig {
  port: number;
  target_url: string;
  header_override_rules: HeaderOverrideRule[];
}

/** 后端返回的运行状态 */
export interface InspectorStatus {
  is_running: boolean;
  port: number;
  target_url: string;
}

/** 前端运行状态视图（兼容旧代码） */
export interface InspectorServiceState {
  isRunning: boolean;
  port: number;
  targetUrl: string;
}

/** UI 布局状态（D4 引入，向后兼容可选） */
export interface InspectorLayoutSettings {
  /** 左右分栏比例 (0.1 - 0.9)，默认 0.25 */
  splitRatio: number;
}

/** 完整持久化设置（写入磁盘的根对象） */
export interface LlmInspectorSettings {
  config: InspectorConfig;
  searchQuery: string;
  filterStatus: string;
  maskApiKeys?: boolean;
  /** 目标地址历史记录 */
  targetUrlHistory?: string[];
  /**
   * 布局状态（D4 引入，向后兼容）
   *
   * 未指定时使用默认值（splitRatio: 0.25）。
   */
  layout?: InspectorLayoutSettings;
  version?: string;
}
