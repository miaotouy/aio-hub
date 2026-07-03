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
 * 模型匹配工具函数
 *
 * 从 injection-assembler 中提取的 modelMatch 匹配逻辑，
 * 供 displayPresetCount 过滤和上下文装配共同复用。
 */

import { getPureModelId } from "@/utils/modelIdUtils";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/modelMatchUtils");

/**
 * 模型匹配上下文
 */
export interface ModelMatchContext {
  /** 当前模型 ID（可能包含 profile 前缀） */
  modelId?: string;
  /** 模型显示名称 */
  modelName?: string;
  /** 渠道名称 */
  profileName?: string;
}

/**
 * 消息的 modelMatch 配置
 */
export interface ModelMatchConfig {
  enabled: boolean;
  mode?: "any" | "all";
  exclude?: boolean;
  patterns: string[];
  profilePatterns?: string[];
  matchProfileName?: boolean;
}

/**
 * 判断消息的 modelMatch 规则是否匹配当前模型/渠道
 *
 * @returns true 表示消息应该生效（显示/注入），false 表示不应生效
 */
export function isModelMatchSatisfied(
  modelMatch: ModelMatchConfig,
  context: ModelMatchContext
): boolean {
  const {
    patterns = [],
    profilePatterns = [],
    mode = "any",
    exclude = false,
    matchProfileName = false,
  } = modelMatch;

  // 1. 检查模型是否匹配
  const modelIsMatched =
    patterns.length === 0 ||
    patterns.some((pattern) => {
      try {
        const regex = new RegExp(pattern, "i");
        // 匹配模型显示名称
        if (context.modelName && regex.test(context.modelName)) return true;
        // 匹配模型 ID
        const modelIdPart = context.modelId
          ? getPureModelId(context.modelId)
          : undefined;
        if (modelIdPart && regex.test(modelIdPart)) return true;
        // 匹配模型 ID 的最后一段
        if (modelIdPart) {
          const slashIndex = modelIdPart.lastIndexOf("/");
          if (slashIndex !== -1) {
            const pureModelNamePart = modelIdPart.substring(slashIndex + 1);
            if (pureModelNamePart && regex.test(pureModelNamePart)) return true;
          }
        }
        return false;
      } catch (e) {
        logger.warn(`模型匹配正则表达式无效: ${pattern}`, e);
        return false;
      }
    });

  // 2. 检查渠道是否匹配
  const profileIsMatched =
    (profilePatterns.length === 0 && !matchProfileName) ||
    [...profilePatterns, ...(matchProfileName ? patterns : [])].some(
      (pattern) => {
        try {
          const regex = new RegExp(pattern, "i");
          if (context.profileName && regex.test(context.profileName))
            return true;
          return false;
        } catch (e) {
          logger.warn(`渠道匹配正则表达式无效: ${pattern}`, e);
          return false;
        }
      }
    );

  // 3. 根据模式组合结果
  const rawMatch =
    mode === "all"
      ? modelIsMatched && profileIsMatched
      : modelIsMatched || profileIsMatched;

  // 排除模式：反转匹配结果
  return exclude ? !rawMatch : rawMatch;
}
