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

import type { ModelCapabilities } from "@/types/llm-profiles";
import type {
  TranslationThinkingMode,
  TranslationThinkingParams,
} from "../types";

/** 预算型思考（Claude / Gemini 2.5）的最小 budget_tokens */
export const MIN_THINKING_BUDGET = 1024;

/**
 * 从模型声明的 `reasoningEffortOptions` 里挑最低档。
 * - `forDisabled` 时优先 "none"（真正关闭），否则退到 "minimal"/"low"
 * - 其他情况优先 "minimal"
 * 都不匹配时退回列表首项；列表为空时给出保守默认值 "low"。
 */
export function pickLowestReasoningEffort(
  options: string[] | undefined,
  forDisabled: boolean
): string {
  const list = (options ?? [])
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  if (list.length === 0) return "low";
  const priority = forDisabled
    ? ["none", "minimal", "low", "medium", "high", "xhigh"]
    : ["minimal", "none", "low", "medium", "high", "xhigh"];
  for (const candidate of priority) {
    if (list.includes(candidate)) return candidate;
  }
  return list[0];
}

export interface ResolveThinkingParamsInput {
  mode: TranslationThinkingMode;
  /** 目标模型的能力声明 */
  capabilities?: ModelCapabilities;
  /** 目标模型是否属于 Gemini 家族（Gemini 需要 thinkingBudget: 0 关闭） */
  isGemini?: boolean;
}

/**
 * 按思考模式与模型能力解析要下发的思考参数。
 *
 * - `default`：不传，跟随模型默认
 * - `disabled`：switch 关开关；budget 关开关（Gemini 额外置 0）；effort 取最低档
 * - `minimal`：switch 打开；budget 取最小预算；effort 取最低档
 *
 * 模型未声明 `capabilities.thinking` 时返回空对象（静默忽略）。
 */
export function resolveThinkingParams(
  input: ResolveThinkingParamsInput
): TranslationThinkingParams {
  const { mode, capabilities, isGemini } = input;
  if (mode === "default") return {};
  if (!capabilities?.thinking) return {};
  const type = capabilities.thinkingConfigType ?? "none";

  if (mode === "disabled") {
    if (type === "switch") {
      return { thinkingEnabled: false };
    }
    if (type === "budget") {
      return isGemini
        ? { thinkingEnabled: false, thinkingBudget: 0 }
        : { thinkingEnabled: false };
    }
    if (type === "effort") {
      return {
        reasoningEffort: pickLowestReasoningEffort(
          capabilities.reasoningEffortOptions,
          true
        ),
      };
    }
    return {};
  }

  // mode === "minimal"
  if (type === "switch") return { thinkingEnabled: true };
  if (type === "budget") {
    return { thinkingEnabled: true, thinkingBudget: MIN_THINKING_BUDGET };
  }
  if (type === "effort") {
    return {
      reasoningEffort: pickLowestReasoningEffort(
        capabilities.reasoningEffortOptions,
        false
      ),
    };
  }
  return {};
}
