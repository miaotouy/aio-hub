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

/** 语言代码由 Vite 扫描 public/tesseract-lang 生成，语言包沿用公共资源路径。 */
import availableLangCodes from "virtual:aiohub-tesseract-languages";

// 语言代码对应的显示名称
const langCodeToName: Record<string, string> = {
  chi_sim: "简体中文",
  chi_tra: "繁体中文",
  eng: "英文",
  jpn: "日文",
  kor: "韩文",
  rus: "俄语",
};

// 生成单语言和组合语言选项
const generateLanguageOptions = () => {
  const options: Array<{ id: string; name: string }> = [];
  const addedCodes = new Set<string>();

  // 优先添加常用的中英组合
  if (
    availableLangCodes.includes("chi_sim") &&
    availableLangCodes.includes("eng")
  ) {
    options.push({ id: "chi_sim+eng", name: "简体中文+英文" });
    addedCodes.add("chi_sim+eng");
  }
  if (
    availableLangCodes.includes("chi_tra") &&
    availableLangCodes.includes("eng")
  ) {
    options.push({ id: "chi_tra+eng", name: "繁体中文+英文" });
    addedCodes.add("chi_tra+eng");
  }

  // 添加所有可用的单语言选项
  for (const code of availableLangCodes) {
    if (langCodeToName[code]) {
      options.push({ id: code, name: langCodeToName[code] });
      addedCodes.add(code);
    }
  }

  return options;
};

/**
 * 获取动态生成的 Tesseract 语言包选项列表。
 * @returns 用于 UI 选择器的语言选项数组。
 */
export const getTesseractLanguageOptions = () => {
  return generateLanguageOptions();
};
