import type { ToolRegistry, ToolConfig } from '@/services/types';
import { markRaw } from 'vue';
import { MagicStick } from '@element-plus/icons-vue';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { customMessage } from '@/utils/customMessage';
import * as engine from './core/engine';
import { usePresetStore } from './stores/store';
import type {
  TextProcessOptions,
  TextProcessResult,
  FileProcessOptions,
  FileProcessResult,
  FormattedProcessSummary,
  OneClickOptions
} from './types';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';

const logger = createModuleLogger('services/regex-applier');
const errorHandler = createModuleErrorHandler('services/regex-applier');

export default class RegexApplierRegistry implements ToolRegistry {
  public readonly id = 'regex-applier';
  public readonly name = '正则批量替换';
  public readonly description = '正则表达式批量应用工具';

  private _store: ReturnType<typeof usePresetStore> | null = null;

  /**
   * 获取 store 实例（惰性初始化）
   */
  private get store() {
    if (!this._store) {
      this._store = usePresetStore();
    }
    return this._store;
  }

  // ==================== 核心业务方法 ====================

  /**
   * 处理文本（应用多个预设的规则）
   */
  public async processText(options: TextProcessOptions): Promise<TextProcessResult | null> {
    return engine.processText(options, (id) => this.store.presets.find(p => p.id === id));
  }

  /**
   * 处理文件（调用 Rust 后端）
   */
  public async processFiles(options: FileProcessOptions): Promise<FileProcessResult | null> {
    return engine.processFiles(options, (id) => this.store.presets.find(p => p.id === id));
  }

  /**
   * 从剪贴板粘贴文本
   */
  public async pasteFromClipboard(): Promise<string | null> {
    logger.info('从剪贴板粘贴文本');

    return await errorHandler.wrapAsync(
      async () => {
        const text = await readText();
        logger.debug('已从剪贴板读取文本', { length: text?.length });
        return text || '';
      },
      {
        userMessage: '粘贴失败',
      }
    );
  }

  /**
   * 复制文本到剪贴板
   */
  public async copyToClipboard(text: string): Promise<boolean> {
    logger.info('复制文本到剪贴板', { length: text.length });

    return await errorHandler.wrapAsync(
      async () => {
        await writeText(text);
        customMessage.success('已复制到剪贴板！');
        logger.debug('文本已复制到剪贴板');
        return true;
      },
      {
        userMessage: '复制失败',
      }
    ).then(result => result ?? false);
  }

  /**
   * 一键处理：粘贴 -> 处理 -> 复制
   */
  public async oneClickProcess(options: OneClickOptions): Promise<FormattedProcessSummary | null> {
    logger.info('执行一键处理', { presetCount: options.presetIds.length });

    return await errorHandler.wrapAsync(
      async () => {
        if (options.presetIds.length === 0) {
          throw new Error('请先选择至少一个预设');
        }

        // 1. 粘贴
        const sourceText = await this.pasteFromClipboard();
        if (!sourceText) {
          throw new Error('剪贴板内容为空');
        }

        // 2. 处理
        const processResult = await this.processText({
          sourceText,
          presetIds: options.presetIds,
        });

        if (!processResult) {
          throw new Error('文本处理失败');
        }

        // 3. 复制
        await this.copyToClipboard(processResult.text);

        logger.info('一键处理完成', {
          rulesApplied: processResult.totalRulesApplied,
        });

        return {
          summary: `一键处理完成，应用了 ${processResult.totalRulesApplied} 条规则`,
          details: {
            successCount: 1,
            rulesApplied: processResult.totalRulesApplied,
          },
        };
      },
      {
        userMessage: '一键处理失败',
        context: options,
      }
    );
  }

  /**
   * 验证正则表达式
   */
  public validateRegex(pattern: string): { valid: boolean; error?: string } {
    return engine.validateRegex(pattern);
  }

  /**
   * 获取所有预设列表（简化信息）
   */
  public getPresets(): Array<{ id: string; name: string; description?: string; ruleCount: number }> {
    return this.store.presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      ruleCount: preset.rules.filter((r) => r.enabled).length,
    }));
  }

  /**
   * 获取单个预设的详细信息
   */
  public getPresetById(presetId: string) {
    const preset = this.store.presets.find((p) => p.id === presetId);
    if (!preset) {
      return null;
    }

    return {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      rules: preset.rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        regex: rule.regex,
        replacement: rule.replacement,
      })),
      createdAt: preset.createdAt,
      updatedAt: preset.updatedAt,
    };
  }

  // ==================== 高级封装方法（Agent 调用接口）====================

  /**
   * 获取格式化的文本处理结果（推荐 Agent 使用）
   */
  public async getFormattedTextResult(
    options: TextProcessOptions
  ): Promise<FormattedProcessSummary | null> {
    const result = await this.processText(options);
    if (!result) return null;

    return {
      summary: `处理完成，应用了 ${result.totalRulesApplied} 条规则`,
      details: {
        successCount: 1,
        rulesApplied: result.totalRulesApplied,
      },
    };
  }

  /**
   * 获取格式化的文件处理结果（推荐 Agent 使用）
   */
  public async getFormattedFileResult(
    options: FileProcessOptions
  ): Promise<FormattedProcessSummary | null> {
    const result = await this.processFiles(options);
    if (!result) return null;

    const summary =
      result.error_count > 0
        ? `处理完成：成功 ${result.success_count} 个，失败 ${result.error_count} 个`
        : `所有文件处理完成！共处理 ${result.success_count} 个文件`;

    return {
      summary,
      details: {
        successCount: result.success_count,
        errorCount: result.error_count,
        totalMatches: result.total_matches,
        duration: `${result.duration_ms?.toFixed(2)}ms`,
      },
    };
  }

  // ==================== 元数据 ====================

  /**
   * 获取服务元数据（仅包含对外公开的高级接口）
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'processText',
          description: '处理文本（应用多个预设的规则）',
          parameters: [
            {
              name: 'options',
              type: 'TextProcessOptions',
              description: '文本处理选项',
            },
          ],
          returnType: 'Promise<TextProcessResult | null>',
        },
        {
          name: 'processFiles',
          description: '批量处理文件（调用 Rust 后端）',
          parameters: [
            {
              name: 'options',
              type: 'FileProcessOptions',
              description: '文件处理选项',
            },
          ],
          returnType: 'Promise<FileProcessResult | null>',
        },
        {
          name: 'oneClickProcess',
          description: '一键处理：粘贴 -> 处理 -> 复制',
          parameters: [
            {
              name: 'options',
              type: 'OneClickOptions',
              description: '一键处理选项',
            },
          ],
          returnType: 'Promise<FormattedProcessSummary | null>',
        },
        {
          name: 'getFormattedTextResult',
          description: '获取格式化的文本处理结果（推荐 Agent 使用）',
          parameters: [
            {
              name: 'options',
              type: 'TextProcessOptions',
              description: '文本处理选项',
            },
          ],
          returnType: 'Promise<FormattedProcessSummary | null>',
        },
        {
          name: 'getFormattedFileResult',
          description: '获取格式化的文件处理结果（推荐 Agent 使用）',
          parameters: [
            {
              name: 'options',
              type: 'FileProcessOptions',
              description: '文件处理选项',
            },
          ],
          returnType: 'Promise<FormattedProcessSummary | null>',
        },
        {
          name: 'validateRegex',
          description: '验证正则表达式是否有效',
          parameters: [
            {
              name: 'pattern',
              type: 'string',
              description: '正则表达式字符串',
              required: true,
            },
          ],
          returnType: '{ valid: boolean; error?: string }',
        },
        {
          name: 'getPresets',
          description: '获取所有预设列表（简化信息）',
          parameters: [],
          returnType: 'Array<{ id, name, description?, ruleCount }>',
        },
        {
          name: 'getPresetById',
          description: '获取单个预设的详细信息',
          parameters: [
            {
              name: 'presetId',
              type: 'string',
              description: '预设ID',
              required: true,
            },
          ],
          returnType: 'PresetDetail | null',
        },
      ],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: '正则批量替换',
  path: '/regex-applier',
  icon: markRaw(MagicStick),
  component: () => import('./RegexApplier.vue'),
  description: '使用正则表达式批量处理文本或文件',
  category: '文本处理'
};