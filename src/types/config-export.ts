/**
 * 配置导出相关的类型定义
 */

/**
 * 配置导出结构
 */
export interface ConfigExport {
  /** 导出时间戳 */
  timestamp: string;
  /** 应用版本 */
  app_version: string;
  /** 所有模块的配置 */
  configs: Record<string, Record<string, any>>;
}

/**
 * 配置文件列表
 */
export type ConfigFileList = Record<string, string[]>;