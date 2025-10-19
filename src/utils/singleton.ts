/**
 * 单例模式工具
 * 
 * 提供类型安全的单例模式实现
 * 用于确保 WindowSyncBus 等核心组件的全局唯一性
 */

/**
 * 单例实例容器
 */
const singletonInstances = new Map<string, any>();

/**
 * 单例工厂函数
 * 
 * @param key 单例的唯一标识符
 * @param factory 创建实例的工厂函数
 * @returns 单例实例
 */
export function getOrCreateInstance<T>(
  key: string,
  factory: () => T
): T {
  // 如果实例已存在，直接返回
  if (singletonInstances.has(key)) {
    return singletonInstances.get(key);
  }

  // 创建新实例并缓存
  const instance = factory();
  singletonInstances.set(key, instance);
  return instance;
}

/**
 * 获取已存在的单例实例
 * 
 * @param key 单例的唯一标识符
 * @returns 单例实例，如果不存在则返回 undefined
 */
export function getInstance<T>(key: string): T | undefined {
  return singletonInstances.get(key);
}

/**
 * 清除指定单例实例
 * 
 * @param key 单例的唯一标识符
 * @returns 是否成功清除
 */
export function clearInstance(key: string): boolean {
  return singletonInstances.delete(key);
}

/**
 * 清除所有单例实例
 * 主要用于测试和重置
 */
export function clearAllInstances(): void {
  singletonInstances.clear();
}

/**
 * 检查单例实例是否存在
 * 
 * @param key 单例的唯一标识符
 * @returns 是否存在
 */
export function hasInstance(key: string): boolean {
  return singletonInstances.has(key);
}

/**
 * 获取所有单例实例的键
 * 主要用于调试
 */
export function getInstanceKeys(): string[] {
  return Array.from(singletonInstances.keys());
}