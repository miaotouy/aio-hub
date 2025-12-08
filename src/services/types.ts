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
  /** 当 type 为对象类型时，描述对象的属性 */
  properties?: MethodParameter[];
}

export interface MethodMetadata {
  name: string;
  description?: string;
  parameters: MethodParameter[];
  returnType: string; // 例如: 'Promise<string>', 'void'
  /** 方法调用示例 */
  example?: string;
}

export interface ServiceMetadata {
  methods: MethodMetadata[];
}

import type { Component } from 'vue';
import type { DetachableComponentRegistration } from '@/types/detachable';

export interface ToolConfig {
  name: string;
  path: string;
  icon: Component;
  component: () => Promise<any>; // 组件动态导入函数
  description?: string;
  category?: string;
}

export interface ToolRegistry {
  /**
   * 工具的唯一标识符，通常与工具路径对应。
   * @example 'directory-tree'
   */
  readonly id: string;

  /**
   * 服务的显示名称（可选）
   */
  readonly name?: string;

  /**
   * 服务描述（可选）
   */
  readonly description?: string;

  /**
   * 工具初始化方法，在注册时由 ToolRegistryManager 调用。
   * 可用于执行一次性设置，如加载初始配置等。
   */
  initialize?(): Promise<void> | void;

  /**
   * 工具销毁方法，在应用关闭或工具热重载时调用。
   * 可用于清理资源，如取消订阅、清除定时器等。
   */
  dispose?(): void;

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
}