import type { ToolRegistry, ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { Setting } from "@element-plus/icons-vue";
import { formatterCore } from "./logic/formatter";
import type { SupportedLanguage, FormatOptions, FormatResult } from "./types";

/**
 * CodeFormatter 注册器
 * 提供多语言代码格式化功能，基于 Prettier
 */
export default class CodeFormatterRegistry implements ToolRegistry {
  public readonly id = "code-formatter";
  public readonly name = "代码格式化工具";
  public readonly description = "提供多语言代码格式化功能，基于 Prettier";

  /**
   * 格式化代码
   */
  public async formatCode(
    code: string,
    language: SupportedLanguage,
    options: FormatOptions = {}
  ): Promise<FormatResult> {
    return formatterCore.formatCode(code, language, options);
  }

  /**
   * 检测代码语言
   */
  public detectLanguage(code: string): SupportedLanguage {
    return formatterCore.detectLanguage(code);
  }

  /**
   * 获取支持的语言列表
   */
  public getSupportedLanguages(): Array<{
    value: SupportedLanguage;
    label: string;
    group: string;
  }> {
    return formatterCore.getSupportedLanguages();
  }

  /**
   * 获取服务元数据
   */
  public getMetadata() {
    return {
      methods: [],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "代码格式化",
  path: "/code-formatter",
  icon: markRaw(Setting),
  component: () => import("./CodeFormatter.vue"),
  description: "格式化各种编程语言代码",
  category: "文本处理",
};
