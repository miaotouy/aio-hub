/**
 * Color Picker 历史记录管理器
 *
 * 采用"索引 + 分离文件"模式，借鉴 smart-ocr 的 useOcrHistory 设计
 * - history-index.json: 存储所有记录的元数据，用于快速列表展示
 * - history/{recordId}.json: 存储单条记录的完整数据
 */

import { exists, readTextFile, writeTextFile, remove } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { createConfigManager } from '@/utils/configManager';
import { useAssetManager } from '@/composables/useAssetManager';
import { createModuleLogger } from '@/utils/logger';
import { nanoid } from 'nanoid';
import type { ColorAnalysisResult, ManualColor } from '../colorPicker.store';

const logger = createModuleLogger('color-picker/history');

const MODULE_NAME = 'color-picker';
const HISTORY_SUBDIR = 'history';

/**
 * 历史记录索引项（用于列表展示的轻量数据）
 */
export interface ColorHistoryIndexItem {
  id: string;
  assetId: string; // 图片资产 ID
  assetPath: string; // 图片路径（用于缩略图）
  assetMimeType: string; // 图片 MIME 类型
  sourceImageName: string; // 原始文件名
  createdAt: number; // Unix 时间戳 (ms)
  colorPreview: string[]; // 预览颜色（最多取前 6 个主色调）
}

/**
 * 完整的历史记录数据
 */
export interface ColorHistoryRecord {
  id: string;
  assetId: string;
  assetPath: string; // 图片的相对路径
  sourceImageName: string;
  createdAt: number;
  analysisResult: ColorAnalysisResult; // 完整的分析结果
  manualPalette?: ManualColor[]; // 手动取色记录
}

/**
 * 历史记录索引配置
 */
interface HistoryIndex {
  version: string;
  records: ColorHistoryIndexItem[];
}

/**
 * 创建默认索引
 */
function createDefaultIndex(): HistoryIndex {
  return {
    version: '1.0.0',
    records: [],
  };
}

/**
 * 索引文件管理器
 */
const indexManager = createConfigManager<HistoryIndex>({
  moduleName: MODULE_NAME,
  fileName: 'history-index.json',
  version: '1.0.0',
  createDefault: createDefaultIndex,
});

/**
 * Color Picker 历史记录 Composable
 */
export function useColorHistory() {
  const { removeSourceFromAsset } = useAssetManager();

  /**
   * 获取 history 子目录的路径
   */
  async function getHistoryDir(): Promise<string> {
    const appDir = await appDataDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    return join(moduleDir, HISTORY_SUBDIR);
  }

  /**
   * 获取单个历史记录文件的路径
   */
  async function getHistoryRecordPath(recordId: string): Promise<string> {
    const historyDir = await getHistoryDir();
    return join(historyDir, `${recordId}.json`);
  }

  /**
   * 确保 history 子目录存在
   */
  async function ensureHistoryDir(): Promise<void> {
    const historyDir = await getHistoryDir();
    if (!(await exists(historyDir))) {
      const { mkdir } = await import('@tauri-apps/plugin-fs');
      await mkdir(historyDir, { recursive: true });
      logger.debug('创建 history 目录', { historyDir });
    }
  }

  /**
   * 加载历史记录索引
   */
  async function loadHistoryIndex(): Promise<HistoryIndex> {
    return await indexManager.load();
  }

  /**
   * 保存历史记录索引
   */
  async function saveHistoryIndex(index: HistoryIndex): Promise<void> {
    await indexManager.save(index);
  }

  /**
   * 加载单个历史记录的完整数据
   */
  async function loadFullRecord(recordId: string): Promise<ColorHistoryRecord | null> {
    try {
      const recordPath = await getHistoryRecordPath(recordId);
      if (!(await exists(recordPath))) {
        logger.warn('历史记录文件不存在', { recordId });
        return null;
      }
      const content = await readTextFile(recordPath);
      return JSON.parse(content);
    } catch (error) {
      logger.error('加载历史记录失败', error, { recordId });
      return null;
    }
  }

  /**
   * 从分析结果中提取预览颜色
   */
  function extractPreviewColors(result: ColorAnalysisResult): string[] {
    const colors: string[] = [];
    
    // 优先从 quantize 提取
    if (result.quantize?.colors) {
      colors.push(...result.quantize.colors.slice(0, 6));
    }
    
    // 如果不足 6 个，从 vibrant 补充
    if (colors.length < 6 && result.vibrant) {
      const vibrantColors = Object.values(result.vibrant).filter(
        (c): c is string => c !== null
      );
      colors.push(...vibrantColors.slice(0, 6 - colors.length));
    }
    
    // 如果还不足，从 average 补充
    if (colors.length < 6 && result.average?.color) {
      colors.push(result.average.color);
    }
    
    return colors.slice(0, 6); // 最多 6 个
  }

  /**
   * 添加一条新的历史记录
   */
  async function addRecord(
    recordData: Omit<ColorHistoryRecord, 'id' | 'assetPath'>,
    asset: import('@/types/asset-management').Asset
  ): Promise<ColorHistoryRecord> {
    const record: ColorHistoryRecord = {
      ...recordData,
      id: nanoid(),
      assetPath: asset.path, // 确保 assetPath 被保存
    };

    try {
      // 1. 确保存储目录存在
      await indexManager.ensureModuleDir();
      await ensureHistoryDir();

      // 2. 保存完整的记录文件
      const recordPath = await getHistoryRecordPath(record.id);
      await writeTextFile(recordPath, JSON.stringify(record, null, 2));

      // 3. 创建索引项
      const indexItem: ColorHistoryIndexItem = {
        id: record.id,
        assetId: record.assetId,
        assetPath: asset.path,
        assetMimeType: asset.mimeType,
        sourceImageName: record.sourceImageName,
        createdAt: record.createdAt,
        colorPreview: extractPreviewColors(record.analysisResult),
      };

      // 4. 更新索引文件
      const index = await loadHistoryIndex();
      index.records.unshift(indexItem); // 新记录放在最前面
      
      // 限制历史记录数量（最多保留 50 条）
      if (index.records.length > 50) {
        // 删除超出部分的记录文件
        const toDelete = index.records.slice(50);
        for (const item of toDelete) {
          try {
            const recordPath = await getHistoryRecordPath(item.id);
            if (await exists(recordPath)) {
              await remove(recordPath);
            }
            // 尝试移除资产来源
            await removeSourceFromAsset(item.assetId, MODULE_NAME).catch(() => {
              // 忽略错误，可能已被其他来源使用
            });
          } catch (error) {
            logger.warn('清理旧记录失败', { recordId: item.id });
          }
        }
        index.records = index.records.slice(0, 50);
      }
      
      await saveHistoryIndex(index);

      logger.info('新的颜色分析历史记录已添加', { recordId: record.id });
      return record;
    } catch (error) {
      logger.error('添加历史记录失败', error, { record });
      throw error;
    }
  }

  /**
   * 更新一条已存在的历史记录
   */
  async function updateRecord(
    recordId: string,
    updates: Partial<Omit<ColorHistoryRecord, 'id' | 'createdAt'>>
  ): Promise<void> {
    try {
      // 1. 读取现有记录
      const recordPath = await getHistoryRecordPath(recordId);
      if (!(await exists(recordPath))) {
        logger.warn('尝试更新不存在的记录', { recordId });
        return;
      }
      
      const content = await readTextFile(recordPath);
      const record: ColorHistoryRecord = JSON.parse(content);

      // 2. 应用更新
      const updatedRecord = {
        ...record,
        ...updates,
      };

      // 3. 保存回文件
      await writeTextFile(recordPath, JSON.stringify(updatedRecord, null, 2));

      // 4. 如果更新了影响索引的字段（如 analysisResult），也更新索引
      if (updates.analysisResult) {
        const index = await loadHistoryIndex();
        const indexItem = index.records.find(r => r.id === recordId);
        if (indexItem) {
          indexItem.colorPreview = extractPreviewColors(updatedRecord.analysisResult);
          await saveHistoryIndex(index);
        }
      }

      logger.debug('历史记录已更新', { recordId });
    } catch (error) {
      logger.error('更新历史记录失败', error, { recordId });
      throw error;
    }
  }

  /**
   * 删除一条历史记录
   */
  async function deleteRecord(recordId: string): Promise<void> {
    try {
      const index = await loadHistoryIndex();
      const recordIndex = index.records.findIndex((r) => r.id === recordId);
      if (recordIndex === -1) {
        logger.warn('尝试删除一个不存在的记录', { recordId });
        return;
      }

      const [recordToDelete] = index.records.splice(recordIndex, 1);
      const { assetId } = recordToDelete;

      // 1. 从资产中移除 color-picker 来源
      // 如果资产没有其他来源使用，后端会自动删除物理文件
      try {
        await removeSourceFromAsset(assetId, MODULE_NAME);
        logger.info('已从资产移除 color-picker 来源', { assetId });
      } catch (assetError) {
        logger.error('移除资产来源失败', assetError, { assetId });
        // 即使资产来源移除失败，也继续删除记录
      }

      // 2. 删除记录的 JSON 文件
      const recordPath = await getHistoryRecordPath(recordId);
      if (await exists(recordPath)) {
        await remove(recordPath);
      }

      // 3. 保存更新后的索引
      await saveHistoryIndex(index);

      logger.info('历史记录已删除', { recordId });
    } catch (error) {
      logger.error('删除历史记录失败', error, { recordId });
      throw error;
    }
  }

  /**
   * 清空所有历史记录
   */
  async function clearAllRecords(): Promise<void> {
    try {
      const index = await loadHistoryIndex();
      
      // 删除所有记录文件和资产来源
      for (const item of index.records) {
        try {
          const recordPath = await getHistoryRecordPath(item.id);
          if (await exists(recordPath)) {
            await remove(recordPath);
          }
          await removeSourceFromAsset(item.assetId, MODULE_NAME).catch(() => {
            // 忽略错误
          });
        } catch (error) {
          logger.warn('清理记录失败', { recordId: item.id });
        }
      }
      
      // 清空索引
      index.records = [];
      await saveHistoryIndex(index);
      
      logger.info('已清空所有历史记录');
    } catch (error) {
      logger.error('清空历史记录失败', error);
      throw error;
    }
  }

  return {
    loadHistoryIndex,
    loadFullRecord,
    addRecord,
    updateRecord,
    deleteRecord,
    clearAllRecords,
  };
}