/**
 * 锚点注册表服务
 *
 * 管理上下文中可用的锚点（具名插槽）。
 * 锚点用于标记上下文流中可注入的位置，如 'chat_history'、'user_profile' 等。
 */

import { ref } from 'vue';

/**
 * 锚点定义
 */
export interface AnchorDefinition {
  /** 锚点的唯一标识符 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 锚点描述 */
  description: string;
  /** 是否为系统内置锚点 */
  isSystem: boolean;
}

/**
 * 系统内置锚点
 */
const SYSTEM_ANCHORS: AnchorDefinition[] = [
  {
    id: 'chat_history',
    name: '会话历史',
    description: '会话消息的插入位置',
    isSystem: true,
  },
  {
    id: 'user_profile',
    name: '用户档案',
    description: '用户档案内容的插入位置',
    isSystem: true,
  },
];

// 单例：注册的锚点列表
const registeredAnchors = ref<AnchorDefinition[]>([...SYSTEM_ANCHORS]);

/**
 * 锚点注册表 Composable
 *
 * 提供锚点的查询、注册和管理功能。
 * 用户在消息编辑界面只能选择已注册的锚点，不能自行创建。
 */
export function useAnchorRegistry() {
  /**
   * 获取所有可用的锚点
   */
  const getAvailableAnchors = (): AnchorDefinition[] => {
    return registeredAnchors.value;
  };

  /**
   * 根据 ID 获取锚点定义
   */
  const getAnchorById = (id: string): AnchorDefinition | undefined => {
    return registeredAnchors.value.find((anchor) => anchor.id === id);
  };

  /**
   * 检查锚点是否存在
   */
  const hasAnchor = (id: string): boolean => {
    return registeredAnchors.value.some((anchor) => anchor.id === id);
  };

  /**
   * 注册新锚点（供插件使用）
   *
   * @param anchor 锚点定义
   * @returns 是否注册成功（如果 ID 已存在则返回 false）
   */
  const registerAnchor = (anchor: Omit<AnchorDefinition, 'isSystem'>): boolean => {
    if (hasAnchor(anchor.id)) {
      console.warn(`[AnchorRegistry] 锚点 "${anchor.id}" 已存在，注册失败`);
      return false;
    }

    registeredAnchors.value.push({
      ...anchor,
      isSystem: false,
    });

    console.info(`[AnchorRegistry] 锚点 "${anchor.id}" 注册成功`);
    return true;
  };

  /**
   * 注销锚点（仅限非系统锚点）
   *
   * @param id 锚点 ID
   * @returns 是否注销成功
   */
  const unregisterAnchor = (id: string): boolean => {
    const anchor = getAnchorById(id);
    if (!anchor) {
      console.warn(`[AnchorRegistry] 锚点 "${id}" 不存在，注销失败`);
      return false;
    }

    if (anchor.isSystem) {
      console.warn(`[AnchorRegistry] 系统锚点 "${id}" 不能被注销`);
      return false;
    }

    const index = registeredAnchors.value.findIndex((a) => a.id === id);
    if (index !== -1) {
      registeredAnchors.value.splice(index, 1);
      console.info(`[AnchorRegistry] 锚点 "${id}" 已注销`);
      return true;
    }

    return false;
  };

  /**
   * 获取系统内置锚点列表
   */
  const getSystemAnchors = (): AnchorDefinition[] => {
    return registeredAnchors.value.filter((anchor) => anchor.isSystem);
  };

  /**
   * 获取插件注册的锚点列表
   */
  const getPluginAnchors = (): AnchorDefinition[] => {
    return registeredAnchors.value.filter((anchor) => !anchor.isSystem);
  };

  return {
    getAvailableAnchors,
    getAnchorById,
    hasAnchor,
    registerAnchor,
    unregisterAnchor,
    getSystemAnchors,
    getPluginAnchors,
  };
}
