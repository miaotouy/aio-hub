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

/** 文件 URI 按自身路径形态转换，保留 POSIX 路径与文件名中的字面字符。 */
export function fileUriToPath(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== "file:") return null;
    const path = decodeURIComponent(url.pathname);
    if (url.hostname) return `\\\\${url.hostname}${path.replace(/\//g, "\\")}`;
    if (/^\/[a-z]:\//i.test(path)) return path.slice(1).replace(/\//g, "\\");
    return path;
  } catch {
    return null;
  }
}

/** 共享 H5 拖放解析入口，URI 列表优先，纯文本仅接受绝对路径或文件 URI。 */
export function parsePathsFromDataTransfer(
  dt: Pick<DataTransfer, "getData">
): string[] {
  const paths = dt
    .getData("text/uri-list")
    .split(/[\r\n]+/)
    .filter((line) => line && !line.startsWith("#"))
    .map(fileUriToPath)
    .filter((path): path is string => path !== null);
  if (paths.length) return [...new Set(paths)];
  return [
    ...new Set(
      dt
        .getData("text/plain")
        .split(/[\r\n]+/)
        .flatMap((line) => {
          const value = line.trim();
          const uriPath = fileUriToPath(value);
          if (uriPath !== null) return [uriPath];
          return /^(?:[a-z]:[\\/]|\/|\\\\)/i.test(value) ? [value] : [];
        })
    ),
  ];
}
