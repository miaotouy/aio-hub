/**
 * Smart OCR 历史记录管理器
 *
 * 采用“索引 + 分离文件”模式，借鉴 llm-chat 的 useChatStorageSeparated 设计
 * - history-index.json: 存储所有记录的元数据，用于快速列表展示
 * - history/{recordId}.json: 存储单条记录的完整数据
 */

import { exists, readTextFile, writeTextFile, remove } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { createConfigManager } from '@/utils/configManager';
import { useAssetManager } from '@/composables/useAssetManager';
import type { OcrHistoryIndexItem, OcrHistoryRecord } from '../types';
import { createModuleLogger } from '@/utils/logger';
import { nanoid } from 'nanoid';

const logger = createModuleLogger('smart-ocr/history');

const MODULE_NAME = 'smart-ocr';
const HISTORY_SUBDIR = 'history';

/**
 * 历史记录索引配置
 */
interface HistoryIndex {
  version: string;
  records: OcrHistoryIndexItem[];
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
 * OCR 历史记录 Composable
 */
export function useOcrHistory() {
  const { deleteAsset } = useAssetManager();

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
  async function loadFullRecord(recordId: string): Promise<OcrHistoryRecord | null> {
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
   * 添加一条新的历史记录
   */
  async function addRecord(
    recordData: Omit<OcrHistoryRecord, 'id'>,
    asset: import('@/types/asset-management').Asset
  ): Promise<OcrHistoryRecord> {
    const record: OcrHistoryRecord = {
      ...recordData,
      id: nanoid(),
    };

    try {
      // 1. 确保存储目录存在
      await indexManager.ensureModuleDir();
      await ensureHistoryDir();

      // 2. 保存完整的记录文件
      const recordPath = await getHistoryRecordPath(record.id);
      await writeTextFile(recordPath, JSON.stringify(record, null, 2));

      // 3. 创建索引项
      const fullText = record.results.map((r) => r.text).join('\n');
      const indexItem: OcrHistoryIndexItem = {
        id: record.id,
        assetId: record.assetId,
        assetPath: asset.path,
        assetMimeType: asset.mimeType,
        engine: record.engine,
        createdAt: record.createdAt,
        textPreview: fullText.substring(0, 100), // 截取前100个字符作为预览
      };

      // 4. 更新索引文件
      const index = await loadHistoryIndex();
      index.records.unshift(indexItem); // 新记录放在最前面
      await saveHistoryIndex(index);

      logger.info('新的 OCR 历史记录已添加', { recordId: record.id });
      return record;
    } catch (error) {
      logger.error('添加历史记录失败', error, { record });
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

      // 1. 检查此 asset 是否仍被其他记录引用
      const isAssetReferenced = index.records.some((r) => r.assetId === assetId);

      // 2. 如果没有其他引用，则删除资产文件
      if (!isAssetReferenced) {
        try {
          await deleteAsset(assetId);
          logger.info('关联的资产文件已删除', { assetId });
        } catch (assetError) {
          logger.error('删除资产文件失败', assetError, { assetId });
          // 即使资产删除失败，也继续删除记录
        }
      } else {
        logger.info('资产文件被其他记录引用，跳过删除', { assetId });
      }

      // 3. 删除记录的 JSON 文件
      const recordPath = await getHistoryRecordPath(recordId);
      if (await exists(recordPath)) {
        await remove(recordPath);
      }

      // 4. 保存更新后的索引
      await saveHistoryIndex(index);

      logger.info('历史记录已删除', { recordId });
    } catch (error) {
      logger.error('删除历史记录失败', error, { recordId });
      throw error;
    }
  }

  return {
    loadHistoryIndex,
    loadFullRecord,
    addRecord,
    deleteRecord,
  };
}