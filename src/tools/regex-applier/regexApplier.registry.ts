import type { ToolRegistry, ToolConfig } from '@/services/types';
import { markRaw } from 'vue';
import { MagicStick } from '@element-plus/icons-vue';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import { customMessage } from '@/utils/customMessage';
import { applyRules, validateRegex } from './engine';
import { usePresetStore } from './store';
import type { LogEntry, RegexRule } from './types';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { invoke } from '@tauri-apps/api/core';

const logger = createModuleLogger('services/regex-applier');
const errorHandler = createModuleErrorHandler('services/regex-applier');

// ==================== 类型定义 ====================

/** 文本处理选项 */
export interface TextProcessOptions {
  /** 源文本 */
  sourceText: string;
  /** 预设ID列表（按顺序应用） */
  presetIds: string[];
}

/** 文本处理结果 */
export interface TextProcessResult {
  /** 处理后的文本 */
  text: string;
  /** 应用的规则总数 */
  totalRulesApplied: number;
  /** 日志条目 */
  logs: LogEntry[];
}

/** 文件处理选项 */
export interface FileProcessOptions {
  /** 文件路径列表 */
  filePaths: string[];
  /** 输出目录 */
  outputDir: string;
  /** 预设ID列表（按顺序应用） */
  presetIds: string[];
  /** 是否强制保存为 .txt */
  forceTxt?: boolean;
  /** 文件名后缀 */
  filenameSuffix?: string;
}

/** 文件处理结果（来自 Rust 后端） */
export interface FileProcessResult {
  /** 成功处理的文件数 */
  success_count: number;
  /** 失败的文件数 */
  error_count: number;
  /** 总匹配次数 */
  total_matches: number;
  /** 处理耗时（毫秒） */
  duration_ms: number;
  /** 错误映射表 */
  errors?: Record<string, string>;
  /** 后端日志 */
  logs?: Array<{ level: string; message: string }>;
}

/** 格式化的处理摘要 */
export interface FormattedProcessSummary {
  /** 摘要信息 */
  summary: string;
  /** 详细信息 */
  details: {
    /** 成功数 */
    successCount: number;
    /** 失败数 */
    errorCount?: number;
    /** 总匹配数 */
    totalMatches?: number;
    /** 耗时 */
    duration?: string;
    /** 应用的规则数 */
    rulesApplied?: number;
  };
}

/** 一键处理选项 */
export interface OneClickOptions {
  /** 预设ID列表 */
  presetIds: string[];
}

// ==================== 服务类 ====================

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
    logger.info('开始处理文本', {
      textLength: options.sourceText.length,
      presetCount: options.presetIds.length,
    });

    return await errorHandler.wrapAsync(
      async () => {
        if (!options.sourceText) {
          return {
            text: '',
            totalRulesApplied: 0,
            logs: [],
          };
        }

        if (options.presetIds.length === 0) {
          return {
            text: options.sourceText,
            totalRulesApplied: 0,
            logs: [],
          };
        }

        let result = options.sourceText;
        let totalRulesApplied = 0;
        const allLogs: LogEntry[] = [];

        // 按顺序应用每个预设
        for (const presetId of options.presetIds) {
          const preset = this.store.presets.find((p) => p.id === presetId);
          if (preset) {
            const enabledRules = preset.rules.filter((r) => r.enabled);
            const applyResult = applyRules(result, enabledRules);
            result = applyResult.text;
            totalRulesApplied += applyResult.appliedRulesCount;

            // 收集日志
            allLogs.push(...applyResult.logs);
          }
        }

        logger.info('文本处理完成', {
          totalRulesApplied,
          logCount: allLogs.length,
          resultLength: result.length,
        });

        return {
          text: result,
          totalRulesApplied,
          logs: allLogs,
        };
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '文本处理失败',
        context: options,
      }
    );
  }

  /**
   * 处理文件（调用 Rust 后端）
   */
  public async processFiles(options: FileProcessOptions): Promise<FileProcessResult | null> {
    logger.info('开始处理文件', {
      fileCount: options.filePaths.length,
      presetCount: options.presetIds.length,
      outputDir: options.outputDir,
    });

    return await errorHandler.wrapAsync(
      async () => {
        // 收集所有选中预设的启用规则
        const allRules: Array<RegexRule & { preset_name: string }> = [];
        for (const presetId of options.presetIds) {
          const preset = this.store.presets.find((p) => p.id === presetId);
          if (preset) {
            const enabledRules = preset.rules.filter((r) => r.enabled);
            const rulesWithPreset = enabledRules.map((r) => ({
              ...r,
              preset_name: preset.name,
            }));
            allRules.push(...rulesWithPreset);
          }
        }

        if (allRules.length === 0) {
          throw new Error('所选预设中没有启用的规则');
        }

        // 准备调用后端的规则数据
        const rulesForBackend = allRules.map((r) => ({
          regex: r.regex,
          replacement: r.replacement,
          name: r.name,
          preset_name: r.preset_name,
        }));

        logger.debug('调用 Rust 后端处理文件', {
          fileCount: options.filePaths.length,
          ruleCount: rulesForBackend.length,
        });

        // 调用 Tauri 后端
        const result = await invoke<FileProcessResult>('process_files_with_regex', {
          filePaths: options.filePaths,
          outputDir: options.outputDir,
          rules: rulesForBackend,
          forceTxt: options.forceTxt ?? false,
          filenameSuffix: options.filenameSuffix ?? '',
        });

        logger.info('文件处理完成', {
          successCount: result.success_count,
          errorCount: result.error_count,
          totalMatches: result.total_matches,
          duration: `${result.duration_ms?.toFixed(2)}ms`,
        });

        return result;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '文件处理失败',
        context: options,
      }
    );
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
        level: ErrorLevel.ERROR,
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
        level: ErrorLevel.ERROR,
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
        level: ErrorLevel.ERROR,
        userMessage: '一键处理失败',
        context: options,
      }
    );
  }

  /**
   * 验证正则表达式
   */
  public validateRegex(pattern: string): { valid: boolean; error?: string } {
    return validateRegex(pattern);
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
              properties: [
                {
                  name: 'sourceText',
                  type: 'string',
                  description: '源文本',
                  required: true,
                },
                {
                  name: 'presetIds',
                  type: 'string[]',
                  description: '预设ID列表（按顺序应用）',
                  required: true,
                },
              ],
            },
          ],
          returnType: 'Promise<TextProcessResult | null>',
          example: `
const result = await service.processText({
  sourceText: '待处理的文本',
  presetIds: ['preset-1', 'preset-2']
});
// 返回: { text, totalRulesApplied, logs }`,
        },
        {
          name: 'processFiles',
          description: '批量处理文件（调用 Rust 后端）',
          parameters: [
            {
              name: 'options',
              type: 'FileProcessOptions',
              description: '文件处理选项',
              properties: [
                {
                  name: 'filePaths',
                  type: 'string[]',
                  description: '文件路径列表',
                  required: true,
                },
                {
                  name: 'outputDir',
                  type: 'string',
                  description: '输出目录',
                  required: true,
                },
                {
                  name: 'presetIds',
                  type: 'string[]',
                  description: '预设ID列表',
                  required: true,
                },
                {
                  name: 'forceTxt',
                  type: 'boolean',
                  description: '是否强制保存为 .txt',
                  required: false,
                  defaultValue: false,
                },
                {
                  name: 'filenameSuffix',
                  type: 'string',
                  description: '文件名后缀',
                  required: false,
                  defaultValue: '',
                },
              ],
            },
          ],
          returnType: 'Promise<FileProcessResult | null>',
          example: `
const result = await service.processFiles({
  filePaths: ['/path/to/file1.txt', '/path/to/file2.txt'],
  outputDir: '/path/to/output',
  presetIds: ['preset-1'],
  forceTxt: false,
  filenameSuffix: '_processed'
});
// 返回: { success_count, error_count, total_matches, duration_ms }`,
        },
        {
          name: 'oneClickProcess',
          description: '一键处理：粘贴 -> 处理 -> 复制',
          parameters: [
            {
              name: 'options',
              type: 'OneClickOptions',
              description: '一键处理选项',
              properties: [
                {
                  name: 'presetIds',
                  type: 'string[]',
                  description: '预设ID列表',
                  required: true,
                },
              ],
            },
          ],
          returnType: 'Promise<FormattedProcessSummary | null>',
          example: `
const result = await service.oneClickProcess({
  presetIds: ['preset-1', 'preset-2']
});
// 返回: { summary, details: { successCount, rulesApplied } }`,
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
          example: `
const result = await service.getFormattedTextResult({
  sourceText: '待处理的文本',
  presetIds: ['preset-1']
});
// 返回: { summary: '处理完成...', details: { successCount, rulesApplied } }`,
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
          example: `
const result = await service.getFormattedFileResult({
  filePaths: ['/path/to/file.txt'],
  outputDir: '/path/to/output',
  presetIds: ['preset-1']
});
// 返回: { summary, details: { successCount, errorCount, totalMatches, duration } }`,
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
          example: `
const validation = service.validateRegex('[a-z]+');
// 返回: { valid: true } 或 { valid: false, error: '错误信息' }`,
        },
        {
          name: 'getPresets',
          description: '获取所有预设列表（简化信息）',
          parameters: [],
          returnType: 'Array<{ id, name, description?, ruleCount }>',
          example: `
const presets = service.getPresets();
// 返回: [{ id: 'preset-1', name: '预设1', description: '...', ruleCount: 5 }, ...]`,
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
          example: `
const preset = service.getPresetById('preset-1');
// 返回: { id, name, description, rules: [...], createdAt, updatedAt } 或 null`,
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