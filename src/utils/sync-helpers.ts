/**
 * 窗口同步辅助工具
 * 
 * 提供增量更新、幂等性检查等核心功能
 */

import { compare, applyPatch } from 'fast-json-patch';
import type { JsonPatchOperation, IdempotencyCacheItem } from '@/types/window-sync';

// ============================================================================
// 增量更新工具
// ============================================================================

/**
 * 计算两个对象之间的差异（JSON Patch）
 *
 * @param oldValue 原始值
 * @param newValue 新值
 * @returns JSON Patch 操作数组
 */
export function calculateDiff(oldValue: any, newValue: any): JsonPatchOperation[] {
  try {
    // 如果旧值或新值为 null/undefined，无法进行差异计算
    if (oldValue === null || oldValue === undefined || newValue === null || newValue === undefined) {
      return [];
    }
    return compare(oldValue, newValue);
  } catch (error) {
    console.error('计算差异失败:', error);
    return [];
  }
}

/**
 * 应用 JSON Patch 到目标对象
 * 
 * @param target 目标对象
 * @param patches JSON Patch 操作数组
 * @returns 应用补丁后的新对象
 */
export function applyPatches<T>(target: T, patches: JsonPatchOperation[]): T {
  try {
    // 使用 fast-json-patch 的 applyPatch 函数
    // 注意：applyPatch 会直接修改目标对象，所以需要先深拷贝
    const document = JSON.parse(JSON.stringify(target));
    const { newDocument } = applyPatch(document, patches, true, false);
    return newDocument;
  } catch (error) {
    console.error('应用补丁失败:', error);
    // 失败时返回原始对象
    return target;
  }
}

/**
 * 判断是否应该使用增量更新
 * 
 * @param patches 补丁数组
 * @param newValue 新值
 * @param threshold 阈值（0-1）
 * @returns 是否使用增量更新
 */
export function shouldUseDelta(
  patches: JsonPatchOperation[],
  newValue: any,
  threshold: number = 0.5
): boolean {
  if (!patches || patches.length === 0) return false;
  
  try {
    const patchesSize = JSON.stringify(patches).length;
    const fullSize = JSON.stringify(newValue).length;
    
    return patchesSize < fullSize * threshold;
  } catch (error) {
    console.error('计算补丁大小失败:', error);
    return false;
  }
}

// ============================================================================
// 幂等性工具
// ============================================================================

/**
 * 幂等性缓存
 */
class IdempotencyCache {
  private cache = new Map<string, IdempotencyCacheItem>();
  private maxSize: number;
  private ttl: number; // 生存时间（毫秒）

  constructor(maxSize: number = 1000, ttl: number = 300000) { // 默认5分钟TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
    
    // 定期清理过期缓存
    setInterval(() => this.cleanup(), 60000); // 每分钟清理一次
  }

  /**
   * 生成幂等性键
   */
  generateKey(action: string, params: any, userId?: string): string {
    const paramsHash = this.hashParams(params);
    const timeWindow = Math.floor(Date.now() / 60000); // 1分钟时间窗口
    return `${action}-${userId || 'anonymous'}-${paramsHash}-${timeWindow}`;
  }

  /**
   * 检查并设置缓存
   */
  checkAndSet(key: string, requestId: string, response: any): boolean {
    const existing = this.cache.get(key);
    
    // 如果存在且未过期，返回 false（表示重复请求）
    if (existing && (Date.now() - existing.timestamp) < this.ttl) {
      return false;
    }
    
    // 设置新缓存
    const item: IdempotencyCacheItem = {
      requestId,
      response,
      timestamp: Date.now()
    };
    
    this.cache.set(key, item);
    
    // 如果缓存过大，清理最旧的条目
    if (this.cache.size > this.maxSize) {
      this.evictOldest();
    }
    
    return true;
  }

  /**
   * 获取缓存的响应
   */
  get(key: string): IdempotencyCacheItem | undefined {
    const item = this.cache.get(key);
    
    if (item && (Date.now() - item.timestamp) < this.ttl) {
      return item;
    }
    
    // 过期则删除
    this.cache.delete(key);
    return undefined;
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp >= this.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清理最旧的缓存项
   */
  private evictOldest(): void {
    let oldestKey = '';
    let oldestTime = Date.now();
    
    for (const [key, item] of this.cache.entries()) {
      if (item.timestamp < oldestTime) {
        oldestTime = item.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 参数哈希计算
   */
  private hashParams(params: any): string {
    try {
      const str = JSON.stringify(params, Object.keys(params).sort());
      return this.simpleHash(str);
    } catch (error) {
      console.error('参数哈希计算失败:', error);
      return String(Date.now());
    }
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }
}

// 导出全局幂等性缓存实例
export const idempotencyCache = new IdempotencyCache();

// ============================================================================
// 防抖工具
// ============================================================================

/**
 * 带有 cancel 方法的防抖函数返回类型
 */
export interface DebouncedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  cancel(): void;
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): DebouncedFunction<T> {
  let timeoutId: number | undefined;

  const debounced = (...args: Parameters<T>) => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      func(...args);
    }, delay);
  };

  debounced.cancel = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  return debounced;
}

// ============================================================================
// 版本管理工具
// ============================================================================

/**
 * 版本号生成器
 * 基于时间戳和随机数生成唯一版本号，避免多窗口环境下的版本冲突
 */
export const VersionGenerator = {
  /**
   * 生成新的版本号
   * 使用 Date.now() 和随机数组合确保唯一性
   */
  next(): number {
    // Math.random() 在某些情况下可能不够随机，但对于这个场景足够了。
    // Date.now() 提供了毫秒级的时间戳，确保了版本号的递增。
    return Date.now() + Math.random();
  },
};