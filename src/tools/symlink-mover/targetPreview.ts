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

/** 仅计算预计路径；文件系统冲突、权限等仍由执行前预检确认。 */
export interface TargetPreview {
  targetPath?: string;
  issue?: string;
}

export function getTargetPreview(
  sourcePath: string,
  targetDirectory: string,
  baseSourceDir: string | undefined,
  windows: boolean
): TargetPreview {
  if (!targetDirectory) return { issue: "请选择目标目录" };
  if (baseSourceDir === "") return { issue: "请选择基准源目录" };

  const separator = windows ? /[\\/]+/ : /\/+/;
  const components = (path: string) =>
    path.split(separator).filter((part) => part && part !== ".");
  const isAbsolute = (path: string) =>
    windows
      ? /^(?:[a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+(?:[\\/]|$))/i.test(path)
      : path.startsWith("/");

  for (const [label, path] of [
    ["源路径", sourcePath],
    ["目标目录", targetDirectory],
    ...(baseSourceDir === undefined ? [] : [["基准源目录", baseSourceDir]]),
  ]) {
    if (!isAbsolute(path)) return { issue: label + "需填写绝对路径" };
    if (components(path).includes(".."))
      return { issue: label + "含有上级目录跳转，请使用完整路径" };
  }

  const source = components(sourcePath);
  const rootLength = windows ? (/^[a-z]:/i.test(sourcePath) ? 1 : 2) : 0;
  if (source.length <= rootLength) return { issue: "请选择具体文件或文件夹" };

  let relative = source.slice(-1);
  if (baseSourceDir !== undefined) {
    const base = components(baseSourceDir);
    if (base.some((part, index) => source[index] !== part))
      return { issue: "源路径超出基准源目录，请调整基准目录" };
    relative = source.slice(base.length);
  }

  const joiner = windows && targetDirectory.includes("\\") ? "\\" : "/";
  const target = targetDirectory.replace(windows ? /[\\/]+$/ : /\/+$/, "");
  return {
    targetPath: relative.length
      ? target + joiner + relative.join(joiner)
      : targetDirectory,
  };
}
