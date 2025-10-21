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
   * 从某个节点开始，找到其所在分支的叶节点
   * 策略：优先选择第一个子节点（主干）
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

    // 沿着第一个子节点一直走到叶子
    while (current && current.childrenIds.length > 0) {
      const nextId = current.childrenIds[0];
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