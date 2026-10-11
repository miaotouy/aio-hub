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

import type { LlmParameters } from "@/tools/llm-chat/types";
import type {
  LlmModelInfo,
  LlmParameterSupport,
  ProviderType,
} from "@/types/llm-profiles";
import { getModelFamily } from "@/llm-apis/request-builder";
import { parameterConfigs } from "@/tools/llm-chat/config/parameter-config";

export const MODEL_PARAMETER_GROUPS = [
  "basic",
  "advanced",
  "safetySettings",
  "special",
  "custom",
] as const;
export const CONTEXT_PARAMETER_GROUPS = [
  "contextManagement",
  "contextCompression",
  "contextPostProcessing",
  "imageCompression",
] as const;
export type ModelParameterGroup =
  | (typeof MODEL_PARAMETER_GROUPS)[number]
  | (typeof CONTEXT_PARAMETER_GROUPS)[number];
export type ParameterEditorPresentation = "sidebar" | "settings";

export interface ParameterEditorContext {
  parameters: LlmParameters;
  supportedParameters: LlmParameterSupport;
  providerType?: ProviderType;
  modelId?: string;
  capabilities?: LlmModelInfo["capabilities"];
}

export const parameterGroupLabels: Record<ModelParameterGroup, string> = {
  basic: "基础参数",
  advanced: "高级参数",
  safetySettings: "Gemini 安全设置",
  special: "特殊功能",
  custom: "自定义参数",
  contextManagement: "上下文管理",
  contextCompression: "上下文压缩",
  contextPostProcessing: "上下文后处理",
  imageCompression: "图片压缩",
};

export function isEditorParameterVisible(
  key: keyof LlmParameters,
  context: ParameterEditorContext
): boolean {
  const config = parameterConfigs.find((item) => item.key === key);
  if (!config) return false;
  const {
    supportedParameters,
    capabilities,
    parameters,
    modelId,
    providerType,
  } = context;
  if (key === "includeThoughts") {
    return (
      supportedParameters.thinkingConfig === true ||
      (!!modelId &&
        getModelFamily(modelId, providerType) === "gemini" &&
        capabilities?.thinking === true)
    );
  }
  if (config.supportedKey === "thinking") {
    const thinkingType = capabilities?.thinkingConfigType ?? "none";
    if (key === "thinkingEnabled")
      return thinkingType === "switch" || thinkingType === "budget";
    if (key === "thinkingBudget")
      return thinkingType === "budget" && parameters.thinkingEnabled === true;
    if (key === "reasoningEffort") return thinkingType === "effort";
    return false;
  }
  return supportedParameters[config.supportedKey] === true;
}

export function isSafetySettingsVisible(
  context: ParameterEditorContext
): boolean {
  return (
    context.supportedParameters.safetySettings === true ||
    (!!context.modelId &&
      getModelFamily(context.modelId, context.providerType) === "gemini")
  );
}

export function getParameterSettingGroup(
  settingId: string
): ModelParameterGroup | undefined {
  const key = settingId.replace(/^parameters\./, "").split(".")[0];
  if (Object.prototype.hasOwnProperty.call(parameterGroupLabels, key))
    return key as ModelParameterGroup;
  return parameterConfigs.find((config) => config.key === key)?.group;
}

const parameterItems = parameterConfigs.map((config) => ({
  id: `parameters.${config.key}`,
  label: config.label,
  keywords: `${config.key} ${config.description}`,
  parameterKey: config.key,
}));

export const modelParameterSearchItems = [
  ...MODEL_PARAMETER_GROUPS.map((group) => ({
    id: `parameters.${group}`,
    label: parameterGroupLabels[group],
    keywords: `${group} ${group === "custom" ? "JSON 自定义 请求参数" : "模型 参数"}`,
  })),
  ...parameterItems,
];
export const contextParameterSearchItems = [
  ...CONTEXT_PARAMETER_GROUPS.map((group) => ({
    id: `parameters.${group}`,
    label: parameterGroupLabels[group],
    keywords:
      group === "contextCompression"
        ? "contextCompression summaryModel summaryPrompt continueSummaryPrompt triggerThreshold 保留消息 摘要模型 提示词 压缩阈值"
        : group === "contextPostProcessing"
          ? "contextPostProcessing rules 合并角色 system user 角色交替"
          : group === "imageCompression"
            ? "imageCompression maxWidth maxHeight format quality 图片 尺寸 格式 质量"
            : "contextManagement 历史 截断 限制",
  })),
  {
    id: "parameters.contextManagement.maxContextTokens",
    label: "最大上下文 Token 数",
    keywords: "maxContextTokens 上下文窗口 限制",
  },
  {
    id: "parameters.contextManagement.retainedCharacters",
    label: "截断保留字符数",
    keywords: "retainedCharacters 保留 字符 截断",
  },
];
