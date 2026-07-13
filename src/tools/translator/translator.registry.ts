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

import type { ToolConfig, ToolRegistry } from "@/services/types";
import { markRaw } from "vue";
import { Languages } from "lucide-vue-next";

export default class TranslatorRegistry implements ToolRegistry {
  public readonly id = "translator";
  public readonly runMode = "any";
  public readonly name = "翻译工作台";
  public readonly description = "基于多个 LLM 渠道并排对比翻译结果";
}

export const toolConfig: ToolConfig = {
  name: "翻译工作台",
  path: "/translator",
  runMode: "any",
  icon: markRaw(Languages),
  component: () => import("./Translator.vue"),
  description: "多预设，多渠道 LLM 并行翻译与结果对比",
  category: ["AI 工具", "文本处理"],
  version: "1.2.0",
};
