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

import type { ConfigFormat } from "../types";
import { parseConfig } from "./parsers";

/**
 * 根据文件路径/文件名检测格式
 */
export function detectFormatByPath(filePath: string): ConfigFormat | "unknown" {
  const lowerPath = filePath.toLowerCase();

  if (lowerPath.endsWith(".json")) {
    return "json";
  }
  if (lowerPath.endsWith(".yaml") || lowerPath.endsWith(".yml")) {
    return "yaml";
  }
  if (lowerPath.endsWith(".toml")) {
    return "toml";
  }
  if (lowerPath.endsWith(".ini") || lowerPath.endsWith(".cfg")) {
    return "ini";
  }
  if (lowerPath.endsWith(".xml")) {
    return "xml";
  }
  if (
    lowerPath.endsWith(".env") ||
    lowerPath.includes(".env.") ||
    lowerPath.endsWith("properties")
  ) {
    return "env";
  }

  return "unknown";
}

/**
 * 根据内容嗅探格式
 */
export function sniffFormatByContent(
  content: string
): ConfigFormat | "unknown" {
  const trimmed = content.trim();
  if (!trimmed) {
    return "unknown";
  }

  // 1. 尝试 JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // 继续尝试其他格式
    }
  }

  // 2. 尝试 XML
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    if (trimmed.includes("<?xml") || trimmed.match(/<[a-zA-Z0-9_.-]+>/)) {
      return "xml";
    }
  }

  // 3. 尝试 TOML
  // TOML 键值对通常是 key = value，且支持 [section]
  if (trimmed.includes("=") && !trimmed.startsWith("<")) {
    // 检查是否有 [section] 且没有 XML 标签
    const hasTomlSection = /^\s*\[[a-zA-Z0-9_.-]+\]\s*$/m.test(trimmed);
    const hasTomlKeyValue = /^\s*[a-zA-Z0-9_.-]+\s*=\s*.*$/m.test(trimmed);
    if (hasTomlSection || hasTomlKeyValue) {
      try {
        parseConfig(trimmed, "toml");
        return "toml";
      } catch {
        // 继续
      }
    }
  }

  // 4. 尝试 INI
  if (trimmed.includes("=") && !trimmed.startsWith("<")) {
    const hasIniSection = /^\s*\[.+\]\s*$/m.test(trimmed);
    if (hasIniSection) {
      try {
        parseConfig(trimmed, "ini");
        return "ini";
      } catch {
        // 继续
      }
    }
  }

  // 5. 尝试 .env
  if (trimmed.includes("=") && !trimmed.startsWith("<")) {
    const hasEnvKeyValue = /^\s*[A-Z0-9_.-]+\s*=\s*.*$/m.test(trimmed);
    if (hasEnvKeyValue) {
      return "env";
    }
  }

  // 6. 尝试 YAML
  // YAML 键值对通常是 key: value
  if (trimmed.includes(":")) {
    const hasYamlKeyValue = /^\s*[a-zA-Z0-9_.-]+\s*:\s*.*$/m.test(trimmed);
    if (hasYamlKeyValue) {
      try {
        parseConfig(trimmed, "yaml");
        return "yaml";
      } catch {
        // 继续
      }
    }
  }

  return "unknown";
}

/**
 * 综合检测格式（优先路径，其次内容）
 */
export function detectFormat(filePath: string, content: string): ConfigFormat {
  const pathFormat = detectFormatByPath(filePath);
  if (pathFormat !== "unknown") {
    return pathFormat;
  }

  const contentFormat = sniffFormatByContent(content);
  if (contentFormat !== "unknown") {
    return contentFormat;
  }

  // 默认回退到 JSON
  return "json";
}
