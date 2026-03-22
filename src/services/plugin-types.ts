/**
 * 插件系统核心类型定义
 *
 * 定义了插件清单、插件接口和相关的管理类型
 */

import type { ToolRegistry, MethodMetadata, ServiceMetadata } from './types';
import type { SettingItem } from '@/types/settings-renderer';

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
 * 配置项类型（保留用于向后兼容）
 * @deprecated 请直接使用 SettingItem 类型
 */
export type SettingsPropertyType = 'string' | 'number' | 'boolean';

/**
 * 配置项定义（保留用于向后兼容）
 * @deprecated 请直接使用 SettingItem 类型
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
 *
 * 插件可以直接使用 SettingItem 类型来定义配置项，以获得更丰富的 UI 渲染能力
 */
export interface SettingsSchema {
  /** 配置模式版本 */
  version: string;
  /** 配置项定义 - 支持完整的 SettingItem 配置 */
  properties: Record<string, SettingItem | SettingsProperty>;
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
  /** 标签列表，用于分类和搜索 */
  tags?: string[];
  /** 主机要求 */
  host: {
    /** 应用版本要求 (semver) */
    appVersion: string;
    /** 插件 API 版本要求 (整数) */
    apiVersion?: number;
  };
  
  /** 插件类型 */
  type: PluginType;
  
  /** JS 插件入口文件 (type='javascript' 时必需) */
  main?: string;
  
  /** Sidecar 配置 (type='sidecar' 时必需) */
  sidecar?: SidecarConfig;
  
  /** 原生插件配置 (type='native' 时必需) */
  native?: NativeConfig;
  
  /**
   * 插件方法元数据声明
   *
   * 对于 Native 和 Sidecar 插件，这是声明可用方法的唯一方式。
   * 对于 JS 插件，如果 index.ts 没有导出 getMetadata()，则以此处声明为准。
   */
  methods?: MethodMetadata[];
  
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
/**
 * 插件上下文对象
 *
 * 该对象作为 activate 钩子的参数被注入，为插件提供与宿主应用交互的核心 API
 */
export interface PluginContext {
  /**
   * 聊天上下文管道 API
   */
  chat: {
    /**
     * 注册一个上下文处理器
     * @param processor 要注册的处理器对象
     */
    registerProcessor: (processor: any) => void;
    /**
     * 注销一个上下文处理器
     * @param processorId 处理器 ID
     */
    unregisterProcessor: (processorId: string) => void;
  };

  // 未来可扩展其他 API，例如 ui.showNotification, commands.registerCommand 等
}


/**
 * JavaScript 插件导出对象
 *
 * JS 插件必须 export default 一个实现此接口的对象
 */
export interface JsPluginExport {
  /**
   * 【可选】插件激活钩子
   *
   * 当插件被加载并启用时调用。这是插件注册监听器、处理器或执行初始化设置的理想位置。
   * @param context 插件上下文对象，包含与宿主应用交互的 API
   */
  activate?: (context: PluginContext) => Promise<void> | void;

  /**
   * 【可选】插件停用钩子
   *
   * 当插件被禁用或卸载时调用。用于清理资源，例如注销监听器或处理器。
   */
  deactivate?: () => Promise<void> | void;

  /**
   * 【可选】获取服务元数据
   *
   * JS 插件可以通过此方法动态返回方法声明，而无需在 manifest.json 中重复定义。
   * 格式应与内置工具的 getMetadata() 一致。
   */
  getMetadata?: () => ServiceMetadata;

  [methodName: string]: ((...args: any[]) => any) | undefined;
}

/**
 * 插件代理接口
 *
 * 将插件包装成符合 ToolRegistry 接口的代理对象
 */
export interface PluginProxy extends ToolRegistry {
  /** 插件清单 */
  manifest: PluginManifest;
  /** 插件安装路径 */
  installPath: string;
  /** 插件图标 URL (Emoji 或转换后的图片 URL) */
  iconUrl?: string;
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
    /** 插件 API 版本要求 (整数) */
    apiVersion?: number;
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