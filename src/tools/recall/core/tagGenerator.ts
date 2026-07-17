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

import { getPureModelId, getProfileId } from "../utils/recallUtils";
import type { TagGenerationConfig, TagWithWeight } from "../types";
import type { LlmProfile } from "@/types/llm-profiles";

/**
 * 简单的重试执行器（用于 LLM 请求）
 */
async function executeWithRetry<T>(
  task: () => Promise<T>,
  options: {
    requestSettings?: TagGenerationConfig["requestSettings"];
    label?: string;
  } = {}
): Promise<T> {
  const { requestSettings, label = "Task" } = options;
  const maxRetries = requestSettings?.maxRetries ?? 2;
  const retryInterval = requestSettings?.retryInterval ?? 3000;
  const timeout = requestSettings?.timeout ?? 60000;

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }

      return await Promise.race([
        task(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} 请求超时`)), timeout)
        ),
      ]);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
    }
  }

  throw lastError || new Error(`${label} 失败`);
}

/**
 * 为单个条目生成标签的底层逻辑
 */
export async function performGenerateTags(params: {
  content: string;
  config: TagGenerationConfig;
  profile: LlmProfile;
  sendRequest: (params: any) => Promise<any>;
}) {
  const { content, config, sendRequest } = params;
  const profileId = getProfileId(config.modelId);
  const modelId = getPureModelId(config.modelId);
  const prompt = config.prompt.replace("{content}", content);
  const requestSettings = config.requestSettings;

  const response = await executeWithRetry(
    () =>
      sendRequest({
        profileId,
        modelId,
        messages: [{ role: "user", content: prompt }],
        inspectorContext: {
          toolName: "recall",
          purpose: "tag-gen",
        },
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      }),
    {
      requestSettings,
      label: "标签生成",
    }
  );

  // 尝试解析 JSON 结果
  let newTags: TagWithWeight[] = [];
  try {
    // 提取 JSON 部分（防止模型返回 Markdown 代码块）
    const jsonStr =
      response.content.match(/\[[\s\S]*\]/)?.[0] || response.content;
    newTags = JSON.parse(jsonStr);
  } catch (e) {
    console.error("解析标签失败:", response.content);
    throw new Error("AI 返回格式不正确，请检查提示词配置");
  }

  if (!Array.isArray(newTags)) {
    throw new Error("AI 返回的不是有效的标签数组");
  }

  return newTags.filter((t) => t.name);
}

/**
 * 合并新生成的标签到现有标签中（去重）
 */
export function mergeTags(
  existingTags: TagWithWeight[],
  newTags: TagWithWeight[]
): TagWithWeight[] {
  const existingNames = new Set(existingTags.map((t) => t.name));
  const filteredNew = newTags.filter(
    (t) => t.name && !existingNames.has(t.name)
  );
  return [...existingTags, ...filteredNew];
}
