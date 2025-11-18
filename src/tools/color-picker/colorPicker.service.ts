import { createModuleLogger } from '@/utils/logger';
import { useColorExtractor } from './composables/useColorExtractor';
import { useColorHistory } from './composables/useColorHistory';
import * as ColorConverter from './composables/useColorConverter';
import type { ServiceMetadata, ToolService } from '@/services/types';
import type { Asset } from '@/types/asset-management';
import type { ColorAnalysisResult, AnalysisAlgorithm } from './colorPicker.store';

const logger = createModuleLogger('color-picker/service');

/**
 * Color Picker 服务类
 *
 * 实现了 ToolService 接口，并作为颜色提取、历史记录等功能的统一门户。
 * 此服务将被自动注册系统发现并实例化。
 */
export default class ColorPickerService implements ToolService {
  public readonly id = 'color-picker';
  public readonly name = 'Color Picker';
  public readonly description = '从图片中提取和分析颜色方案';

  // 将 composables 实例化，作为私有成员使用
  private extractor = useColorExtractor();
  private history = useColorHistory();

  /**
   * 将颜色转换工具集作为静态属性暴露，方便外部直接调用。
   * @example ColorPickerService.converter.rgbToHex(255, 0, 0)
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