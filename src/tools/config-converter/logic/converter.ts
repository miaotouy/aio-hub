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

import type { ConfigFormat, ConvertOptions, ConvertResult } from "../types";
import { parseConfig } from "./parsers";
import { serializeConfig } from "./serializers";

/**
 * 核心转换函数
 * @param input 输入文本
 * @param from 源格式
 * @param to 目标格式
 * @param options 转换选项
 */
export function convertConfig(
  input: string,
  from: ConfigFormat,
  to: ConfigFormat,
  options: ConvertOptions = {}
): ConvertResult {
  const warnings: string[] = [];

  try {
    const trimmed = input.trim();
    if (!trimmed) {
      return {
        success: true,
        output: "",
        warnings: [],
      };
    }

    // 1. 解析为 JS 对象
    const parsed = parseConfig(trimmed, from);

    // 2. 序列化为目标格式
    const output = serializeConfig(parsed, to, options, warnings);

    return {
      success: true,
      output,
      warnings,
    };
  } catch (error: any) {
    return {
      success: false,
      output: input, // 失败时返回原始输入
      error: error.message || "转换失败，请检查语法是否正确",
      warnings,
    };
  }
}
