/**
 * 插件系统核心类型定义
 * 
 * 定义了插件清单、插件接口和相关的管理类型
 */

import type { ToolService, MethodMetadata } from './types';

// ==================== 插件清单类型 ====================

/**
 * 插件 UI 配置
 */
export interface PluginUiConfig {
  /** 显示名称, 如果不提供则使用插件主名称 */
  displayName?: string;
  /** UI 组件入口文件 (相对于插件根目录的路径，需为编译后的 ESM JS 文件) */
  component: string;
  /**
   * 图标配置
   * - Emoji: 单个 emoji 字符 (例如 "🎨")
   * - SVG 路径: 相对于插件根目录的 SVG 文件路径 (例如 "icon.svg")
   * - 图片路径: 相对于插件根目录的图片文件路径 (例如 "icon.png")
   */
  icon?: string;
}

/**
 * 插件类型
 */
export type PluginType = 'javascript' | 'sidecar' | 'native';

/**
 * 配置项类型
 */
export type SettingsPropertyType = 'string' | 'number' | 'boolean';

/**
 * 配置项定义
 */
export interface SettingsProperty {
  /** 配置项类型 */
  type: SettingsPropertyType;
  /** 默认值 */
  default: string | number | boolean;
  /** 显示标签 */
  label: string;
  /** 详细描述 */
  description?: string;
  /** 是否为敏感信息（如密码、API Key） */
  secret?: boolean;
  /** 可选值列表（用于下拉选择） */
  enum?: string[];
}

/**
 * 插件配置模式
 */
export interface SettingsSchema {
  /** 配置模式版本 */
  version: string;
  /** 配置项定义 */
  properties: Record<string, SettingsProperty>;
}

/**
 * 平台标识符 (OS-架构)
 */
export type PlatformKey = 'win32-x64' | 'win32-arm64' | 'darwin-x64' | 'darwin-arm64' | 'linux-x64' | 'linux-arm64';

/**
 * Sidecar 插件配置
 */
export interface SidecarConfig {
  /** 按平台指定可执行文件路径 */
  executable: Partial<Record<PlatformKey, string>>;
  /** 命令行参数模板 */
  args?: string[];
}

/**
 * 原生插件配置
 */
export interface NativeConfig {
  /** 按平台指定动态库文件路径 */
  library: Partial<Record<PlatformKey, string>>;
  /**
   * 是否支持运行时安全重载
   *
   * 如果为 true，插件管理器将允许在不重启应用的情况下禁用和重新启用插件。
   * 这要求插件本身是无状态的，或者能够正确处理资源的清理和重新初始化。
   *
   * @default false
   */
  reloadable?: boolean;
}

/**
 * 插件清单 (manifest.json)
 */
export interface PluginManifest {
  /** 插件唯一标识符 */
  id: string;
  /** 插件显示名称 */
  name: string;
  /** 插件版本 */
  version: string;
  /** 插件描述 */
  description: string;
  /** 作者名 */
  author: string;
  /** 插件图标（可以是emoji、图片URL或appdata://路径） */
  icon?: string;
  /** 主机要求 */
  host: {
    /** 应用版本要求 (semver) */
    appVersion: string;
  };
  
  /** 插件类型 */
  type: PluginType;
  
  /** JS 插件入口文件 (type='javascript' 时必需) */
  main?: string;
  
  /** Sidecar 配置 (type='sidecar' 时必需) */
  sidecar?: SidecarConfig;
  
  /** 原生插件配置 (type='native' 时必需) */
  native?: NativeConfig;
  
  /** 暴露的方法列表 */
  methods: MethodMetadata[];
  
  /** 配置模式 (可选) */
  settingsSchema?: SettingsSchema;
  
  /** UI 配置 (可选) */
  ui?: PluginUiConfig;
  
  /** 权限声明 (未来功能) */
  permissions?: string[];
}

// ==================== 插件接口 ====================

/**
 * JavaScript 插件导出对象
 * 
 * JS 插件必须 export default 一个实现此接口的对象
 */
export interface JsPluginExport {
  [methodName: string]: (...args: any[]) => any;
}

/**
 * 插件代理接口
 *
 * 将插件包装成符合 ToolService 接口的代理对象
 */
export interface PluginProxy extends ToolService {
  /** 插件清单 */
  manifest: PluginManifest;
  /** 插件安装路径 */
  installPath: string;
  /** 插件是否已启用 */
  enabled: boolean;
  /** 是否为开发模式插件 */
  devMode: boolean;
  /** 启用插件 */
  enable(): Promise<void>;
  /** 禁用插件 */
  disable(): void;
}

// ==================== 插件加载与管理 ====================

/**
 * 插件安装信息
 */
export interface InstalledPlugin {
  /** 插件清单 */
  manifest: PluginManifest;
  /** 安装路径 (绝对路径) */
  installPath: string;
  /** 是否已启用 */
  enabled: boolean;
  /** 安装时间 */
  installedAt: number;
}

/**
 * 插件市场索引项
 */
export interface MarketPluginEntry {
  /** 插件 ID */
  id: string;
  /** 插件名称 */
  name: string;
  /** 版本 */
  version: string;
  /** 描述 */
  description: string;
  /** 作者 */
  author: string;
  /** 插件类型 */
  type: PluginType;
  /** 下载 URL (按平台) */
  downloadUrls: Partial<Record<PlatformKey, string>>;
  /** 支持的平台 */
  supportedPlatforms: PlatformKey[];
  /** 主机要求 */
  host: {
    appVersion: string;
  };
}

/**
 * 插件市场索引
 */
export interface PluginMarketIndex {
  /** 索引版本 */
  version: string;
  /** 最后更新时间 */
  updatedAt: number;
  /** 插件列表 */
  plugins: MarketPluginEntry[];
}

/**
 * 插件加载选项
 */
export interface PluginLoadOptions {
  /** 是否为开发模式 */
  devMode: boolean;
  /** 开发模式下的插件源码目录 (相对于项目根目录) */
  devPluginsDir?: string;
  /** 生产模式下的插件安装目录 (绝对路径) */
  prodPluginsDir?: string;
}

/**
 * 插件加载结果
 */
export interface PluginLoadResult {
  /** 成功加载的插件代理列表 */
  plugins: PluginProxy[];
  /** 加载失败的插件列表 */
  failed: Array<{
    id: string;
    path: string;
    error: Error;
  }>;
}