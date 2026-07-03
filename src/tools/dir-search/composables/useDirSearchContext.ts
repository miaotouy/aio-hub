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

import { inject } from "vue";
import { DIR_SEARCH_CONTEXT_KEY } from "../types";
import type { useDirSearch } from "./useDirSearch";

export type DirSearchContext = ReturnType<typeof useDirSearch>;

/**
 * 在子组件中注入 dir-search 上下文。
 * 必须在 DirSearch.vue 的子组件树中使用，否则抛出错误。
 */
export function useDirSearchContext(): DirSearchContext {
  const context = inject(DIR_SEARCH_CONTEXT_KEY);
  if (!context) {
    throw new Error(
      "[useDirSearchContext] 必须在 DirSearch 组件树中使用。请确保父组件已调用 provide(DIR_SEARCH_CONTEXT_KEY, ...)"
    );
  }
  return context as DirSearchContext;
}
