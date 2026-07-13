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
 * 代码格式化选项
 */
export interface FormatOptions {
  /** 使用单引号 */
  singleQuote?: boolean;
  /** 尾随逗号 */
  trailingComma?: "none" | "es5" | "all";
  /** 额外的 Prettier 选项 */
  [key: string]: any;
}

/**
 * 代码格式化结果
 */
export interface FormatResult {
  /** 格式化后的代码 */
  formatted: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
  /** 警告信息（如果有） */
  warning?: string;
}

/**
 * 支持的语言类型
 */
export type SupportedLanguage =
  | "javascript"
  | "typescript"
  | "json"
  | "html"
  | "css"
  | "markdown"
  | "php"
  | "xml"
  | "yaml";
