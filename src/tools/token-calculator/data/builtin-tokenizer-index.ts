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
 * 内置 Tokenizer Profile 索引（纯数据）
 *
 * 不增加 bundle 体积：使用动态 import 的 loader，只有在 Worker 真正调用时
 * 才会加载对应的 `@lenml/tokenizer-*` 模块。
 *
 * 详见 docs/Plan/分词器资产注册表方案.md §14
 */

import type { BuiltinTokenizerEntry } from "../types/tokenizer-profile";

/**
 * 内置 profile 的 ID 与现有 ModelMetadataProperties.tokenizer 字符串一致，
 * 保证老配置零迁移。
 */
export const BUILTIN_TOKENIZERS: BuiltinTokenizerEntry[] = [
  {
    id: "gpt4o",
    name: "GPT-4o / GPT-5 / o-series",
    version: "1",
    description:
      "OpenAI GPT-4o / GPT-5 / o1, o3, o4 等系列使用的 o200k_base 分词器",
    modelPatterns: ["^(gpt-5|gpt-4o|o[134])"],
    source: { type: "bundled", packageName: "@lenml/tokenizer-gpt4o" },
    confidence: "exact",
    license: "MIT",
    tags: ["openai", "o200k"],
    enabled: true,
    loader: () => import("@lenml/tokenizer-gpt4o"),
  },
  {
    id: "gpt4",
    name: "GPT-4 / GPT-3.5",
    version: "1",
    description: "OpenAI GPT-4, GPT-3.5 等使用的 cl100k_base 分词器",
    modelPatterns: ["^gpt-4(?!o)", "^gpt-3"],
    source: { type: "bundled", packageName: "@lenml/tokenizer-gpt4" },
    confidence: "exact",
    license: "MIT",
    tags: ["openai", "cl100k"],
    enabled: true,
    loader: () => import("@lenml/tokenizer-gpt4"),
  },
  {
    id: "claude",
    name: "Claude (近似)",
    version: "1",
    description:
      "Anthropic Claude 系列分词器（基于公开数据近似实现，新版本可能存在偏差，建议结合 calibration 使用）",
    modelPatterns: ["^claude-"],
    source: { type: "bundled", packageName: "@lenml/tokenizer-claude" },
    confidence: "close",
    license: "MIT",
    tags: ["anthropic"],
    enabled: true,
    loader: () => import("@lenml/tokenizer-claude"),
  },
  {
    id: "gemini",
    name: "Gemini / Gemma / Veo",
    version: "1",
    description: "Google Gemini, Gemma, Veo 系列分词器",
    modelPatterns: ["^(gemini-|gemma|veo-)"],
    source: { type: "bundled", packageName: "@lenml/tokenizer-gemini" },
    confidence: "exact",
    license: "MIT",
    tags: ["google"],
    enabled: true,
    loader: () => import("@lenml/tokenizer-gemini"),
  },
  {
    id: "llama3_2",
    name: "Llama (3.2)",
    version: "1",
    description: "Llama 全系列使用的 3.2 分词器",
    modelPatterns: ["^(llama|meta-llama)"],
    source: { type: "bundled", packageName: "@lenml/tokenizer-llama3_2" },
    confidence: "exact",
    license: "Llama 3 Community License",
    tags: ["meta", "llama"],
    enabled: true,
    loader: () => import("@lenml/tokenizer-llama3_2"),
  },
  {
    id: "deepseek_v3",
    name: "DeepSeek V3",
    version: "1",
    description: "DeepSeek 全系列（V3 / R1 等）分词器",
    modelPatterns: ["^deepseek-"],
    source: { type: "bundled", packageName: "@lenml/tokenizer-deepseek_v3" },
    confidence: "exact",
    license: "MIT",
    tags: ["deepseek"],
    enabled: true,
    loader: () => import("@lenml/tokenizer-deepseek_v3"),
  },
  {
    id: "qwen3",
    name: "Qwen (Qwen3)",
    version: "1",
    description: "Qwen 全系列使用的 Qwen3 分词器",
    modelPatterns: ["^(qwen|qwq-)"],
    source: { type: "bundled", packageName: "@lenml/tokenizer-qwen3" },
    confidence: "exact",
    license: "Apache-2.0",
    tags: ["alibaba", "qwen"],
    enabled: true,
    loader: () => import("@lenml/tokenizer-qwen3"),
  },
];

/**
 * Worker 端使用的 packageName → loader 静态映射
 *
 * 由于 loader 是函数（不可序列化），主线程无法通过 postMessage 传给 Worker。
 * Worker 收到 init 消息后，根据 profile.source.packageName 在此映射中查找
 * 对应的动态 import 函数即可。
 */
export const WORKER_BUILTIN_LOADERS: Record<
  string,
  () => Promise<{ fromPreTrained: () => unknown }>
> = {
  "@lenml/tokenizer-gpt4o": () => import("@lenml/tokenizer-gpt4o"),
  "@lenml/tokenizer-gpt4": () => import("@lenml/tokenizer-gpt4"),
  "@lenml/tokenizer-claude": () => import("@lenml/tokenizer-claude"),
  "@lenml/tokenizer-gemini": () => import("@lenml/tokenizer-gemini"),
  "@lenml/tokenizer-llama3_2": () => import("@lenml/tokenizer-llama3_2"),
  "@lenml/tokenizer-deepseek_v3": () => import("@lenml/tokenizer-deepseek_v3"),
  "@lenml/tokenizer-qwen3": () => import("@lenml/tokenizer-qwen3"),
};

/**
 * 构造可序列化的内置 profile 列表（剥离 loader 函数，可安全 postMessage）
 */
export function getSerializableBuiltinProfiles() {
  return BUILTIN_TOKENIZERS.map(({ loader: _loader, ...rest }) => rest);
}
