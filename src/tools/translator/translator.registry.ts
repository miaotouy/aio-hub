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
  description: "多渠道 LLM 并行翻译与结果对比",
  category: ["AI 工具", "文本处理"],
};
