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
