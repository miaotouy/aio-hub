// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { computed } from "vue";
import { useClipboard } from "@vueuse/core";
import { customMessage } from "@/utils/customMessage";
import type {
  SessionVariableSnapshot,
  VariableChange,
} from "../../types/sessionVariable";

/** Small shared state survives disposal of both popover and detail presentation. */
export interface VariableSnapshotViewState {
  searchQuery: string;
  showOnlyChanges: boolean;
}
export function createVariableSnapshotViewState(): VariableSnapshotViewState {
  return { searchQuery: "", showOnlyChanges: false };
}
export function useVariableSnapshotView(
  snapshot: () => SessionVariableSnapshot,
  state: () => VariableSnapshotViewState
) {
  const { copy } = useClipboard();
  const copyPath = async (path: string) => {
    await copy(path);
    customMessage.success("路径已复制");
  };
  const variableItems = computed(() => {
    const { values, changes = [] } = snapshot();
    const { searchQuery, showOnlyChanges } = state();
    const changeMap = new Map<string, VariableChange>(
      changes.map((change) => [change.path, change])
    );
    return Object.entries(values ?? {})
      .map(([path, value]) => ({
        path,
        value,
        isChanged: changeMap.has(path),
        changeInfo: changeMap.get(path),
        type: typeof value,
      }))
      .filter(
        (item) =>
          (!searchQuery ||
            item.path.toLowerCase().includes(searchQuery.toLowerCase())) &&
          (!showOnlyChanges || item.isChanged)
      )
      .sort((a, b) => {
        if (a.isChanged !== b.isChanged) return a.isChanged ? -1 : 1;
        return a.path.localeCompare(b.path);
      });
  });
  const hasChanges = computed(() => (snapshot().changes?.length ?? 0) > 0);
  return { variableItems, hasChanges, copyPath };
}
export function formatVariableValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
