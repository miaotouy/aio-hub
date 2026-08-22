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
 * DeepSeek 系列模型前缀匹配规则
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const deepseekModelRules: ModelMetadataRule[] = [
  {
    id: "model-deepseek-v4-pro",
    matchType: "model",
    matchValue: "deepseek-v4-pro",
    properties: {
      icon: `/model-icons/deepseek-color.svg`,
      contextLength: 1024000,
      maxOutputTokens: 384000,
      pricing: {
        input: 9.0,
        output: 27.0,
        cacheHitInput: 0.3,
        unit: "CNY",
        note: "每百万 token；高峰时段价格，闲时为一半（北京时间 09:00-12:00、14:00-18:00 为高峰）",
      },
      version: "DeepSeek-V4-Pro-0813",
      description: "DeepSeek V4 Pro 正式版模型详情",
    },
    priority: 30,
    enabled: true,
    description: "模型 deepseek-v4-pro 元数据规则",
  },
  {
    id: "model-deepseek-v4-flash",
    matchType: "model",
    matchValue: "deepseek-v4-flash",
    properties: {
      icon: `/model-icons/deepseek-color.svg`,
      contextLength: 1024000,
      maxOutputTokens: 384000,
      pricing: {
        input: 3.0,
        output: 9.0,
        cacheHitInput: 0.1,
        unit: "CNY",
        note: "每百万 token；高峰时段价格，闲时为一半（北京时间 09:00-12:00、14:00-18:00 为高峰）",
      },
      version: "DeepSeek-V4-Flash-0731",
      description: "DeepSeek V4 Flash 模型详情",
    },
    priority: 30,
    enabled: true,
    description: "模型 deepseek-v4-flash 元数据规则",
  },
  {
    id: "model-deepseek-v4-flash-vision-exp",
    matchType: "model",
    matchValue: "deepseek-v4-flash-vision-exp",
    properties: {
      icon: `/model-icons/deepseek-color.svg`,
      contextLength: 1024000,
      maxOutputTokens: 384000,
      pricing: {
        input: 3.0,
        output: 9.0,
        cacheHitInput: 0.1,
        unit: "CNY",
        note: "每百万 token；高峰时段价格，闲时为一半（北京时间 09:00-12:00、14:00-18:00 为高峰）；图片按官方规则折算 token",
      },
      version: "DeepSeek-V4-Flash-Vision-Exp",
      capabilities: {
        vision: true,
        toolUse: true,
        thinking: true,
        thinkingConfigType: "switch",
        fim: false,
        prefixCompletion: true,
        jsonOutput: true,
      },
      description: "DeepSeek V4 Flash Vision 实验性多模态视觉理解模型详情",
    },
    priority: 30,
    enabled: true,
    description: "模型 deepseek-v4-flash-vision-exp 元数据规则",
  },
  {
    id: "model-deepseek-deprecated",
    matchType: "model",
    matchValue: "deepseek-chat|deepseek-reasoner",
    useRegex: true,
    properties: {
      icon: `/model-icons/deepseek-color.svg`,
      deprecated: true,
    },
    priority: 30,
    enabled: true,
    description: "标注已废弃的旧版 DeepSeek 模型名",
  },
  {
    id: "model-prefix-deepseek",
    matchType: "modelPrefix",
    matchValue: "deepseek-",
    properties: {
      icon: `/model-icons/deepseek-color.svg`,
      group: "DeepSeek",
      tokenizer: "deepseek_v3", // DeepSeek 系列使用专用分词器
      capabilities: {
        thinking: true,
        thinkingConfigType: "effort",
        reasoningEffortOptions: ["low", "high", "max"],
        fim: true, // DeepSeek 支持 FIM 补全（通过 /beta 端点）
        prefixCompletion: true, // DeepSeek 支持对话前缀续写（通过 /beta 端点）
        jsonOutput: true, // DeepSeek 支持 JSON 输出模式
        toolUse: true,
      },
      description: "DeepSeek 系列模型（支持推理、FIM、续写和 JSON 输出）",
    },
    priority: 25, // 提升优先级
    enabled: true,
    description: "模型前缀 deepseek- 元数据规则",
  },
];
