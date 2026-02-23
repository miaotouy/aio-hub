import type { ToolRegistry, ToolConfig } from "@/services/types";
import type { SettingItem } from "@/types/settings-renderer";
import { markRaw } from "vue";
import { Braces } from "lucide-vue-next";
import * as logic from "./logic/jsonFormatter.logic";

/**
 * JsonFormatter 注册器
 * 作为 JSON 格式化工具的对外门面，逻辑实现位于 jsonFormatter.logic.ts
 * Agent 专供：支持文件路径输入 + 扁平化参数
 */
export default class JsonFormatterRegistry implements ToolRegistry {
  public readonly id = "json-formatter";
  public readonly name = "JSON 格式化工具";
  public readonly description = "提供 JSON 解析、格式化和美化功能，支持文件路径输入和自定义展开层级";
  public readonly settingsSchema: SettingItem[] = [
    {
      id: "json-default-indent",
      label: "默认缩进空格数",
      component: "ElInputNumber",
      modelPath: "indentSize",
      hint: "格式化时的默认缩进空格数",
      keywords: "缩进 空格 默认",
      defaultValue: 2,
      props: {
        min: 1,
        max: 8,
        step: 1,
      },
    },
    {
      id: "json-default-expand",
      label: "默认展开层级",
      component: "ElInputNumber",
      modelPath: "expandDepth",
      hint: "格式化时的默认展开层级深度",
      keywords: "展开 层级 默认 深度",
      defaultValue: 3,
      props: {
        min: 1,
        max: 10,
        step: 1,
      },
    },
    {
      id: "json-sort-keys",
      label: "自动排序键名",
      component: "ElSwitch",
      modelPath: "sortKeys",
      hint: "格式化时是否按字母顺序排序对象的键名",
      keywords: "排序 键名 字母",
      defaultValue: false,
    },
  ];

  /**
   * Agent 专用：格式化 JSON 字符串或文件
   * @param args 扁平化参数对象，包含 text, filePath, expandDepth, indentSize
   */
  public async formatJson(args: Record<string, string>): Promise<logic.FormatResult> {
    return await logic.formatJsonAgent(args);
  }

  /**
   * 获取服务元数据
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: "formatJson",
          displayName: "JSON 格式化",
          agentCallable: true,
          description:
            "格式化 JSON 字符串或文件。支持通过 text 直接传入 JSON 文本，或通过 filePath 指定文件路径自动读取。两者至少提供一个，优先使用 filePath。",
          parameters: [
            {
              name: "text",
              type: "string",
              description: "要格式化的 JSON 字符串（与 filePath 二选一）",
              required: false,
            },
            {
              name: "filePath",
              type: "string",
              description: "要读取并格式化的 JSON 文件路径（与 text 二选一，优先使用）",
              required: false,
            },
            {
              name: "expandDepth",
              type: "number",
              description: "展开层级深度（1-10），默认 3",
              required: false,
              defaultValue: 3,
            },
            {
              name: "indentSize",
              type: "number",
              description: "每层缩进空格数，默认 2",
              required: false,
              defaultValue: 2,
            },
          ],
          returnType: "Promise<FormatResult>",
        },
      ],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "JSON 格式化",
  path: "/json-formatter",
  icon: markRaw(Braces),
  component: () => import("./JsonFormatter.vue"),
  description: "格式化和美化JSON数据",
  category: "文本处理",
};
