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
 * 资源加载失败占位中展示的资源标识：
 * 优先 alt，其次从 src 提取（去查询串后的）文件名，便于排查请求的是哪个资源。
 */
export function resolveResourceLabel(
  src: string | undefined,
  alt: string | undefined
): string {
  const trimmedAlt = (alt || "").trim();
  if (trimmedAlt) return trimmedAlt;

  const raw = (src || "").trim();
  if (!raw) return "未知资源";

  const withoutQuery = raw.split(/[?#]/)[0];
  const segments = withoutQuery.split(/[\\/]/).filter(Boolean);
  const name = segments[segments.length - 1];
  let label = raw;
  if (name) {
    try {
      label = decodeURIComponent(name);
    } catch {
      label = name;
    }
  }

  return label.length > 80 ? `${label.slice(0, 77)}...` : label;
}
