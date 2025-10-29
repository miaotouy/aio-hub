/**
 * 工具服务基础接口定义
 * 
 * 所有工具服务都应该实现此接口，以确保统一的服务契约。
 */

export interface ToolService {
  /**
   * 服务的唯一标识符，通常与工具路径对应。
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
   * 服务初始化方法，在注册时由 ServiceRegistry 调用。
   * 可用于执行一次性设置，如加载初始配置等。
   */
  initialize?(): Promise<void> | void;

  /**
   * 服务销毁方法，在应用关闭或服务热重载时调用。
   * 可用于清理资源，如取消订阅、清除定时器等。
   */
  dispose?(): void;
}