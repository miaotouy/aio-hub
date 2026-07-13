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

import { formatJson } from "../core/utils";
import { LruCache } from "../core/lruCache";

// 简单的内存缓存，避免每次渲染都重新 formatJson
const formatCache = new LruCache<string, { raw: string; formatted: string }>(
  100,
  // 一次只淘汰最旧的 1 条，行为接近原 FIFO
  1 / 100
);

export function useFormattedBody() {
  function getFormattedJson(recordId: string, rawBody?: string): string {
    if (!rawBody) return "";

    const cacheKey = `${recordId}_${rawBody.length}`;
    const cached = formatCache.get(cacheKey);
    if (cached && cached.raw === rawBody) {
      return cached.formatted;
    }

    const formatted = formatJson(rawBody);
    formatCache.set(cacheKey, { raw: rawBody, formatted });

    return formatted;
  }

  return {
    getFormattedJson,
  };
}
