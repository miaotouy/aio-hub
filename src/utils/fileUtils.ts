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

/**
 * 清理文件名，移除 Windows/Linux/macOS 下的无效字符
 */
export const sanitizeFilename = (name: string): string => {
  // 替换所有非法字符为下划线，包括控制字符和一些特殊符号
  // Windows 非法字符: \ / : * ? " < > |
  return name
    .replace(/[\\/:*?"<>|\x00-\x1f\x80-\x9f]/g, "_")
    .replace(/\u3000/g, "_") // 替换全角空格
    .replace(/\.+$/g, "") // 移除末尾的点
    .replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i, "_$1") // 避开 Windows 保留文件名
    .trim();
};

/**
 * 格式化字节大小为人类可读格式
 */
export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};
