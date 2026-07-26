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
 * 内置 tokenizer 的构建期资产来源。
 *
 * Vite 插件使用该清单从 npm 包读取 tokenizer.json / tokenizer_config.json，
 * 压缩后作为独立静态资产输出；运行时代码只保留对应 URL。
 */
export const BUILTIN_TOKENIZER_ASSET_SOURCES = {
  gpt4o: { packageName: "@lenml/tokenizer-gpt4o" },
  gpt4: { packageName: "@lenml/tokenizer-gpt4" },
  claude: { packageName: "@lenml/tokenizer-claude" },
  gemini: { packageName: "@lenml/tokenizer-gemini" },
  llama3_2: { packageName: "@lenml/tokenizer-llama3_2" },
  deepseek_v3: { packageName: "@lenml/tokenizer-deepseek_v3" },
  qwen3: { packageName: "@lenml/tokenizer-qwen3" },
} as const;

export type BuiltinTokenizerAssetId =
  keyof typeof BUILTIN_TOKENIZER_ASSET_SOURCES;
