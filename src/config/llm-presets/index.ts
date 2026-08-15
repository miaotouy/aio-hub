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
 * LLM 服务商预设模板配置
 */

import type { LlmPreset } from "./types";
import { vcpPreset } from "./presets/vcp";
import { deepseekPreset } from "./presets/deepseek";
import { openaiPreset } from "./presets/openai";
import { openaiResponsesPreset } from "./presets/openai-responses";
import { moonshotPreset } from "./presets/moonshot";
import { zhipuPreset } from "./presets/zhipu";
import { groqPreset } from "./presets/groq";
import { geminiPreset } from "./presets/gemini";
import { anthropicPreset } from "./presets/anthropic";
import { coherePreset } from "./presets/cohere";
import { huggingFacePreset } from "./presets/hugging-face";
import { vertexAiPreset } from "./presets/vertex-ai";
import { volcenginePreset } from "./presets/volcengine";
import { xaiPreset } from "./presets/xai";
import { aliyunPreset } from "./presets/aliyun";
import { mangotvPreset } from "./presets/mangotv";
import { mistralPreset } from "./presets/mistral";
import { ai21Preset } from "./presets/ai21";
import { baiduPreset } from "./presets/baidu";
import { tencentPreset } from "./presets/tencent";
import { minimaxPreset } from "./presets/minimax";
import { minimaxMusicPreset } from "./presets/minimax-music";
import { yiPreset } from "./presets/yi";
import { baichuanPreset } from "./presets/baichuan";
import { sensenovaPreset } from "./presets/sensenova";
import { openrouterPreset } from "./presets/openrouter";
import { siliconflowPreset } from "./presets/siliconflow";
import { togetherPreset } from "./presets/together";
import { fireworksPreset } from "./presets/fireworks";
import { deepinfraPreset } from "./presets/deepinfra";
import { perplexityPreset } from "./presets/perplexity";
import { azureOpenaiPreset } from "./presets/azure-openai";
import { modelscopePreset } from "./presets/modelscope";
import { ollamaPreset } from "./presets/ollama";
import { ollamaCloudPreset } from "./presets/ollama-cloud";
import { audiocppPreset } from "./presets/audiocpp";
import { lmStudioPreset } from "./presets/lm-studio";
import { newapiPreset } from "./presets/newapi";
import { sunoNewapiPreset } from "./presets/suno-newapi";
import { opencodeGoPreset } from "./presets/opencode-go";
import { newApiPreset } from "./presets/new-api";
import { sub2apiPreset } from "./presets/sub2api";

export * from "./types";

/**
 * LLM 服务商预设模板列表
 * 用于快速创建常用服务配置
 */
export const llmPresets: LlmPreset[] = [
  vcpPreset,
  deepseekPreset,
  openaiPreset,
  openaiResponsesPreset,
  moonshotPreset,
  zhipuPreset,
  groqPreset,
  geminiPreset,
  anthropicPreset,
  coherePreset,
  huggingFacePreset,
  vertexAiPreset,
  volcenginePreset,
  xaiPreset,
  aliyunPreset,
  mangotvPreset,
  mistralPreset,
  ai21Preset,
  baiduPreset,
  tencentPreset,
  minimaxPreset,
  minimaxMusicPreset,
  yiPreset,
  baichuanPreset,
  sensenovaPreset,
  openrouterPreset,
  siliconflowPreset,
  togetherPreset,
  fireworksPreset,
  deepinfraPreset,
  perplexityPreset,
  azureOpenaiPreset,
  modelscopePreset,
  ollamaPreset,
  ollamaCloudPreset,
  audiocppPreset,
  lmStudioPreset,
  newapiPreset,
  sunoNewapiPreset,
  opencodeGoPreset,
  newApiPreset,
  sub2apiPreset,
];

/**
 * 根据名称获取预设模板
 */
export function getPresetByName(name: string): LlmPreset | undefined {
  return llmPresets.find((p) => p.name === name);
}
