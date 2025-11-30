/**
 * 目录树工具的配置管理模块
 * 负责自定义过滤规则的持久化存储
 */

import { createConfigManager, ConfigManager } from '../../utils/configManager';

const CONFIG_VERSION = '1.0.0';

/**
 * 目录树统计信息接口
 */
export interface TreeStats {
  total_dirs: number;
  total_files: number;
  filtered_dirs: number;
  filtered_files: number;
  show_files: boolean;
  show_hidden: boolean;
  max_depth: string;
  filter_count: number;
}

/**
 * 目录树配置接口
 */
export interface DirectoryTreeConfig {
  /** 自定义过滤规则 */
  customPatterns: string;
  /** 上次使用的过滤模式 */
  lastFilterMode: 'none' | 'gitignore' | 'custom' | 'both';
  /** 上次使用的目标路径 */
  lastTargetPath: string;
  /** 上次的显示选项 */
  showFiles: boolean;
  showHidden: boolean;
  showSize: boolean;
  showDirSize: boolean;
  /** 上次的深度限制 */
  maxDepth: number;
  /** 拖拽后是否自动生成 */
  autoGenerateOnDrop: boolean;
  /** 输出时是否包含配置和统计信息 */
  includeMetadata: boolean;
  /** 上次生成的目录树结果 */
  lastTreeResult?: string;
  /** 上次生成的统计信息 */
  lastStatsInfo?: TreeStats | null;
  /** 配置版本 */
  version: string;
}

/**
 * 创建默认配置
 */
function createDefaultConfig(): DirectoryTreeConfig {
  return {
    customPatterns: '# 自定义过滤规则示例\nnode_modules\n.git\ndist\nbuild\n*.log',
    lastFilterMode: 'none',
    lastTargetPath: '',
    showFiles: true,
    showHidden: false,
    showSize: false,  // 默认不显示文件大小
    showDirSize: false, // 默认不显示目录大小
    maxDepth: 5,
    autoGenerateOnDrop: true,  // 默认开启自动生成
    includeMetadata: false,  // 默认不包含元数据
    lastTreeResult: '',
    lastStatsInfo: null,
    version: CONFIG_VERSION
  };
}

/**
 * 创建配置管理器实例
 */
const configManager: ConfigManager<DirectoryTreeConfig> = createConfigManager({
  moduleName: 'directory_tree',
  fileName: 'config.json',
  version: CONFIG_VERSION,
  createDefault: createDefaultConfig
  // 使用默认的合并逻辑即可，因为这个配置没有嵌套对象
});

/**
 * 加载配置
 */
export async function loadConfig(): Promise<DirectoryTreeConfig> {
  return configManager.load();
}

/**
 * 保存配置
 */
export async function saveConfig(config: DirectoryTreeConfig): Promise<void> {
  return configManager.save(config);
}

/**
 * 更新配置的部分字段
 */
export async function updateConfig(updates: Partial<DirectoryTreeConfig>): Promise<void> {
  await configManager.update(updates);
}