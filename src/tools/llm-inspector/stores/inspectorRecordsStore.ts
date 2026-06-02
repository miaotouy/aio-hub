/**
 * inspectorRecordsStore — Pinia store for LLM Inspector 记录仓库
 *
 * 从原 [`core/recordManager.ts`](src/tools/llm-inspector/core/recordManager.ts:1) 模块级响应式单例迁移而来。
 *
 * 迁移动机：
 * - 模块级 `ref/reactive` 单例存在 SSR / 测试隔离 / HMR 风险；
 * - Pinia store 提供 devtools 集成与标准化的实例边界；
 * - 调用方仍通过原 `useRecordManager()` 兼容层访问（见 [`core/recordManager.ts`](src/tools/llm-inspector/core/recordManager.ts:1)），
 *   所以本次迁移对消费方零侵入。
 *
 * 设计要点：
 * - `filterOptions` 保持 `reactive<FilterOptions>`（而非 `ref`），以便 LlmInspector.vue 模板里
 *   `v-model:searchQuery="filterOptions.searchQuery"` 的写法继续生效；
 * - `records` / `selectedRecord` 保持 `ref<...>`，调用方通过兼容层的 `storeToRefs` 解构后得到 ref。
 */

import { defineStore } from "pinia";
import { ref, reactive } from "vue";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";
import type {
  CombinedRecord,
  RecordInspectorMetadata,
  RecordSource,
  RequestRecord,
  ResponseRecord,
  FilterOptions,
} from "../types";
import { filterRecords } from "../core/utils";

const logger = createModuleLogger("LlmInspector/RecordsStore");
const errorHandler = createModuleErrorHandler("LlmInspector/RecordsStore");

/** 最大记录数量限制。超过后从队首移除最旧记录。 */
const MAX_RECORDS = 1000;

export const useInspectorRecordsStore = defineStore(
  "llmInspectorRecords",
  () => {
    // === 响应式状态 ===
    const records = ref<CombinedRecord[]>([]);
    const selectedRecord = ref<CombinedRecord | null>(null);

    /**
     * 过滤选项。**故意**使用 `reactive` 而非 `ref`，以兼容 LlmInspector.vue 模板里
     * `v-model:searchQuery="filterOptions.searchQuery"` 的写法。
     */
    const filterOptions = reactive<FilterOptions>({
      searchQuery: "",
      filterStatus: "",
    });

    // === 查询方法 ===

    function getRecords(): CombinedRecord[] {
      return records.value;
    }

    function getFilteredRecords(): CombinedRecord[] {
      return filterRecords(records.value, filterOptions);
    }

    function getSelectedRecord(): CombinedRecord | null {
      return selectedRecord.value;
    }

    function getFilterOptions(): FilterOptions {
      return { ...filterOptions };
    }

    function findRecordById(recordId: string): CombinedRecord | undefined {
      return records.value.find((r) => r.id === recordId);
    }

    // === 写入方法 ===

    /**
     * 添加请求记录
     *
     * @param source - 默认 `"external"`（来自 Rust 代理）；`"internal"` 表示来自前端钩子
     * @param inspectorMetadata - 当 source 为 `"internal"` 时携带的上下文元数据
     */
    function addRequestRecord(
      request: RequestRecord,
      source: RecordSource = "external",
      inspectorMetadata?: RecordInspectorMetadata
    ): void {
      logger.debug("添加请求记录", {
        requestId: request.id,
        method: request.method,
        url: request.url,
        source,
      });

      const combinedRecord: CombinedRecord = {
        id: request.id,
        request,
        response: undefined,
        source,
        inspectorMetadata,
      };

      records.value.push(combinedRecord);
      if (records.value.length > MAX_RECORDS) {
        const removed = records.value.shift();
        logger.debug("移除超出限制的记录", { removedId: removed?.id });
      }

      // 自动选中第一条
      if (records.value.length === 1 && !selectedRecord.value) {
        selectRecord(combinedRecord);
      }
    }

    function updateResponseRecord(response: ResponseRecord): void {
      logger.debug("更新响应记录", {
        requestId: response.id,
        status: response.status,
        duration: response.duration_ms,
      });

      const record = records.value.find((r) => r.id === response.id);
      if (record) {
        record.response = response;

        // 触发选中记录的响应式更新
        if (selectedRecord.value?.id === response.id) {
          selectedRecord.value = { ...record };
        }
      } else {
        logger.warn("未找到对应的请求记录", { requestId: response.id });
      }
    }

    function selectRecord(record: CombinedRecord | null): void {
      logger.debug("选择记录", { recordId: record?.id });
      selectedRecord.value = record;
    }

    function clearAllRecords(): void {
      logger.info("清空所有记录", { count: records.value.length });
      records.value = [];
      selectedRecord.value = null;
    }

    function deleteRecord(recordId: string): boolean {
      const index = records.value.findIndex((r) => r.id === recordId);
      if (index !== -1) {
        records.value.splice(index, 1);

        if (selectedRecord.value?.id === recordId) {
          selectedRecord.value = null;
        }

        logger.debug("删除记录", { recordId });
        return true;
      }

      logger.warn("未找到要删除的记录", { recordId });
      return false;
    }

    function updateFilterOptions(options: Partial<FilterOptions>): void {
      Object.assign(filterOptions, options);
      logger.debug("更新过滤选项", filterOptions);
    }

    function resetFilterOptions(): void {
      filterOptions.searchQuery = "";
      filterOptions.filterStatus = "";
      logger.debug("重置过滤选项");
    }

    // === 统计 / 导入导出 ===

    function getRecordStats() {
      const total = records.value.length;
      const completed = records.value.filter(
        (r) => r.response !== undefined
      ).length;
      const pending = total - completed;

      const statusCounts: Record<string, number> = {};
      records.value.forEach((record) => {
        if (record.response) {
          const status = record.response.status.toString();
          const category = status[0] + "xx";
          statusCounts[category] = (statusCounts[category] || 0) + 1;
        }
      });

      return {
        total,
        completed,
        pending,
        statusCounts,
      };
    }

    function exportRecordsToJson(): string {
      const exportData = {
        exportTime: new Date().toISOString(),
        stats: getRecordStats(),
        records: records.value,
      };

      return JSON.stringify(exportData, null, 2);
    }

    function importRecordsFromJson(jsonData: string): {
      success: boolean;
      imported: number;
      error?: string;
    } {
      try {
        const data = JSON.parse(jsonData);

        if (!Array.isArray(data.records)) {
          return { success: false, imported: 0, error: "无效的数据格式" };
        }

        let imported = 0;
        data.records.forEach((record: CombinedRecord) => {
          if (record.id && record.request) {
            const existing = findRecordById(record.id);
            if (!existing) {
              records.value.push(record);
              imported++;
            }
          }
        });

        logger.info("导入记录", { imported, total: data.records.length });
        return { success: true, imported };
      } catch (error) {
        errorHandler.handle(error, {
          userMessage: "导入记录失败",
          showToUser: false,
        });
        return { success: false, imported: 0, error: `解析失败: ${error}` };
      }
    }

    function getRecentRecords(limit: number = 10): CombinedRecord[] {
      return getFilteredRecords().slice(0, limit);
    }

    function searchRecords(query: string): CombinedRecord[] {
      if (!query.trim()) {
        return getFilteredRecords();
      }

      const searchQuery = query.toLowerCase();
      return getFilteredRecords().filter((record) => {
        return (
          record.request.url.toLowerCase().includes(searchQuery) ||
          record.request.method.toLowerCase().includes(searchQuery) ||
          record.request.body?.toLowerCase().includes(searchQuery) ||
          record.response?.body?.toLowerCase().includes(searchQuery)
        );
      });
    }

    return {
      // 状态
      records,
      selectedRecord,
      filterOptions,

      // 查询
      getRecords,
      getFilteredRecords,
      getSelectedRecord,
      getFilterOptions,
      findRecordById,

      // 写入
      addRequestRecord,
      updateResponseRecord,
      selectRecord,
      clearAllRecords,
      deleteRecord,
      updateFilterOptions,
      resetFilterOptions,

      // 统计 / IO
      getRecordStats,
      exportRecordsToJson,
      importRecordsFromJson,
      getRecentRecords,
      searchRecords,
    };
  }
);
