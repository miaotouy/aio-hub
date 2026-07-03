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
 * API 测试工具的类型定义
 */

// 变量类型
export type VariableType = "string" | "enum" | "boolean";

// 变量定义
export interface Variable {
  key: string;
  value: string | boolean;
  type: VariableType;
  label?: string; // 显示标签
  placeholder?: string; // 占位符
  options?: string[]; // enum 类型的选项
  required?: boolean; // 是否必填
  description?: string; // 变量说明
}

// HTTP 方法
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS";

// API 预设
export interface ApiPreset {
  id: string;
  name: string;
  description?: string;
  // URL 模板字符串 (如: "{{protocol}}://{{baseUrl}}/{{endpoint}}")
  urlTemplate: string;
  method: HttpMethod;
  // 默认请求头
  headers: Record<string, string>;
  // 请求体模板（支持 {{variable}} 占位符）
  bodyTemplate?: string;
  // 此预设包含的变量定义
  variables: Variable[];
}

// 请求配置文件（可保存和加载）
export interface RequestProfile {
  id: string;
  name: string;
  selectedPresetId: string;
  urlTemplate: string;
  method: HttpMethod;
  // 当前变量值
  variables: Record<string, string | boolean>;
  // 自定义请求头
  headers: Record<string, string>;
  // 请求体内容
  body: string;
  // 创建时间
  createdAt?: string;
  // 更新时间
  updatedAt?: string;
}

// API 响应
export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number; // 请求耗时（毫秒）
  timestamp: string;
  error?: string;
  isStreaming?: boolean; // 是否是流式响应
  streamChunks?: string[]; // 流式响应的数据块
  isStreamComplete?: boolean; // 流是否已完成
  size?: number; // 响应体字符数
}

// 请求历史
export interface RequestHistoryItem {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  status: number;
  statusText: string;
  duration: number;
  timestamp: string;
  selectedPresetId: string;
  urlTemplate: string;
  variables: Record<string, string | boolean>;
  headers: Record<string, string>;
  body: string;
  responsePreview: string;
  error?: string;
}
