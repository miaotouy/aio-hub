/**
 * 工具服务基础接口定义
 *
 * 所有工具服务都应该实现此接口，以确保统一的服务契约。
 */

export interface MethodParameter {
  name: string;
  type: string; // 例如: 'string', 'number', 'GenerateTreeOptions'
  description?: string;
  /** 是否为必填参数，默认为 true */
  required?: boolean;
  defaultValue?: any;
  /** UI 提示，用于指导前端渲染特定的输入组件 (如 'path', 'model', 'textarea', 'json' 等) */
  uiHint?: string;
  /** 当 type 为对象类型时，描述对象的属性 */
  properties?: MethodParameter[];
}

export interface MethodMetadata {
  name: string;
  /** 所属工具/插件的显示名称 */
  toolName?: string;
  /** 方法的显示名称，用于 UI 或对外暴露时的友好名称 */
  displayName?: string;
  description?: string;
  parameters: MethodParameter[];
  returnType: string; // 例如: 'Promise<string>', 'void'
  /** 方法调用示例 */
  example?: string;
  /** 是否允许 Agent/LLM 调用此方法，默认 false */
  agentCallable?: boolean;
  /** 是否允许通过 VCP 分布式节点暴露此方法，默认 false */
  distributedExposed?: boolean;
  /** 协议特定配置 */
  protocolConfig?: {
    /** VCP 协议的命令名称映射 */
    vcpCommand?: string;
  };
  /**
   * 方法执行模式
   * - 'sync': 同步执行（默认）
   * - 'async': 异步执行（返回任务 ID）
   */
  executionMode?: "sync" | "async";
  /**
   * 异步任务配置（仅当 executionMode === 'async' 时有效）
   */
  asyncConfig?: {
    /** 是否支持进度汇报 */
    hasProgress?: boolean;
    /** 是否支持中途取消 */
    cancellable?: boolean;
    /** 预估执行时间（秒） */
    estimatedDuration?: number;
  };
}

export interface ServiceMetadata {
  methods: MethodMetadata[];
}

import type { Component } from "vue";
import type { DetachableComponentRegistration } from "@/types/detachable";
import type { AssetSidecarAction } from "@/types/asset-management";
import type { SettingItem } from "@/types/settings-renderer";

export interface StartupConfig {
  /** 启动项的显示名称 */
  label: string;
  /** 启动项的详细描述 */
  description?: string;
  /** 是否默认启用自启动 */
  defaultEnabled?: boolean;
}

export interface ToolConfig {
  name: string;
  path: string;
  icon: Component;
  component: () => Promise<any>; // 组件动态导入函数
  description?: string;
  category?: string;
  /**
   * 工具运行模式
   * - 'main-only': 仅在主窗口运行（默认，保守策略）
   * - 'any': 可以在任何窗口（包括分离窗口）运行
   */
  runMode?: "main-only" | "any";
}

/**
 * Agent 扩展基础接口
 *
 * 用于定义 Agent 的生命周期管理和 Prompt 上下文注入能力。
 * 它是 ToolRegistry 的基类。
 */
export interface AgentExtension {
  /**
   * 扩展的唯一标识符
   * @example 'system-info'
   */
  readonly id: string;

  /**
   * 扩展的显示名称（可选）
   */
  readonly name?: string;

  /**
   * 扩展描述（可选）
   */
  readonly description?: string;

  /**
   * 初始化方法，在注册时由 ToolRegistryManager 调用。
   */
  initialize?(): Promise<void> | void;

  /**
   * 销毁方法，在应用关闭或热重载时调用。
   */
  dispose?(): void;

  /**
   * 允许扩展提供额外的 Prompt 上下文。
   * 用于向 Agent 注入当前环境信息、运行时状态或操作指南。
   * @param context 可选的运行时上下文（由上层解析并下推）
   */
  getExtraPromptContext?(context?: AgentExtensionContext): string | Promise<string>;
}

/**
 * Agent 扩展上下文（配置下推模式）
 * 由中间层解析 Agent 配置后传递给工具
 */
export interface AgentExtensionContext {
  /**
   * 当前工具的特定配置分片
   * 从 agent.toolCallConfig.toolSettings[extensionId] 提取
   */
  toolSettings?: Record<string, any>;
}

export interface ToolRegistry extends AgentExtension {
  /**
   * 工具运行模式
   * - 'main-only': 仅在主窗口运行（默认，保守策略）
   * - 'any': 可以在任何窗口（包括分离窗口）运行
   */
  readonly runMode?: "main-only" | "any";

  /**
   * 当用户在 UI 上明确拒绝某个工具调用请求时触发。
   * 用于清理内存缓冲区、撤销临时状态等预览数据。
   * @param requestId 请求唯一标识
   * @param methodName 被调用的方法名
   * @param args 原始调用参数
   */
  onToolCallDiscarded?(requestId: string, methodName: string, args: Record<string, any>): void | Promise<void>;

  /**
   * 当工具调用进入待定（审批）状态前触发。
   * 用于实现“自动预览”功能，工具可以在此阶段将数据写入内存缓冲区。
   * @param requestId 请求唯一标识
   * @param methodName 被调用的方法名
   * @param args 原始调用参数
   */
  onToolCallPreview?(requestId: string, methodName: string, args: Record<string, any>): void | Promise<void>;

  /**
   * 提供工具的元数据，用于工具监控、文档生成和未来的工具调用。
   * 这是可选的，但强烈推荐实现。
   */
  getMetadata?(): ServiceMetadata;

  /**
   * 工具提供的可分离组件配置
   * Key 为组件的唯一标识符（建议使用 namespaced ID，如 'llm-chat:chat-area'）
   */
  detachableComponents?: Record<string, DetachableComponentRegistration>;

  /**
   * 工具提供的资产附属操作
   * 用于在资产管理器中为相关资产提供快捷操作（如查看转写、OCR 结果等）
   */
  getAssetSidecarActions?(): AssetSidecarAction[];

  /**
   * 启动项配置
   * 如果定义了此配置，工具将支持在应用启动时自动执行任务。
   */
  readonly startupConfig?: StartupConfig;

  /**
   * 启动钩子方法
   * 当工具被启用自启动时，在此方法中执行具体的启动逻辑。
   */
  onStartup?(): Promise<void> | void;

  /**
   * 工具的可配置项声明
   * 直接使用现有的 SettingItem 类型，确保与 SettingListRenderer 完美兼容
   */
  readonly settingsSchema?: SettingItem<any>[];

  /**
   * 允许工具实现自定义的 Agent 方法
   */
  [key: string]: any;
}

/**
 * 工具注册工厂接口
 * 用于动态生成多个 ToolRegistry 实例，适用于桥接层等场景
 */
export interface ToolRegistryFactory {
  /**
   * 工厂标识符，用于追踪和批量注销
   */
  readonly factoryId: string;

  /**
   * 创建并返回多个 ToolRegistry 实例
   */
  createRegistries(): Promise<ToolRegistry[]> | ToolRegistry[];
}

/**
 * 联合类型：工具注册项（单例或工厂）
 */
export type ToolRegistryItem = ToolRegistry | ToolRegistryFactory;

/**
 * 工具调用时的统一上下文环境
 * 同步工具和异步任务均使用此接口，屏蔽底层执行模式差异
 */
export interface ToolContext {
  /**
   * 状态/进度上报
   * @param message 状态描述文字
   * @param progress 可选的进度百分比（0-100），异步任务模式下会持久化到任务记录
   */
  reportStatus: (message: string, progress?: number) => void;

  /**
   * 取消信号（异步任务模式下由 TaskManager 提供，同步模式下通常为 undefined）
   */
  signal?: AbortSignal;

  /**
   * 任务 ID（仅异步任务模式下有值）
   */
  taskId?: string;

  /**
   * 是否处于异步任务模式
   * - true：由 TaskManager 管理，支持持久化进度、取消、重试
   * - false：同步阻塞执行，进度仅用于实时 UI 反馈
   */
  isAsync: boolean;
}
