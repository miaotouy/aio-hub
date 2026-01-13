import { createModuleLogger } from '@/utils/logger';
import { useColorExtractor } from './composables/useColorExtractor';
import { useColorHistory } from './composables/useColorHistory';
import * as ColorConverter from './composables/useColorConverter';
import type { ServiceMetadata, ToolRegistry, ToolConfig } from '@/services/types';
import type { Asset } from '@/types/asset-management';
import type { ColorAnalysisResult, AnalysisAlgorithm } from './colorPicker.store';
import { markRaw } from 'vue';
import { Pipette } from 'lucide-vue-next';

const logger = createModuleLogger('tools/color-picker');

/**
 * Color Picker 注册器
 *
 * 实现了 ToolRegistry 接口，并作为颜色提取、历史记录等功能的统一门户。
 * 此注册器将被自动注册系统发现并实例化。
 */
export default class ColorPickerRegistry implements ToolRegistry {
  public readonly id = 'color-picker';
  public readonly name = '图片色彩分析';
  public readonly description = '从图片中提取和分析颜色方案';

  // 使用惰性初始化避免生命周期钩子警告
  private _extractor: ReturnType<typeof useColorExtractor> | null = null;
  private _history: ReturnType<typeof useColorHistory> | null = null;
  
  /**
   * 获取颜色提取器实例（惰性初始化）
   */
  private get extractor() {
    if (!this._extractor) {
      this._extractor = useColorExtractor();
    }
    return this._extractor;
  }
  
  /**
   * 获取历史记录管理器实例（惰性初始化）
   */
  private get history() {
    if (!this._history) {
      this._history = useColorHistory();
    }
    return this._history;
  }

  /**
   * 将颜色转换工具集作为静态属性暴露，方便外部直接调用。
   * @example ColorPickerRegistry.converter.rgbToHex(255, 0, 0)
   */
  public static converter = ColorConverter;

  /**
   * 分析图片并提取颜色。
   * @param imageSource 图片的 Blob 或 HTMLImageElement 对象。
   * @param algorithms 要执行的分析算法数组。默认为全部执行。
   * @returns 返回包含各种算法结果的分析对象。
   */
  public async analyze(
    imageSource: Blob | HTMLImageElement,
    algorithms: AnalysisAlgorithm[] = ['quantize', 'vibrant', 'average']
  ): Promise<ColorAnalysisResult> {
    logger.info('开始颜色分析', { algorithms });
    return this.extractor.extractColors(imageSource, algorithms);
  }

  /**
   * 将一次成功的分析结果添加到历史记录中。
   * @param asset 关联的图片资产对象。
   * @param analysisResult 从 analyze 方法获取的分析结果。
   */
  public async addHistory(asset: Asset, analysisResult: ColorAnalysisResult) {
    logger.info('添加历史记录', { assetId: asset.id });
    const recordData = {
      assetId: asset.id,
      sourceImageName: asset.name, // 修正：直接使用 asset.name
      createdAt: Date.now(),
      analysisResult,
    };
    return this.history.addRecord(recordData, asset);
  }

  /**
   * 获取所有历史记录的轻量级索引列表。
   * @returns 返回历史记录索引项的数组。
   */
  public async getHistory() {
    logger.info('获取历史记录索引');
    const index = await this.history.loadHistoryIndex();
    return index.records;
  }

  /**
   * 根据记录 ID 加载单条历史记录的完整详细数据。
   * @param recordId 记录的唯一 ID。
   * @returns 返回完整的历史记录对象，如果找不到则返回 null。
   */
  public async getHistoryRecord(recordId: string) {
    logger.info('加载完整历史记录', { recordId });
    return this.history.loadFullRecord(recordId);
  }

  /**
   * 根据 ID 删除一条历史记录及其关联的文件。
   * @param recordId 要删除的记录的唯一 ID。
   */
  public async deleteHistory(recordId: string) {
    logger.info('删除历史记录', { recordId });
    await this.history.deleteRecord(recordId);
  }

  /**
   * 清空所有的颜色分析历史记录。
   */
  public async clearHistory() {
    logger.info('清空所有历史记录');
    await this.history.clearAllRecords();
  }

  /**
   * 提供服务的元数据，用于服务监控和文档。
   */
  public getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: 'analyze',
          description: '分析图片并提取颜色方案。',
          parameters: [
            { name: 'imageSource', type: 'Blob | HTMLImageElement', description: '图片的 Blob 或 HTMLImageElement 对象。' },
            { name: 'algorithms', type: 'AnalysisAlgorithm[]', description: '要执行的分析算法数组。', required: false, defaultValue: "['quantize', 'vibrant', 'average']" },
          ],
          returnType: 'Promise<ColorAnalysisResult>',
          example: "await service.analyze(imageBlob, ['quantize']);",
        },
        {
          name: 'addHistory',
          description: '将分析结果添加到历史记录。',
          parameters: [
            { name: 'asset', type: 'Asset', description: '关联的图片资产对象。' },
            { name: 'analysisResult', type: 'ColorAnalysisResult', description: '从 analyze 方法获取的分析结果。' },
          ],
          returnType: 'Promise<ColorHistoryRecord>',
        },
        {
          name: 'getHistory',
          description: '获取所有历史记录的索引列表。',
          parameters: [],
          returnType: 'Promise<ColorHistoryIndexItem[]>',
        },
        {
          name: 'getHistoryRecord',
          description: '加载单条历史记录的完整数据。',
          parameters: [
            { name: 'recordId', type: 'string', description: '记录的唯一 ID。' },
          ],
          returnType: 'Promise<ColorHistoryRecord | null>',
        },
        {
          name: 'deleteHistory',
          description: '删除一条历史记录。',
          parameters: [
            { name: 'recordId', type: 'string', description: '要删除的记录的唯一 ID。' },
          ],
          returnType: 'Promise<void>',
        },
        {
          name: 'clearHistory',
          description: '清空所有历史记录。',
          parameters: [],
          returnType: 'Promise<void>',
        },
      ],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: '图片色彩分析',
  path: '/color-picker',
  icon: markRaw(Pipette),
  component: () => import('./ColorPicker.vue'),
  description: '从图片中提取颜色，支持多种算法分析主色调、调色板和平均色',
  category: 'AI 工具'
};