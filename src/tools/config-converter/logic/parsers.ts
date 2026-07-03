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

import yaml from "js-yaml";
import * as toml from "smol-toml";
import * as ini from "ini";
import { XMLParser } from "fast-xml-parser";
import type { ConfigFormat } from "../types";

/**
 * 解析 .env 格式文本为扁平对象
 */
export function parseEnv(text: string): Record<string, any> {
  const result: Record<string, string> = {};
  const lines = text.split(/\r?\n/);

  for (let line of lines) {
    line = line.trim();
    // 忽略空行和注释
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";

      // 处理引号包裹的值
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/\\n/g, "\n");
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      } else {
        // 去除行尾注释，例如 KEY=VALUE # comment
        const commentIndex = value.indexOf("#");
        if (commentIndex !== -1) {
          value = value.substring(0, commentIndex).trim();
        }
      }
      result[key] = value;
    }
  }

  return result;
}

/**
 * 解析 XML 格式文本为对象
 */
export function parseXml(text: string): Record<string, any> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseAttributeValue: true,
    parseTagValue: true,
  });
  const parsed = parser.parse(text);

  // 如果 XML 只有一个根节点，通常我们希望保留根节点内部的内容，
  // 但为了通用性，我们直接返回解析后的完整对象。
  return parsed;
}

/**
 * 统一解析入口
 */
export function parseConfig(
  text: string,
  format: ConfigFormat
): Record<string, any> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }

  switch (format) {
    case "json":
      return JSON.parse(trimmed);
    case "yaml": {
      const parsed = yaml.load(trimmed);
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("YAML 内容必须解析为对象或数组");
      }
      return parsed as Record<string, any>;
    }
    case "toml":
      return toml.parse(trimmed);
    case "ini":
      return ini.parse(trimmed);
    case "xml":
      return parseXml(trimmed);
    case "env":
      return parseEnv(trimmed);
    default:
      throw new Error(`不支持的解析格式: ${format}`);
  }
}
