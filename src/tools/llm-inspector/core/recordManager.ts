/**
 * recordManager — 兼容层（已迁移至 Pinia store）
 *
 * 历史：原本是模块级响应式单例（存在 SSR / 测试隔离 / HMR 风险）。
 * 迁移：2026-06，状态与方法已搬入 [`stores/inspectorRecordsStore`](src/tools/llm-inspector/stores/inspectorRecordsStore.ts:1)。
 *
 * 本文件保留是为了**消费方零改动**：
 * - 所有现有 `import { useRecordManager } from "../core/recordManager"` 都继续工作；
 * - 返回值结构与原 hook 完全一致（state 是 ref / reactive，方法直接调用）。
 *
 * 新代码请直接 import [`useInspectorRecordsStore`](src/tools/llm-inspector/stores/inspectorRecordsStore.ts:38)。
 */

import { storeToRefs } from "pinia";
import { useInspectorRecordsStore } from "../stores/inspectorRecordsStore";

/**
 * 响应式访问器：对外暴露与原 recordManager 完全相同的 API。
 *
 * 内部：从 Pinia store 取真值，用 `storeToRefs` 包装出 ref 形式的 `records` / `selectedRecord`，
 * 保持原 hook 解构后的 `xxx.value` 访问语法。`filterOptions` 故意走原 reactive 对象而不被
 * `storeToRefs` 转成 ref，以兼容 LlmInspector.vue 的 `v-model:searchQuery="filterOptions.xxx"`
 * 写法（reactive 对象在 store 上可直接读写并被 Pinia 跟踪）。
 */
export function useRecordManager() {
  const store = useInspectorRecordsStore();
  const { records, selectedRecord } = storeToRefs(store);

  return {
    // 状态（保持与原 API 一致）
    records,
    selectedRecord,
    filterOptions: store.filterOptions,

    // 方法
    getRecords: store.getRecords,
    getFilteredRecords: store.getFilteredRecords,
    getSelectedRecord: store.getSelectedRecord,
    getFilterOptions: store.getFilterOptions,
    addRequestRecord: store.addRequestRecord,
    updateResponseRecord: store.updateResponseRecord,
    selectRecord: store.selectRecord,
    clearAllRecords: store.clearAllRecords,
    deleteRecord: store.deleteRecord,
    updateFilterOptions: store.updateFilterOptions,
    resetFilterOptions: store.resetFilterOptions,
    findRecordById: store.findRecordById,
    getRecordStats: store.getRecordStats,
    exportRecordsToJson: store.exportRecordsToJson,
    importRecordsFromJson: store.importRecordsFromJson,
    getRecentRecords: store.getRecentRecords,
    searchRecords: store.searchRecords,
  };
}
