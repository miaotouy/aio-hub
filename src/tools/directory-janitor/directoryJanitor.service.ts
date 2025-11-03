import type { ToolService } from '@/services/types';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import { useDirectoryJanitorRunner, type ScanOptions, type FormattedScanResult } from './composables/useDirectoryJanitorRunner';
import { formatBytes } from './utils';

const logger = createModuleLogger('services/directory-janitor');
const errorHandler = createModuleErrorHandler('services/directory-janitor');

// ==================== Agent 调用接口类型 ====================

/**
 * 扫描目录选项
 */
export interface ScanDirectoryOptions extends ScanOptions {
  /** （可选）是否返回详细信息，默认 false */
  includeDetails?: boolean;
}

/**
 * 清理项目选项
 */
export interface CleanupItemsOptions {
  /** 要清理的文件/目录路径列表 */
  paths: string[];
}

/**
 * 格式化的清理结果
 */
export interface FormattedCleanupResult {
  summary: string;
  details: {
    successCount: number;
    errorCount: number;
    freedSpace: number;
    errors: string[];
  };
}

// ==================== 服务类 ====================

/**
 * 目录清道夫服务
 *
 * 提供无状态的目录扫描和清理接口：
 * 1. `scanDirectory`: 扫描目录并返回符合条件的文件和目录列表
 * 2. `cleanupItems`: 清理指定的文件和目录（移动到回收站）
 * 3. `scanAndCleanup`: 扫描并清理 - 一步到位
 *
 * UI 层通过 useDirectoryJanitorState 和 useDirectoryJanitorRunner composables 管理状态和业务逻辑
 */
export default class DirectoryJanitorService implements ToolService {
  public readonly id = 'directory-janitor';
  public readonly name = '目录清道夫';
  public readonly description = '扫描和清理目录中的过期文件和大文件';

  // ==================== 高级封装方法 (Agent 调用接口) ====================

  /**
   * [Agent Friendly] 扫描目录并返回格式化结果
   * 一次性调用，返回符合条件的文件和目录列表
   */
  public async scanDirectory(
    options: ScanDirectoryOptions
  ): Promise<FormattedScanResult | null> {
    const { includeDetails = false, ...scanOptions } = options;
    logger.info('开始扫描目录 (Agent 调用)', scanOptions);

    return await errorHandler.wrapAsync(
      async () => {
        // 创建临时的 runner
        const runner = useDirectoryJanitorRunner();
        await runner.initialize();

        try {
          // 执行扫描
          await runner.analyzePath(scanOptions);

          // 返回格式化结果
          const result = runner.getFormattedScanResult();
          
          logger.info('扫描目录完成', {
            summary: result.summary,
            totalItems: result.details.totalItems,
          });

          // 如果不需要详细信息，只返回摘要
          if (!includeDetails) {
            return {
              summary: result.summary,
              details: {
                ...result.details,
                items: [], // 不返回完整的项目列表
              },
            };
          }

          return result;
        } finally {
          await runner.dispose();
        }
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '扫描目录失败',
        context: options,
      }
    );
  }

  /**
   * [Agent Friendly] 清理指定的文件和目录
   * 将项目移动到回收站
   */
  public async cleanupItems(
    options: CleanupItemsOptions
  ): Promise<FormattedCleanupResult | null> {
    const { paths } = options;
    logger.info('开始清理项目 (Agent 调用)', {
      pathsCount: paths.length,
    });

    return await errorHandler.wrapAsync(
      async () => {
        // 创建临时的 runner
        const runner = useDirectoryJanitorRunner();
        await runner.initialize();

        try {
          // 执行清理
          const result = await runner.cleanupItems(paths);
          
          if (!result) {
            return null;
          }

          // 格式化结果
          const summary = result.errorCount > 0
            ? `清理完成: ${result.successCount} 项成功，${result.errorCount} 项失败，释放 ${formatBytes(result.freedSpace)}`
            : `清理完成: ${result.successCount} 项成功，释放 ${formatBytes(result.freedSpace)}`;

          logger.info('清理项目完成', {
            summary,
            successCount: result.successCount,
            errorCount: result.errorCount,
          });

          return {
            summary,
            details: {
              successCount: result.successCount,
              errorCount: result.errorCount,
              freedSpace: result.freedSpace,
              errors: result.errors,
            },
          };
        } finally {
          await runner.dispose();
        }
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '清理项目失败',
        context: options,
      }
    );
  }

  /**
   * [Agent Friendly] 扫描并清理 - 一步到位
   * 先扫描，然后清理所有找到的项目
   */
  public async scanAndCleanup(
    scanOptions: ScanDirectoryOptions
  ): Promise<{
    scanResult: FormattedScanResult;
    cleanupResult: FormattedCleanupResult;
  } | null> {
    logger.info('开始扫描并清理 (Agent 调用)', scanOptions);

    return await errorHandler.wrapAsync(
      async () => {
        // 创建临时的 runner
        const runner = useDirectoryJanitorRunner();
        await runner.initialize();

        try {
          // 执行扫描
          await runner.analyzePath(scanOptions);

          // 获取扫描结果
          const scanResult = runner.getFormattedScanResult();

          // 如果没有找到项目，直接返回
          if (scanResult.details.totalItems === 0) {
            return {
              scanResult,
              cleanupResult: {
                summary: '没有需要清理的项目',
                details: {
                  successCount: 0,
                  errorCount: 0,
                  freedSpace: 0,
                  errors: [],
                },
              },
            };
          }

          // 清理所有找到的项目
          const paths = scanResult.details.items.map((item) => item.path);
          const cleanupRawResult = await runner.cleanupItems(paths);

          if (!cleanupRawResult) {
            return null;
          }

          // 格式化清理结果
          const cleanupSummary = cleanupRawResult.errorCount > 0
            ? `清理完成: ${cleanupRawResult.successCount} 项成功，${cleanupRawResult.errorCount} 项失败，释放 ${formatBytes(cleanupRawResult.freedSpace)}`
            : `清理完成: ${cleanupRawResult.successCount} 项成功，释放 ${formatBytes(cleanupRawResult.freedSpace)}`;

          const cleanupResult: FormattedCleanupResult = {
            summary: cleanupSummary,
            details: {
              successCount: cleanupRawResult.successCount,
              errorCount: cleanupRawResult.errorCount,
              freedSpace: cleanupRawResult.freedSpace,
              errors: cleanupRawResult.errors,
            },
          };

          logger.info('扫描并清理完成', {
            scanSummary: scanResult.summary,
            cleanupSummary: cleanupResult.summary,
          });

          return {
            scanResult,
            cleanupResult,
          };
        } finally {
          await runner.dispose();
        }
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '扫描并清理失败',
        context: scanOptions,
      }
    );
  }

  // ==================== 元数据 ====================

  /**
   * 获取服务元数据
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'scanDirectory',
          description: '[Agent 调用] 扫描目录并返回符合条件的文件和目录列表',
          parameters: [
            {
              name: 'options',
              type: 'ScanDirectoryOptions',
              description: '扫描选项',
              properties: [
                {
                  name: 'path',
                  type: 'string',
                  description: '要扫描的目录路径',
                  required: true,
                },
                {
                  name: 'namePattern',
                  type: 'string',
                  description: '（可选）名称匹配模式（支持通配符）',
                  required: false,
                },
                {
                  name: 'minAgeDays',
                  type: 'number',
                  description: '（可选）最小年龄（天）',
                  required: false,
                },
                {
                  name: 'minSizeMB',
                  type: 'number',
                  description: '（可选）最小大小（MB）',
                  required: false,
                },
                {
                  name: 'maxDepth',
                  type: 'number',
                  description: '（可选）最大扫描深度（默认 5）',
                  required: false,
                  defaultValue: 5,
                },
                {
                  name: 'includeDetails',
                  type: 'boolean',
                  description: '（可选）是否返回详细信息（包含完整的项目列表），默认 false',
                  required: false,
                  defaultValue: false,
                },
              ],
            },
          ],
          returnType: 'Promise<FormattedScanResult | null>',
          example: `
const result = await service.scanDirectory({
  path: 'C:/Users/Miaomiao/Downloads',
  namePattern: '*.tmp',
  minAgeDays: 7,
  minSizeMB: 10,
  maxDepth: 2,
  includeDetails: true
});

if (result) {
  console.log(result.summary);
  // "扫描完成: 找到 15 项（3 个目录，12 个文件），共 256.5 MB"
  
  console.log(result.details);
  // {
  //   totalItems: 15,
  //   totalSize: 268931072,
  //   totalDirs: 3,
  //   totalFiles: 12,
  //   items: [...]  // 仅当 includeDetails=true 时返回
  // }
}`,
        },
        {
          name: 'cleanupItems',
          description: '[Agent 调用] 清理指定的文件和目录（移动到回收站）',
          parameters: [
            {
              name: 'options',
              type: 'CleanupItemsOptions',
              description: '清理选项',
              properties: [
                {
                  name: 'paths',
                  type: 'string[]',
                  description: '要清理的文件/目录路径列表',
                  required: true,
                },
              ],
            },
          ],
          returnType: 'Promise<FormattedCleanupResult | null>',
          example: `
const result = await service.cleanupItems({
  paths: [
    'C:/Users/Miaomiao/Downloads/old-file.tmp',
    'C:/Users/Miaomiao/Downloads/cache-folder'
  ]
});

if (result) {
  console.log(result.summary);
  // "清理完成: 2 项成功，释放 50.5 MB"
  
  console.log(result.details);
  // {
  //   successCount: 2,
  //   errorCount: 0,
  //   freedSpace: 52953088,
  //   errors: []
  // }
}`,
        },
        {
          name: 'scanAndCleanup',
          description: '[Agent 调用] 扫描并清理 - 一步到位。先扫描目录，然后清理所有找到的项目。',
          parameters: [
            {
              name: 'options',
              type: 'ScanDirectoryOptions',
              description: '扫描选项（同 scanDirectory）',
              properties: [
                {
                  name: 'path',
                  type: 'string',
                  description: '要扫描的目录路径',
                  required: true,
                },
                {
                  name: 'namePattern',
                  type: 'string',
                  description: '（可选）名称匹配模式',
                  required: false,
                },
                {
                  name: 'minAgeDays',
                  type: 'number',
                  description: '（可选）最小年龄（天）',
                  required: false,
                },
                {
                  name: 'minSizeMB',
                  type: 'number',
                  description: '（可选）最小大小（MB）',
                  required: false,
                },
                {
                  name: 'maxDepth',
                  type: 'number',
                  description: '（可选）最大扫描深度',
                  required: false,
                  defaultValue: 5,
                },
              ],
            },
          ],
          returnType: 'Promise<{ scanResult: FormattedScanResult; cleanupResult: FormattedCleanupResult } | null>',
          example: `
const result = await service.scanAndCleanup({
  path: '%AppData%/Code/User/globalStorage/kilocode.kilo-code/tasks',
  namePattern: 'checkpoints',
  minAgeDays: 7,
  maxDepth: 2
});

if (result) {
  console.log(result.scanResult.summary);
  // "扫描完成: 找到 5 项（5 个目录，0 个文件），共 512 MB"
  
  console.log(result.cleanupResult.summary);
  // "清理完成: 5 项成功，释放 512 MB"
}`,
        },
      ],
    };
  }
}