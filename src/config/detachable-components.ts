import { defineAsyncComponent, type Component } from 'vue';
import { toolRegistryManager } from '@/services/registry';
import type { DetachableComponentRegistration } from '@/types/detachable';

/**
 * 获取所有已注册的可分离组件配置
 * 从所有已注册的工具中收集 detachableComponents
 */
function getAllDetachableComponents(): Record<string, DetachableComponentRegistration> {
  const allTools = toolRegistryManager.getAllTools();
  const result: Record<string, DetachableComponentRegistration> = {};

  for (const tool of allTools) {
    if (tool.detachableComponents) {
      // 将工具的组件配置合并到结果中
      Object.assign(result, tool.detachableComponents);
    }
  }

  return result;
}

/**
 * 根据组件 ID 获取注册信息
 * @param id - 组件的唯一 ID（支持命名空间格式，如 'llm-chat:chat-area'）
 * @returns {DetachableComponentRegistration | undefined}
 */
export function getDetachableComponentConfig(id: string): DetachableComponentRegistration | undefined {
  const allComponents = getAllDetachableComponents();
  return allComponents[id];
}

/**
 * 根据组件 ID 动态加载组件
 * @param id - 组件的唯一 ID
 * @returns {Component | null}
 */
export function loadDetachableComponent(id: string): Component | null {
  const config = getDetachableComponentConfig(id);
  return config ? defineAsyncComponent(config.component) : null;
}

/**
 * 获取所有可分离组件的 ID 列表
 */
export function getAllDetachableComponentIds(): string[] {
  const allComponents = getAllDetachableComponents();
  return Object.keys(allComponents);
}

/**
 * 检查组件 ID 是否存在
 */
export function hasDetachableComponent(id: string): boolean {
  return getDetachableComponentConfig(id) !== undefined;
}
