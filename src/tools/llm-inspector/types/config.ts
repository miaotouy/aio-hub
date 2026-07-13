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
  /**
   * 是否在请求结束后自动执行客户端 Token 估算（默认 false）。
   *
   * 服务端 usage 提取始终自动执行（成本极低），此开关仅控制
   * 较重的客户端 tokenizer 估算是否在响应到达后自动跑一次。
   * 关闭时用户需要在详情面板的 Token 卡片上手动点击触发。
   */
  autoEstimateTokens?: boolean;
  /**
   * 最大保留的捕获记录数量（默认 100）。
   *
   * 超过此数量后，最旧的记录会被自动移除（FIFO）。
   * 仅在新记录到达时检查，已有记录不会被立即裁剪。
   */
  maxRecords?: number;
  version?: string;
}
