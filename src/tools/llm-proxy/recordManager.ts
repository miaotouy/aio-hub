import { ref, reactive } from 'vue';
import { createModuleLogger } from '@utils/logger';
import { createModuleErrorHandler } from '@utils/errorHandler';
import type { CombinedRecord, RequestRecord, ResponseRecord, FilterOptions } from './types';
import { filterRecords } from './utils';

const logger = createModuleLogger('LlmProxy/RecordManager');
const errorHandler = createModuleErrorHandler('LlmProxy/RecordManager');

// 记录存储
const records = ref<CombinedRecord[]>([]);
const selectedRecord = ref<CombinedRecord | null>(null);

// 过滤选项
const filterOptions = reactive<FilterOptions>({
  searchQuery: '',
  filterStatus: ''
});

// 最大记录数量限制
const MAX_RECORDS = 1000;

/**
 * 获取所有记录
 */
export function getRecords(): CombinedRecord[] {
  return records.value;
}

/**
 * 获取过滤后的记录
 */
export function getFilteredRecords(): CombinedRecord[] {
  return filterRecords(records.value, filterOptions);
}

/**
 * 获取选中的记录
 */
export function getSelectedRecord(): CombinedRecord | null {
  return selectedRecord.value;
}

/**
 * 获取过滤选项
 */
export function getFilterOptions(): FilterOptions {
  return { ...filterOptions };
}

/**
 * 添加请求记录
 */
export function addRequestRecord(request: RequestRecord): void {
  logger.debug('添加请求记录', { 
    requestId: request.id, 
    method: request.method, 
    url: request.url 
  });

  const combinedRecord: CombinedRecord = {
    id: request.id,
    request,
    response: undefined
  };

  records.value.push(combinedRecord);

  // 限制记录数量
  if (records.value.length > MAX_RECORDS) {
    const removed = records.value.shift();
    logger.debug('移除超出限制的记录', { removedId: removed?.id });
  }

  // 如果这是第一个请求且没有选中的记录，自动选中它
  if (records.value.length === 1 && !selectedRecord.value) {
    selectRecord(combinedRecord);
  }
}

/**
 * 更新响应记录
 */
export function updateResponseRecord(response: ResponseRecord): void {
  logger.debug('更新响应记录', { 
    requestId: response.id, 
    status: response.status, 
    duration: response.duration_ms 
  });

  const record = records.value.find(r => r.id === response.id);
  if (record) {
    record.response = response;
    
    // 如果当前选中的是这个记录，触发更新
    if (selectedRecord.value?.id === response.id) {
      selectedRecord.value = { ...record };
    }
  } else {
    logger.warn('未找到对应的请求记录', { requestId: response.id });
  }
}

/**
 * 选择记录
 */
export function selectRecord(record: CombinedRecord | null): void {
  logger.debug('选择记录', { recordId: record?.id });
  selectedRecord.value = record;
}

/**
 * 清空所有记录
 */
export function clearAllRecords(): void {
  logger.info('清空所有记录', { count: records.value.length });
  records.value = [];
  selectedRecord.value = null;
}

/**
 * 删除指定记录
 */
export function deleteRecord(recordId: string): boolean {
  const index = records.value.findIndex(r => r.id === recordId);
  if (index !== -1) {
    records.value.splice(index, 1);
    
    // 如果删除的是当前选中的记录，清除选中状态
    if (selectedRecord.value?.id === recordId) {
      selectedRecord.value = null;
    }
    
    logger.debug('删除记录', { recordId });
    return true;
  }
  
  logger.warn('未找到要删除的记录', { recordId });
  return false;
}

/**
 * 更新过滤选项
 */
export function updateFilterOptions(options: Partial<FilterOptions>): void {
  Object.assign(filterOptions, options);
  logger.debug('更新过滤选项', filterOptions);
}

/**
 * 重置过滤选项
 */
export function resetFilterOptions(): void {
  filterOptions.searchQuery = '';
  filterOptions.filterStatus = '';
  logger.debug('重置过滤选项');
}

/**
 * 根据ID查找记录
 */
export function findRecordById(recordId: string): CombinedRecord | undefined {
  return records.value.find(r => r.id === recordId);
}

/**
 * 获取记录统计信息
 */
export function getRecordStats() {
  const total = records.value.length;
  const completed = records.value.filter(r => r.response !== undefined).length;
  const pending = total - completed;
  
  // 状态码统计
  const statusCounts: Record<string, number> = {};
  records.value.forEach(record => {
    if (record.response) {
      const status = record.response.status.toString();
      const category = status[0] + 'xx';
      statusCounts[category] = (statusCounts[category] || 0) + 1;
    }
  });

  return {
    total,
    completed,
    pending,
    statusCounts
  };
}

/**
 * 导出记录为JSON
 */
export function exportRecordsToJson(): string {
  const exportData = {
    exportTime: new Date().toISOString(),
    stats: getRecordStats(),
    records: records.value
  };
  
  return JSON.stringify(exportData, null, 2);
}

/**
 * 从JSON导入记录
 */
export function importRecordsFromJson(jsonData: string): { success: boolean; imported: number; error?: string } {
  try {
    const data = JSON.parse(jsonData);
    
    if (!Array.isArray(data.records)) {
      return { success: false, imported: 0, error: '无效的数据格式' };
    }

    let imported = 0;
    data.records.forEach((record: CombinedRecord) => {
      if (record.id && record.request) {
        // 检查是否已存在相同ID的记录
        const existing = findRecordById(record.id);
        if (!existing) {
          records.value.push(record);
          imported++;
        }
      }
    });

    logger.info('导入记录', { imported, total: data.records.length });
    return { success: true, imported };
    
  } catch (error) {
    errorHandler.error(error, '导入记录失败', { showToUser: false });
    return { success: false, imported: 0, error: `解析失败: ${error}` };
  }
}

/**
 * 获取最近的记录
 */
export function getRecentRecords(limit: number = 10): CombinedRecord[] {
  return getFilteredRecords().slice(0, limit);
}

/**
 * 搜索记录
 */
export function searchRecords(query: string): CombinedRecord[] {
  if (!query.trim()) {
    return getFilteredRecords();
  }

  const searchQuery = query.toLowerCase();
  return getFilteredRecords().filter(record => {
    return record.request.url.toLowerCase().includes(searchQuery) ||
           record.request.method.toLowerCase().includes(searchQuery) ||
           record.request.body?.toLowerCase().includes(searchQuery) ||
           record.response?.body?.toLowerCase().includes(searchQuery);
  });
}

// 响应式访问器
export function useRecordManager() {
  return {
    // 状态
    records: records,
    selectedRecord: selectedRecord,
    filterOptions: filterOptions,
    
    // 方法
    getRecords,
    getFilteredRecords,
    getSelectedRecord,
    getFilterOptions,
    addRequestRecord,
    updateResponseRecord,
    selectRecord,
    clearAllRecords,
    deleteRecord,
    updateFilterOptions,
    resetFilterOptions,
    findRecordById,
    getRecordStats,
    exportRecordsToJson,
    importRecordsFromJson,
    getRecentRecords,
    searchRecords
  };
}