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
 * model-prefix-jev）。本文件覆盖 2026-09 之后社区出现的开源决策模型复现：
 * 它们不生成自然语言，而是返回结构化的 Choice / Score / Noul 结果，
 * 能力统一标记为 capabilities.decision。
 */
import type { LegacyModelMetadataRule } from "@aiohub/model-metadata-core";

import type { ModelMetadataProperties } from "../../types/model-metadata";

export const decisionModelRules: LegacyModelMetadataRule<ModelMetadataProperties>[] =
  [
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
