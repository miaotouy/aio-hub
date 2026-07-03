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

import type {
  TranslatorLanguageCode,
  TranslatorLanguageOption,
} from "../types";

/**
 * 内置语言库（约 30 种 + meta）。
 * value 字段用 LLM 友好的英文名/标准名，直接作为 prompt 占位符替换。
 */
export const BUILTIN_TRANSLATOR_LANGUAGES: TranslatorLanguageOption[] = [
  // 元
  { label: "自动检测", value: "auto", group: "meta" },

  // 中文圈
  { label: "简体中文", value: "Chinese (Simplified)", group: "cjk" },
  { label: "繁体中文", value: "Chinese (Traditional)", group: "cjk" },
  { label: "粤语", value: "Cantonese", group: "cjk" },
  { label: "文言文", value: "Classical Chinese", group: "cjk" },

  // CJK
  { label: "日文", value: "Japanese", group: "cjk" },
  { label: "韩文", value: "Korean", group: "cjk" },

  // 欧洲
  { label: "英文", value: "English", group: "europe" },
  { label: "法文", value: "French", group: "europe" },
  { label: "德文", value: "German", group: "europe" },
  { label: "西班牙文", value: "Spanish", group: "europe" },
  { label: "葡萄牙文", value: "Portuguese", group: "europe" },
  { label: "意大利文", value: "Italian", group: "europe" },
  { label: "俄文", value: "Russian", group: "europe" },
  { label: "乌克兰文", value: "Ukrainian", group: "europe" },
  { label: "波兰文", value: "Polish", group: "europe" },
  { label: "荷兰文", value: "Dutch", group: "europe" },
  { label: "瑞典文", value: "Swedish", group: "europe" },
  { label: "土耳其文", value: "Turkish", group: "europe" },
  { label: "希腊文", value: "Greek", group: "europe" },

  // 中东
  { label: "阿拉伯文", value: "Arabic", group: "mideast" },
  { label: "希伯来文", value: "Hebrew", group: "mideast" },
  { label: "波斯文", value: "Persian", group: "mideast" },

  // 南亚 / 东南亚
  { label: "印地文", value: "Hindi", group: "south-asia" },
  { label: "越南文", value: "Vietnamese", group: "south-asia" },
  { label: "泰文", value: "Thai", group: "south-asia" },
  { label: "印尼文", value: "Indonesian", group: "south-asia" },
  { label: "马来文", value: "Malay", group: "south-asia" },
];

/** 分组中文名（用于下拉 OptionGroup 的 label） */
export const TRANSLATOR_LANGUAGE_GROUP_LABELS: Record<string, string> = {
  meta: "自动",
  cjk: "中日韩",
  europe: "欧洲语言",
  mideast: "中东语言",
  "south-asia": "南亚 / 东南亚",
  custom: "我的语言",
};

/**
 * 按 code 取展示 label。
 * - 优先在内置库查找；
 * - 然后在用户自定义列表（直接以 code 为 label）；
 * - 最后回退到 code 本身。
 */
export function getLanguageLabel(
  code: TranslatorLanguageCode,
  customLanguages: string[] = []
): string {
  const builtin = BUILTIN_TRANSLATOR_LANGUAGES.find(
    (item) => item.value === code
  );
  if (builtin) return builtin.label;
  if (customLanguages.includes(code as string)) return code as string;
  return code as string;
}

/**
 * 把内置库 + 用户自定义合并成完整的下拉数据，按 group 分桶并保持声明顺序。
 * - 内置项保留原顺序；
 * - 自定义项作为独立 "custom" 分组，仅在非空时出现。
 */
export function buildLanguageGroups(
  customLanguages: string[] = []
): { group: string; options: TranslatorLanguageOption[] }[] {
  const groupOrder: string[] = [
    "meta",
    "cjk",
    "europe",
    "mideast",
    "south-asia",
  ];
  const map = new Map<string, TranslatorLanguageOption[]>();
  for (const key of groupOrder) {
    map.set(key, []);
  }
  for (const item of BUILTIN_TRANSLATOR_LANGUAGES) {
    const key = item.group || "meta";
    if (!map.has(key)) {
      map.set(key, []);
      groupOrder.push(key);
    }
    map.get(key)!.push(item);
  }

  const groups = groupOrder
    .map((g) => ({ group: g, options: map.get(g) ?? [] }))
    .filter((entry) => entry.options.length > 0);

  if (customLanguages.length > 0) {
    groups.push({
      group: "custom",
      options: customLanguages.map((name) => ({
        label: name,
        value: name as TranslatorLanguageCode,
        group: "custom" as const,
      })),
    });
  }

  return groups;
}
