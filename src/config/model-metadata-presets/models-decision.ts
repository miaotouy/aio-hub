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
 * 决策模型（System One）规则 (优先级 30+)
 *
 * TypeSafe 官方 Jev 的服务商与模型规则见 providers.ts（provider-typesafe /
 * model-prefix-jev）。本文件补充 Jev 版本、渠道差异与开源决策模型规则。
 * 决策模型统一标记 capabilities.decision；Jev Router 使用独立的聊天模型规则。
 */
import type { LegacyModelMetadataRule } from "@aiohub/model-metadata-core";

import type { ModelMetadataProperties } from "../../types/model-metadata";

export const decisionModelRules: LegacyModelMetadataRule<ModelMetadataProperties>[] =
  [
    {
      id: "model-jev-router",
      matchType: "model",
      matchValue: "(?:^|/)jev-router$",
      useRegex: true,
      properties: {
        icon: "/model-icons/typesafe.png",
        group: "Jev Router",
        capabilities: { decision: false, vision: true, toolUse: true },
        contextLength: 1000000,
        description:
          "Jev Router 为每个请求选择模型与推理强度，平衡质量、速度和成本，返回聊天内容",
      },
      priority: 35,
      enabled: true,
      description: "Jev Router 聊天路由模型",
    },

    // Jev images are experimental on 1.13/1.14; Box requires 1.14.
    {
      id: "model-jev-image-input",
      matchType: "model",
      matchValue:
        "(?:^|/)jev-(?:1\\.(?:13|14)(?:\\.0)?(?:-\\d{8})?|latest|preview)$",
      useRegex: true,
      properties: {
        capabilities: { vision: true, maxImageDimension: 1568 },
      },
      priority: 30,
      enabled: true,
      description: "Jev 1.13 / 1.14 实验性图片输入",
    },
    {
      id: "model-jev-1-14",
      matchType: "model",
      matchValue: "(?:^|/)jev-(?:1\\.14(?:\\.0)?(?:-\\d{8})?|preview)$",
      useRegex: true,
      properties: {
        releaseDate: "2026-10-14",
        description:
          "Jev 1.14：TypeSafe System One 决策模型，支持 Choice、Score、Noul 与实验性图片输入、Box 定位；官方默认每请求 64K、每问题 32K，可通过请求头启用 262K 长上下文",
      },
      priority: 35,
      enabled: true,
      description: "Jev 1.14 版本元数据",
    },
    {
      id: "model-openrouter-jev-1-14",
      matchType: "model",
      matchValue: "^typesafe/jev-1\\.14(?:-\\d{8})?$",
      useRegex: true,
      properties: {
        contextLength: 262144,
        pricing: {
          input: 0.042,
          output: 0,
          unit: "USD",
          note: "OpenRouter 公布 262K 上下文；按输入 token 计费，输出免费",
        },
        description:
          "通过 OpenRouter System One API 访问 Jev 1.14，262K 上下文，支持结构化决策与实验性图片输入、Box 定位",
      },
      priority: 40,
      enabled: true,
      description: "OpenRouter Jev 1.14 上下文与计费",
    },

    // === Kev 系列（基于 Qwen3 的开源决策模型家族） ===
    {
      id: "model-kev-decision",
      matchType: "model",
      matchValue: "(?:^|/)kev-\\d+(?:\\.\\d+)?b(?:[-:.][\\w.-]+)?$",
      useRegex: true,
      properties: {
        group: "Kev",
        capabilities: { decision: true },
        description:
          "Kev 开源决策模型（基于 Qwen3 的 LoRA + pointer head，输出结构化决策；含 0.6B / 4B / 8B / 9B 规模）",
      },
      priority: 36,
      enabled: true,
      description: "模型正则 Kev 决策模型元数据规则",
    },

    // === Laya 系列（编码器风格的本地决策模型） ===
    {
      id: "model-laya-decision",
      matchType: "modelPrefix",
      matchValue: "laya-",
      properties: {
        group: "Laya",
        capabilities: { decision: true },
        description: "Laya 开源决策模型家族（编码器风格，面向本地类型化决策）",
      },
      priority: 36,
      enabled: true,
      description: "模型前缀 laya- 决策模型元数据规则",
    },

    // === OpenJev / mini-jev（读取 option logits 的轻量复现） ===
    {
      id: "model-openjev-decision",
      matchType: "model",
      matchValue: "(?:^|/)(?:openjev|mini-jev|little-jev)(?:[-:.][\\w.-]+)?$",
      useRegex: true,
      properties: {
        group: "OpenJev",
        capabilities: { decision: true },
        description:
          "OpenJev / mini-jev：在开源 LLM 上直接读取 option logits，复现 Jev 风格的结构化决策接口",
      },
      priority: 36,
      enabled: true,
      description: "模型正则 OpenJev / mini-jev 决策模型元数据规则",
    },

    // === SemIf ===
    {
      id: "model-semif-decision",
      matchType: "modelPrefix",
      matchValue: "semif",
      properties: {
        group: "OpenJev",
        capabilities: { decision: true },
        description: "SemIf：轻量级 Jev 风格结构化决策实现",
      },
      priority: 36,
      enabled: true,
      description: "模型前缀 semif 决策模型元数据规则",
    },

    // === Julia 1 (Supersonic Labs) ===
    {
      id: "model-julia-decision",
      matchType: "model",
      matchValue: "(?:^|/)(?:supersonic/)?julia-?1(?:[-:.][\\w.-]+)?$",
      useRegex: true,
      properties: {
        group: "Supersonic Labs",
        capabilities: { decision: true },
        description:
          "Supersonic Labs Julia 1 超轻量决策模型（约 1.44 亿参数，可在 CPU 上运行）",
      },
      priority: 36,
      enabled: true,
      description: "模型正则 Julia 1 决策模型元数据规则",
    },
  ];
