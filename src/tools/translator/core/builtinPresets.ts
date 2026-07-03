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

import type { LlmProfile } from "@/types/llm-profiles";
import type {
  TranslationChannel,
  TranslatorLanguageCode,
  TranslatorPreset,
} from "../types";

/**
 * 内置预设模板。
 *
 * 与 `TranslatorPreset` 的差别：
 * - 用稳定的 `templateId` 而非动态生成的 `id`，便于版本迁移与"导入到当前预设"识别；
 * - 不携带 `channels`，渠道由调用方根据当前可用的 LLM Profiles 动态填充；
 * - `defaultChannelCount` 用作首次自动填充时挑选模型数量的建议值。
 */
export interface BuiltinPresetTemplate {
  /** 稳定标识，与 TranslatorPreset.id 不冲突（运行时预设的 id 是 "preset-..." 前缀） */
  templateId: string;
  /** 展示名 */
  name: string;
  /** 简短描述，给用户在内置预设选择面板展示 */
  description: string;
  /** 图标 key，需与 PresetManagerDialog 中 PRESET_ICON_OPTIONS 的 key 对齐 */
  icon: string;
  /** 默认源语言 */
  defaultSourceLang: TranslatorLanguageCode;
  /** 默认目标语言 */
  defaultTargetLang: TranslatorLanguageCode;
  /** prompt 模板，支持 {text}/{sourceLang}/{targetLang} 占位符 */
  prompt: string;
  /** 自动填充渠道的建议数量（仅在首次初始化默认预设时使用） */
  defaultChannelCount: number;
}

// ---- 内置 Prompt 模板 ----

const DEFAULT_PROMPT =
  "Translate the following text from {sourceLang} to {targetLang}. Preserve meaning, tone, formatting, code blocks, numbers, and names. Output only the translation.\n\n{text}";

const ACADEMIC_PROMPT =
  "Translate the following academic or technical text from {sourceLang} to {targetLang}. Use precise terminology, keep citations and formulas unchanged, and output only the polished translation.\n\n{text}";

const CODE_PROMPT =
  "Translate comments, docstrings, and user-facing text from {sourceLang} to {targetLang}. Preserve code, identifiers, placeholders, markdown, and indentation exactly. Output only the translation.\n\n{text}";

const CODE_EXPLAIN_PROMPT =
  "Rewrite the following content as a natural-language description in {targetLang}. For any code, snippets, function definitions, configs, or technical syntax, do NOT keep them in their original form — instead, explain their purpose, control flow, key branches, side effects, and behavior step by step in fluent {targetLang} prose. For non-code text, translate it from {sourceLang} to {targetLang} faithfully. Keep identifier names, numbers, and key references inline for clarity. Output only the {targetLang} description.\n\n{text}";

const LITERARY_PROMPT =
  "Translate the following literary text from {sourceLang} to {targetLang}. Preserve the author's voice, rhythm, metaphors, and emotional nuance. Adapt idioms naturally rather than translating them literally. Output only the polished translation.\n\n{text}";

const BUSINESS_PROMPT =
  "Translate the following business or professional content from {sourceLang} to {targetLang}. Use formal, polite, and precise wording suitable for business communication. Preserve numbers, dates, names, and contractual terms exactly. Output only the translation.\n\n{text}";

const SUBTITLE_PROMPT =
  "Translate the following subtitle text from {sourceLang} to {targetLang}. Preserve line breaks and subtitle structure (timestamps, indices) exactly as in the source. Keep translated lines concise and reading-speed-friendly. Output only the translated subtitle.\n\n{text}";

const COLLOQUIAL_PROMPT =
  "Translate the following text from {sourceLang} to {targetLang} in a casual, colloquial tone. Use natural everyday expressions, contractions, and slang where appropriate to the target audience. Output only the translation.\n\n{text}";

// ---- 内置预设清单 ----

/**
 * 系统内置预设模板。
 * 顺序即 UI 默认展示顺序；新增模板请在末尾追加，避免影响历史用户已选择的位置感知。
 */
export const BUILTIN_PRESET_TEMPLATES: BuiltinPresetTemplate[] = [
  {
    templateId: "quick",
    name: "快速查词",
    description: "通用翻译，保留语气与格式",
    icon: "Languages",
    defaultSourceLang: "auto",
    defaultTargetLang: "Chinese (Simplified)",
    prompt: DEFAULT_PROMPT,
    defaultChannelCount: 2,
  },
  {
    templateId: "academic",
    name: "学术精翻",
    description: "学术/技术文本，术语精准、保留引用与公式",
    icon: "BookOpen",
    defaultSourceLang: "auto",
    defaultTargetLang: "Chinese (Simplified)",
    prompt: ACADEMIC_PROMPT,
    defaultChannelCount: 3,
  },
  {
    templateId: "code-comments",
    name: "代码注释",
    description: "只翻译注释、文档串与界面文案，代码原样保留",
    icon: "Code2",
    defaultSourceLang: "auto",
    defaultTargetLang: "Chinese (Simplified)",
    prompt: CODE_PROMPT,
    defaultChannelCount: 2,
  },
  {
    templateId: "code-explain",
    name: "代码释义",
    description: "把代码 + 文本改写为自然语言讲解",
    icon: "ScrollText",
    defaultSourceLang: "auto",
    defaultTargetLang: "Chinese (Simplified)",
    prompt: CODE_EXPLAIN_PROMPT,
    defaultChannelCount: 2,
  },
  {
    templateId: "literary",
    name: "文学润色",
    description: "保留作者语气、比喻与情绪的文学翻译",
    icon: "Pen",
    defaultSourceLang: "auto",
    defaultTargetLang: "Chinese (Simplified)",
    prompt: LITERARY_PROMPT,
    defaultChannelCount: 2,
  },
  {
    templateId: "business",
    name: "商务正式",
    description: "正式、礼貌的商务语气，保留合同/数据原貌",
    icon: "Briefcase",
    defaultSourceLang: "auto",
    defaultTargetLang: "English",
    prompt: BUSINESS_PROMPT,
    defaultChannelCount: 2,
  },
  {
    templateId: "subtitle",
    name: "字幕翻译",
    description: "保留时间轴/序号结构，译文精炼适合阅读",
    icon: "FileText",
    defaultSourceLang: "auto",
    defaultTargetLang: "Chinese (Simplified)",
    prompt: SUBTITLE_PROMPT,
    defaultChannelCount: 2,
  },
  {
    templateId: "colloquial",
    name: "口语化",
    description: "自然口语风格，使用日常表达与缩写",
    icon: "MessageSquare",
    defaultSourceLang: "auto",
    defaultTargetLang: "Chinese (Simplified)",
    prompt: COLLOQUIAL_PROMPT,
    defaultChannelCount: 2,
  },
];

/** 通过 templateId 查找模板 */
export function findBuiltinTemplate(
  templateId: string
): BuiltinPresetTemplate | undefined {
  return BUILTIN_PRESET_TEMPLATES.find(
    (item) => item.templateId === templateId
  );
}

// ---- 渠道挑选辅助 ----

/**
 * 在所有已启用的 profiles 中挑选前 N 个 *文本类* 模型。
 * 过滤掉嵌入/重排/媒体生成模型。
 */
export function pickFirstTextModels(profiles: LlmProfile[], count: number) {
  return profiles
    .flatMap((profile) =>
      profile.models
        .filter((model) => {
          const caps = model.capabilities;
          return (
            !caps?.embedding &&
            !caps?.rerank &&
            !caps?.imageGeneration &&
            !caps?.videoGeneration &&
            !caps?.audioGeneration &&
            !caps?.musicGeneration
          );
        })
        .map((model) => ({ profile, model }))
    )
    .slice(0, count);
}

const createChannelId = () =>
  `translator-channel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** 用 profile + model 生成一个新的 TranslationChannel（带新 id） */
export function createChannelFromModel(
  profile: LlmProfile,
  model: LlmProfile["models"][number],
  index: number
): TranslationChannel {
  return {
    id: createChannelId(),
    displayName: model.name || model.id || `渠道 ${index + 1}`,
    profileId: profile.id,
    modelId: model.id,
  };
}

// ---- 工厂方法 ----

/**
 * 把内置模板"应用到一个已存在预设"，仅替换文案/语言/图标，**保留 id 和现有渠道**。
 *
 * 这是 PresetManagerDialog 中"从内置预设导入"按钮的核心行为：
 * 用户对当前预设的语言/prompt/图标/名称做替换，但已经配好的渠道列表不动，
 * 避免破坏用户的模型选择。
 *
 * @returns 一个新对象（不可变更新），调用方负责写回 presets 数组。
 */
export function applyTemplateToPreset(
  preset: TranslatorPreset,
  template: BuiltinPresetTemplate
): TranslatorPreset {
  return {
    ...preset,
    name: template.name,
    icon: template.icon,
    defaultSourceLang: template.defaultSourceLang,
    defaultTargetLang: template.defaultTargetLang,
    prompt: template.prompt,
    // channels 保留
  };
}

// ---- 默认预设（用于首次初始化 / 用户清空后重置） ----

/**
 * 内置默认预设集合（首次加载或用户没有任何预设时使用）。
 * 取 BUILTIN_PRESET_TEMPLATES 的前 4 个，确保和重构前保持一致的行为。
 *
 * 注意：使用稳定的 templateId 作为预设 id，便于历史数据迁移识别。
 */
export function buildInitialDefaultPresets(
  profiles: LlmProfile[]
): TranslatorPreset[] {
  const initialTemplates = BUILTIN_PRESET_TEMPLATES.slice(0, 4);
  return initialTemplates.map((template) => {
    const candidates = pickFirstTextModels(
      profiles,
      template.defaultChannelCount
    );
    const channels = candidates.map(({ profile, model }, index) =>
      createChannelFromModel(profile, model, index)
    );
    return {
      id: template.templateId, // 使用稳定 id，与重构前一致
      name: template.name,
      icon: template.icon,
      channels,
      defaultSourceLang: template.defaultSourceLang,
      defaultTargetLang: template.defaultTargetLang,
      prompt: template.prompt,
    };
  });
}
