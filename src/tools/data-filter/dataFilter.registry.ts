import type { ToolRegistry, ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { Filter } from "@element-plus/icons-vue";
import * as logic from "./logic/dataFilter.logic";

export default class DataFilterRegistry implements ToolRegistry {
  public readonly id = "data-filter";
  public readonly name = "数据筛选工具";
  public readonly description =
    "针对 JSON/YAML 列表数据进行条件筛选，支持简单匹配和自定义脚本，轻松剔除无关配置。";

  /**
   * Agent 专用：对文件中的 JSON/YAML 数据进行过滤
   * @param args 参数对象，包含 path, dataPath, conditions, keepUnmatched
   */
  public async applyFilter(args: Record<string, string>): Promise<logic.FilterResult> {
    // 委托给 logic 层的完整流程函数
    return await logic.applyFilterFromFile(args);
  }

  public getMetadata() {
    return {
      methods: [
        {
          name: "applyFilter",
          displayName: "数据筛选",
          agentCallable: true,
          description:
            "对文件中的 JSON/YAML 数组数据进行过滤。conditions 参数应为 JSON 字符串格式的数组。",
          parameters: [
            {
              name: "path",
              type: "string",
              description: "数据文件路径 (JSON 或 YAML)",
              required: true,
            },
            {
              name: "dataPath",
              type: "string",
              description: '目标数组在对象中的路径 (例如 "data.items")，如果文件本身就是数组则留空',
              required: false,
            },
            {
              name: "conditions",
              type: "string",
              description:
                '过滤条件列表的 JSON 字符串。每个条件包含: key (属性路径), operator (eq, ne, contains, truthy, falsy, custom), value (匹配值), customScript (自定义脚本，仅在 operator 为 custom 时使用)。示例: [{"key": "name", "operator": "contains", "value": "test"}]',
              required: false,
            },
            {
              name: "keepUnmatched",
              type: "string",
              description: "是否保留不匹配的项，传入 'true' 或 'false' (默认 'false')",
              required: false,
            },
          ],
          returnType: "object",
        },
      ],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "数据筛选工具",
  path: "/data-filter",
  icon: markRaw(Filter),
  component: () => import("./DataFilter.vue"),
  description: "针对 JSON/YAML 列表数据进行条件筛选，支持简单匹配和自定义脚本",
  category: "文本处理",
};
