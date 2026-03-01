import { get, filter, isArray, isObject } from "lodash-es";
import { readTextFile } from "@tauri-apps/plugin-fs";
import yaml from "js-yaml";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("tools/data-filter/logic");
const errorHandler = createModuleErrorHandler("tools/data-filter/logic");

export interface FilterCondition {
  key: string;
  operator: "eq" | "ne" | "contains" | "truthy" | "falsy" | "gt" | "ge" | "lt" | "le" | "custom";
  value?: any;
  customScript?: string;
}

export interface FilterOptions {
  dataPath?: string; // 如果 JSON 是个大对象，数组在某个属性里，比如 "data.items"
  conditions: FilterCondition[];
  keepUnmatched?: boolean; // 是否保留不匹配的（通常是剔除，所以默认 false）
}

export interface FilterResult {
  data: any;
  total: number;
  filtered: number;
  error?: string;
}

/**
 * 执行过滤逻辑
 */
export function applyFilter(input: any, options: FilterOptions): FilterResult {
  try {
    let target = input;

    // 1. 定位目标数组
    if (options.dataPath) {
      logger.debug("使用 dataPath 定位目标数组", { dataPath: options.dataPath });
      target = get(input, options.dataPath);
    }

    if (!isArray(target)) {
      if (isObject(target)) {
        // 如果不是数组但是对象，尝试自动找数组字段（可选增强）
        return { data: target, total: 0, filtered: 0, error: "目标路径不是一个数组" };
      }
      return { data: target, total: 0, filtered: 0, error: "输入数据不是数组" };
    }

    const total = target.length;

    // 2. 执行过滤
    const filteredData = filter(target, (item) => {
      return options.conditions.every((cond) => {
        const itemValue = get(item, cond.key);

        switch (cond.operator) {
          case "eq":
            return itemValue === cond.value;
          case "ne":
            return itemValue !== cond.value;
          case "contains":
            return String(itemValue).includes(String(cond.value));
          case "truthy":
            return !!itemValue;
          case "falsy":
            return !itemValue;
          case "gt":
            return Number(itemValue) > Number(cond.value);
          case "ge":
            return Number(itemValue) >= Number(cond.value);
          case "lt":
            return Number(itemValue) < Number(cond.value);
          case "le":
            return Number(itemValue) <= Number(cond.value);
          case "custom":
            if (!cond.customScript) return true;
            try {
              const fn = new Function("item", "value", `return ${cond.customScript}`);
              return fn(item, cond.value);
            } catch (e) {
              errorHandler.handle(e, {
                userMessage: "自定义脚本执行失败",
                showToUser: false,
                context: { customScript: cond.customScript },
              });
              return true;
            }
          default:
            return true;
        }
      });
    });

    logger.info("过滤完成", { total, filtered: filteredData.length });
    return {
      data: filteredData,
      total,
      filtered: filteredData.length,
    };
  } catch (err: any) {
    return {
      data: input,
      total: 0,
      filtered: 0,
      error: err.message || "过滤执行失败",
    };
  }
}

/**
 * 从参数字典解析过滤选项
 */
export function parseFilterOptions(args: Record<string, string>): {
  dataPath?: string;
  conditions: FilterCondition[];
  keepUnmatched: boolean;
  error?: string;
} {
  const dataPath = args.dataPath;
  const conditionsStr = args.conditions;
  const keepUnmatchedStr = args.keepUnmatched;

  // 解析 conditions（JSON 字符串）
  let conditions: FilterCondition[] = [];
  if (conditionsStr) {
    try {
      conditions = JSON.parse(conditionsStr);
    } catch (e) {
      return {
        dataPath,
        conditions: [],
        keepUnmatched: false,
        error: `conditions 参数格式错误，应为 JSON 数组: ${(e as Error).message}`,
      };
    }
  }

  const keepUnmatched = keepUnmatchedStr === "true";

  return {
    dataPath,
    conditions,
    keepUnmatched,
  };
}

/**
 * 加载并解析文件（JSON 或 YAML）
 */
export async function loadDataFile(path: string): Promise<{ data: any; error?: string }> {
  try {
    logger.debug("开始加载数据文件", { path });
    const content = await readTextFile(path);
    let data: any;

    if (path.endsWith(".yaml") || path.endsWith(".yml")) {
      data = yaml.load(content);
    } else {
      try {
        data = JSON.parse(content);
      } catch (e) {
        // 如果 JSON 解析失败，尝试作为 YAML 解析（有些文件没后缀或者是 YAML）
        data = yaml.load(content);
      }
    }

    return { data };
  } catch (error: any) {
    return {
      data: null,
      error: `读取或解析文件失败: ${error.message}`,
    };
  }
}

/**
 * Agent 专用：从文件路径和参数字典执行完整过滤流程
 */
export async function applyFilterFromFile(args: Record<string, string>): Promise<FilterResult> {
  const path = args.path;
  if (!path) {
    return {
      data: null,
      total: 0,
      filtered: 0,
      error: "缺少必要参数：path",
    };
  }

  // 1. 加载文件
  const { data, error: loadError } = await loadDataFile(path);
  if (loadError) {
    return {
      data: null,
      total: 0,
      filtered: 0,
      error: loadError,
    };
  }

  // 2. 解析过滤选项
  const options = parseFilterOptions(args);
  if (options.error) {
    return {
      data: null,
      total: 0,
      filtered: 0,
      error: options.error,
    };
  }

  // 3. 执行过滤
  return applyFilter(data, {
    dataPath: options.dataPath,
    conditions: options.conditions,
    keepUnmatched: options.keepUnmatched,
  });
}
/**
 * 格式化过滤结果为文本（Agent 专用）
 */
export function formatFilterResult(result: FilterResult): string {
  if (result.error) {
    return `❌ 过滤失败：${result.error}`;
  }

  const lines: string[] = [];
  lines.push("## 数据筛选结果");
  lines.push("");
  lines.push(`- **总条数**: ${result.total}`);
  lines.push(`- **筛选后条数**: ${result.filtered}`);
  lines.push(`- **剔除条数**: ${result.total - result.filtered}`);
  lines.push("");

  if (result.filtered > 0) {
    lines.push("### 筛选结果数据 (JSON)");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(result.data, null, 2));
    lines.push("```");
  } else {
    lines.push("*没有匹配的数据。*");
  }

  return lines.join("\n");
}
