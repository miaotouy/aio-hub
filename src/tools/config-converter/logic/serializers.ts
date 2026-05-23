import yaml from "js-yaml";
import * as toml from "smol-toml";
import * as ini from "ini";
import { XMLBuilder } from "fast-xml-parser";
import type { ConfigFormat, ConvertOptions } from "../types";

/**
 * 递归展平嵌套对象，用于 .env 和 INI 等扁平格式
 * @param obj 原始对象
 * @param prefix 键名前缀
 * @param delimiter 连接符，例如 "_" 或 "."
 * @param warnings 警告收集器
 */
export function flattenObject(
  obj: Record<string, any>,
  prefix = "",
  delimiter = "_",
  warnings: string[] = [],
): Record<string, any> {
  const flattened: Record<string, any> = {};

  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}${delimiter}${key}` : key;

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      warnings.push(`检测到嵌套对象 "${newKey}"，已自动展平为扁平键值对。`);
      Object.assign(flattened, flattenObject(value, newKey, delimiter, warnings));
    } else if (Array.isArray(value)) {
      warnings.push(`检测到数组 "${newKey}"，已转换为逗号分隔的字符串。`);
      flattened[newKey] = value.join(",");
    } else {
      flattened[newKey] = value;
    }
  }

  return flattened;
}

/**
 * 序列化对象为 .env 格式
 */
export function serializeEnv(obj: Record<string, any>, warnings: string[] = []): string {
  // .env 必须是扁平的，所以先展平
  const flatObj = flattenObject(obj, "", "_", warnings);
  let output = "";

  for (const key of Object.keys(flatObj)) {
    const value = flatObj[key];
    // 键名规范化：大写，去除非法字符
    const safeKey = key.toUpperCase().replace(/[^A-Z0-9_.-]/g, "_");

    let safeValue = String(value);
    // 如果值包含空格、换行或特殊字符，用双引号包裹并转义
    if (/[\s"'\\]/.test(safeValue)) {
      safeValue = `"${safeValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
    }

    output += `${safeKey}=${safeValue}\n`;
  }

  return output;
}

/**
 * 序列化对象为 INI 格式
 */
export function serializeIni(obj: Record<string, any>, options: ConvertOptions = {}, warnings: string[] = []): string {
  const delimiter = options.iniDelimiter || ".";
  const processedObj: Record<string, any> = {};

  // INI 只支持两层（Section -> Key -> Value）
  // 我们遍历第一层，如果第一层的值是对象，我们允许它作为 Section；
  // 如果第一层的值是更深层的嵌套对象，我们需要将其展平。
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // 检查第二层是否还有嵌套
      const hasDeepNest = Object.values(value).some((v) => v !== null && typeof v === "object" && !Array.isArray(v));
      if (hasDeepNest) {
        warnings.push(`INI 格式不支持多层嵌套，Section "${key}" 内部的深层对象已被展平。`);
        processedObj[key] = flattenObject(value, "", delimiter, warnings);
      } else {
        processedObj[key] = value;
      }
    } else if (Array.isArray(value)) {
      warnings.push(`检测到顶层数组 "${key}"，已转换为逗号分隔的字符串。`);
      processedObj[key] = value.join(",");
    } else {
      // 顶层扁平键值对，在 INI 中通常放在无 Section 的最顶部，或者默认 Section
      processedObj[key] = value;
    }
  }

  return ini.stringify(processedObj);
}

/**
 * 序列化对象为 XML 格式
 */
export function serializeXml(obj: Record<string, any>, options: ConvertOptions = {}): string {
  const rootName = options.xmlRootName || "root";
  const format = options.xmlFormat !== false;

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    format,
    indentBy: "  ",
  });

  // XML 必须有一个唯一的根节点
  const xmlData = {
    [rootName]: obj,
  };

  return `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(xmlData)}`;
}

/**
 * 统一序列化入口
 */
export function serializeConfig(
  obj: Record<string, any>,
  format: ConfigFormat,
  options: ConvertOptions = {},
  warnings: string[] = [],
): string {
  switch (format) {
    case "json": {
      const indent = options.jsonIndent ?? 2;
      return JSON.stringify(obj, null, indent);
    }
    case "yaml": {
      const indent = options.yamlIndent ?? 2;
      return yaml.dump(obj, {
        indent,
        lineWidth: -1, // 禁用折行
        noRefs: true, // 禁用引用锚点
      });
    }
    case "toml":
      return toml.stringify(obj);
    case "ini":
      return serializeIni(obj, options, warnings);
    case "xml":
      return serializeXml(obj, options);
    case "env":
      return serializeEnv(obj, warnings);
    default:
      throw new Error(`不支持的序列化格式: ${format}`);
  }
}
