/**
 * Markdown AST 响应式状态管理
 * 
 * 职责：
 * 1. 持有 shallowRef 包装的 AST，避免深层响应式代理的开销
 * 2. 提供 enqueuePatch 方法，使用混合的 rAF + setTimeout 批处理策略
 * 3. 实现 applyPatches 方法，根据 ID 查找节点并采用不可变更新模式
 * 4. 维护 nodeMap 用于 O(1) 节点查找
 */

import { shallowRef, type ShallowRef } from 'vue';
import type { AstNode, Patch, NodeMap } from '../types';

const MAX_QUEUE_SIZE = 200;
const BATCH_TIMEOUT_MS = 32;

export function useMarkdownAst() {
  const ast: ShallowRef<AstNode[]> = shallowRef([]);
  const nodeMap: NodeMap = new Map();
  
  let patchQueue: Patch[] = [];
  let rafHandle = 0;
  let timeoutHandle = 0;

  /**
   * 构建 nodeMap 索引
   */
  function buildNodeMap(nodes: AstNode[], parentId?: string) {
    for (const node of nodes) {
      nodeMap.set(node.id, { node, parentId });
      if (node.children) {
        buildNodeMap(node.children, node.id);
      }
    }
  }

  /**
   * 合并连续的 text-append Patch
   */
  function coalesceTextAppends(patches: Patch[]): Patch[] {
    const coalesced: Patch[] = [];
    let i = 0;

    while (i < patches.length) {
      const patch = patches[i];
      
      if (patch.op === 'text-append') {
        // 收集所有连续的、针对同一节点的 text-append
        let combinedText = patch.text;
        let j = i + 1;
        
        while (j < patches.length && patches[j].op === 'text-append' && (patches[j] as any).id === patch.id) {
          combinedText += (patches[j] as any).text;
          j++;
        }
        
        coalesced.push({
          op: 'text-append',
          id: patch.id,
          text: combinedText,
        });
        
        i = j;
      } else {
        coalesced.push(patch);
        i++;
      }
    }

    return coalesced;
  }

  /**
   * 应用单个 Patch（不可变更新）
   */
  function applySinglePatch(nodes: AstNode[], patch: Patch): AstNode[] {
    switch (patch.op) {
      case 'replace-root':
        // 直接替换整个根节点
        return patch.newRoot;

      case 'text-append': {
        // 找到目标节点并追加文本
        return nodes.map(node => {
          if (node.id === patch.id) {
            // 创建新节点，修改 props.content
            // 只对有 content 属性的节点类型进行操作
            if ('content' in node.props) {
              return {
                ...node,
                props: {
                  ...node.props,
                  content: (node.props.content || '') + patch.text,
                },
              } as AstNode;
            }
            return node;
          }
          
          // 递归处理子节点
          if (node.children) {
            const newChildren = applySinglePatch(node.children, patch);
            if (newChildren !== node.children) {
              return { ...node, children: newChildren };
            }
          }
          
          return node;
        });
      }

      case 'set-prop': {
        // 设置节点属性
        return nodes.map(node => {
          if (node.id === patch.id) {
            return {
              ...node,
              props: {
                ...node.props,
                [patch.key]: patch.value,
              },
            } as AstNode;
          }
          
          if (node.children) {
            const newChildren = applySinglePatch(node.children, patch);
            if (newChildren !== node.children) {
              return { ...node, children: newChildren };
            }
          }
          
          return node;
        });
      }

      case 'replace-node': {
        // 替换节点
        return nodes.map(node => {
          if (node.id === patch.id) {
            return patch.newNode;
          }
          
          if (node.children) {
            const newChildren = applySinglePatch(node.children, patch);
            if (newChildren !== node.children) {
              return { ...node, children: newChildren };
            }
          }
          
          return node;
        });
      }

      case 'insert-after': {
        // 在指定节点之后插入
        const result: AstNode[] = [];
        for (const node of nodes) {
          result.push(node);
          if (node.id === patch.id) {
            result.push(patch.newNode);
          }
        }
        return result;
      }

      case 'insert-before': {
        // 在指定节点之前插入
        const result: AstNode[] = [];
        for (const node of nodes) {
          if (node.id === patch.id) {
            result.push(patch.newNode);
          }
          result.push(node);
        }
        return result;
      }

      case 'remove-node': {
        // 删除节点
        return nodes.filter(node => {
          if (node.id === patch.id) {
            return false;
          }
          
          if (node.children) {
            const newChildren = applySinglePatch(node.children, patch);
            if (newChildren !== node.children) {
              return true; // 节点本身保留，但子节点已更新
            }
          }
          
          return true;
        }).map(node => {
          if (node.children) {
            const newChildren = applySinglePatch(node.children, patch);
            if (newChildren !== node.children) {
              return { ...node, children: newChildren };
            }
          }
          return node;
        });
      }

      case 'replace-children-range': {
        // 替换子节点范围
        return nodes.map(node => {
          if (node.id === patch.parentId && node.children) {
            const newChildren = [...node.children];
            newChildren.splice(patch.start, patch.deleteCount, ...patch.newChildren);
            return { ...node, children: newChildren };
          }
          
          if (node.children) {
            const newChildren = applySinglePatch(node.children, patch);
            if (newChildren !== node.children) {
              return { ...node, children: newChildren };
            }
          }
          
          return node;
        });
      }

      default:
        return nodes;
    }
  }

  /**
   * 应用所有 Patch
   */
  function applyPatches(patches: Patch[]) {
    // 1. 合并连续的 text-append
    const coalesced = coalesceTextAppends(patches);
    
    // 2. 执行不可变更新
    let newRoot = ast.value;
    for (const patch of coalesced) {
      newRoot = applySinglePatch(newRoot, patch);
    }
    
    // 3. 替换引用以触发更新
    ast.value = newRoot;
    
    // 4. 重建 nodeMap
    nodeMap.clear();
    buildNodeMap(newRoot);
  }

  /**
   * 刷新 Patch 队列
   */
  function flushPatches() {
    cancelAnimationFrame(rafHandle);
    clearTimeout(timeoutHandle);
    rafHandle = 0;
    timeoutHandle = 0;
    
    if (patchQueue.length > 0) {
      applyPatches(patchQueue);
      patchQueue = [];
    }
  }

  /**
   * 将 Patch 加入队列
   */
  function enqueuePatch(patch: Patch | Patch[]) {
    patchQueue.push(...(Array.isArray(patch) ? patch : [patch]));
    
    if (!rafHandle) {
      rafHandle = requestAnimationFrame(flushPatches);
      timeoutHandle = window.setTimeout(flushPatches, BATCH_TIMEOUT_MS);
    }
    
    // 队列过长时立即执行，避免单帧过载
    if (patchQueue.length > MAX_QUEUE_SIZE) {
      flushPatches();
    }
  }

  return {
    ast,
    enqueuePatch,
    nodeMap,
  };
}