/**
 * 分支导航器
 * 负责管理分支的切换和遍历
 */

import type { ChatSession, ChatMessageNode } from '../types';
import { createModuleLogger } from '@utils/logger';

const logger = createModuleLogger('llm-chat/BranchNavigator');

export class BranchNavigator {
  /**
   * 获取节点的所有兄弟节点（包括自己）
   */
  static getSiblings(
    session: ChatSession,
    nodeId: string
  ): ChatMessageNode[] {
    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn('获取兄弟节点失败：节点不存在', { nodeId });
      return [];
    }

    if (!node.parentId) {
      // 根节点没有兄弟
      return [node];
    }

    const parent = session.nodes[node.parentId];
    if (!parent) {
      logger.warn('获取兄弟节点失败：父节点不存在', { nodeId, parentId: node.parentId });
      return [node];
    }

    return parent.childrenIds
      .map(id => session.nodes[id])
      .filter((n): n is ChatMessageNode => n !== undefined);
  }

  /**
   * 在兄弟节点间切换
   * @returns 新的 activeLeafId
   */
  static switchToSibling(
    session: ChatSession,
    currentNodeId: string,
    direction: 'prev' | 'next'
  ): string {
    const siblings = this.getSiblings(session, currentNodeId);
    if (siblings.length <= 1) {
      logger.info('无兄弟节点可切换', { nodeId: currentNodeId });
      return currentNodeId;
    }

    const currentIndex = siblings.findIndex(n => n.id === currentNodeId);
    if (currentIndex === -1) {
      logger.warn('切换失败：当前节点不在兄弟列表中', { nodeId: currentNodeId });
      return currentNodeId;
    }

    let targetIndex: number;
    if (direction === 'next') {
      targetIndex = (currentIndex + 1) % siblings.length;
    } else {
      targetIndex = (currentIndex - 1 + siblings.length) % siblings.length;
    }

    const targetNode = siblings[targetIndex];
    const newLeafId = this.findLeafOfBranch(session, targetNode.id);

    logger.info('切换到兄弟分支', {
      from: currentNodeId,
      to: targetNode.id,
      direction,
      currentIndex,
      targetIndex,
      newLeafId,
    });

    return newLeafId;
  }

  /**
   * 从某个节点开始,找到其所在分支的叶节点
   * 策略：优先使用上次选择的子节点（lastSelectedChildId），没有则选择第一个子节点
   */
  static findLeafOfBranch(
    session: ChatSession,
    startNodeId: string
  ): string {
    let current = session.nodes[startNodeId];

    if (!current) {
      logger.warn('查找叶节点失败：起始节点不存在', { startNodeId });
      return startNodeId;
    }

    // 沿着记忆的路径或第一个子节点一直走到叶子
    while (current && current.childrenIds.length > 0) {
      // 优先使用上次选择的子节点
      let nextId: string;
      if (current.lastSelectedChildId && current.childrenIds.includes(current.lastSelectedChildId)) {
        nextId = current.lastSelectedChildId;
        logger.debug('使用记忆的子节点', {
          currentId: current.id,
          selectedChildId: nextId,
        });
      } else {
        // 没有记忆或记忆的子节点已被删除，使用第一个子节点
        nextId = current.childrenIds[0];
        logger.debug('使用默认子节点', {
          currentId: current.id,
          defaultChildId: nextId,
        });
      }

      const nextNode = session.nodes[nextId];
      if (!nextNode) {
        logger.warn('查找叶节点中断：子节点不存在', {
          currentId: current.id,
          missingChildId: nextId,
        });
        break;
      }
      current = nextNode;
    }

    return current ? current.id : startNodeId;
  }

  /**
   * 更新从根节点到指定叶节点路径上所有父节点的选择记忆
   * 当切换到新的分支时调用此方法，让沿途的每个父节点都记住走的是哪条路
   */
  static updateSelectionMemory(
    session: ChatSession,
    leafNodeId: string
  ): void {
    const path: string[] = [];
    let currentId: string | null = leafNodeId;

    // 从叶节点向上收集完整路径
    while (currentId !== null) {
      const node: ChatMessageNode | undefined = session.nodes[currentId];
      if (!node) {
        logger.warn('更新选择记忆失败：路径中断', { currentId });
        break;
      }
      path.unshift(currentId);
      currentId = node.parentId;
    }

    // 从上到下更新每个父节点的 lastSelectedChildId
    for (let i = 0; i < path.length - 1; i++) {
      const parentId = path[i];
      const childId = path[i + 1];
      const parentNode = session.nodes[parentId];

      if (parentNode) {
        // 只有当子节点确实存在于父节点的子节点列表中时才更新
        if (parentNode.childrenIds.includes(childId)) {
          parentNode.lastSelectedChildId = childId;
          logger.debug('更新父节点选择记忆', {
            parentId,
            selectedChildId: childId,
          });
        }
      }
    }

    logger.info('选择记忆已更新', {
      leafNodeId,
      pathLength: path.length,
    });
  }

  /**
   * 判断某个节点是否在当前活动路径上
   */
  static isNodeInActivePath(
    session: ChatSession,
    nodeId: string
  ): boolean {
    let currentId: string | null = session.activeLeafId;

    while (currentId !== null) {
      if (currentId === nodeId) return true;
      const node: ChatMessageNode | undefined = session.nodes[currentId];
      if (!node) break;
      currentId = node.parentId;
    }

    return false;
  }

  /**
   * 获取当前节点在兄弟节点中的索引
   */
  static getSiblingIndex(
    session: ChatSession,
    nodeId: string
  ): { index: number; total: number } {
    const siblings = this.getSiblings(session, nodeId);
    const index = siblings.findIndex(n => n.id === nodeId);
    return {
      index: index === -1 ? 0 : index,
      total: siblings.length,
    };
  }
}