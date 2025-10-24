/**
 * 流式处理器 V2 - 基于 CustomParser 的新实现
 *
 * 核心设计：
 * 1. 使用 CustomParser 替代 markdown-it
 * 2. 借鉴 V1 的边界检测和稳定区/待定区分离策略
 * 3. CustomParser 只负责解析完整文本，本类负责流式管理
 */

import type { AstNode, Patch, StreamProcessorOptions, CodeBlockNode } from "./types";
import { CustomParser } from "./CustomParser";

/**
 * Markdown 语义边界检测器（从 V1 借鉴）
 */
class MarkdownBoundaryDetector {
  isSafeParsePoint(text: string): boolean {
    const lines = text.split("\n");
    if (this.isInsideCodeBlock(lines)) return false;
    if (this.isIncompleteTable(lines.slice(-3))) return false;
    return true;
  }

  private isInsideCodeBlock(lines: string[]): boolean {
    let fenceCount = 0;
    for (const line of lines) {
      if (/^```/.test(line.trim())) {
        fenceCount++;
      }
    }
    return fenceCount % 2 !== 0;
  }

  private isIncompleteTable(lastLines: string[]): boolean {
    const lastLine = lastLines[lastLines.length - 1]?.trim() || "";
    if (/^\|[\s:-]+\|/.test(lastLine)) {
      if (lastLines.length > 1) {
        const prevLine = lastLines[lastLines.length - 2]?.trim() || "";
        return prevLine.includes("|");
      }
    }
    return false;
  }

  splitByBlockBoundary(text: string): { stable: string; pending: string } {
    const lines = text.split("\n");
    let stableEndLineIndex = -1;

    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === "") {
        const testText = lines.slice(0, i).join("\n");
        if (this.isSafeParsePoint(testText)) {
          stableEndLineIndex = i;
          break;
        }
      }
    }

    if (stableEndLineIndex !== -1) {
      const stableLines = lines.slice(0, stableEndLineIndex + 1);
      const pendingLines = lines.slice(stableEndLineIndex + 1);
      return {
        stable: stableLines.join("\n"),
        pending: pendingLines.join("\n"),
      };
    } else {
      if (this.isSafeParsePoint(text)) {
        return { stable: text, pending: "" };
      } else {
        return { stable: "", pending: text };
      }
    }
  }
}

export class StreamProcessorV2 {
  private parser: CustomParser;
  private onPatch: (patches: Patch[]) => void;
  private boundaryDetector: MarkdownBoundaryDetector;

  // 状态管理
  private buffer = "";
  private stableAst: AstNode[] = [];
  private pendingAst: AstNode[] = [];
  private stableTextLength = 0;
  private nodeIdCounter = 1;

  constructor(options: StreamProcessorOptions) {
    this.onPatch = options.onPatch;
    this.parser = new CustomParser();
    this.boundaryDetector = new MarkdownBoundaryDetector();
  }

  private generateNodeId(): string {
    return `node-v2-${this.nodeIdCounter++}`;
  }

  /**
   * 处理新的文本块
   */
  process(chunk: string): void {
    this.buffer += chunk;
    this.processIncremental();
  }

  /**
   * 结束流式处理
   */
  finalize(): void {
    this.processComplete();
  }

  /**
   * 增量处理（遵循 V1 的成功模式）
   */
  private processIncremental(): void {
    const allPatches: Patch[] = [];

    // 1. 划分稳定区和待定区
    const { stable: stableText, pending: pendingText } =
      this.boundaryDetector.splitByBlockBoundary(this.buffer);

    // 2. 处理稳定区（重新解析整个稳定文本）
    if (stableText.length > this.stableTextLength) {
      this.parser.reset();
      const newStableAst = this.parser.parse(stableText);
      this.preserveExistingIds(newStableAst, this.stableAst);
      this.assignIds(newStableAst);
      this.markNodesStatus(newStableAst, 'stable');
      
      const stablePatches = this.diffAst(this.stableAst, newStableAst);
      allPatches.push(...stablePatches);
      
      this.stableAst = newStableAst;
      this.stableTextLength = stableText.length;
    }

    // 3. 处理待定区（完全替换）
    this.parser.reset();
    const newPendingAst = this.parser.parse(pendingText);
    this.assignIds(newPendingAst);
    this.markNodesStatus(newPendingAst, 'pending');
    
    const pendingPatches = this.replacePendingRegion(this.pendingAst, newPendingAst);
    allPatches.push(...pendingPatches);
    this.pendingAst = newPendingAst;

    // 4. 发送变更
    if (allPatches.length > 0) {
      this.onPatch(allPatches);
    }
  }
  /**
   * 完整处理
   */
  private processComplete(): void {
    // 如果还有待定文本，解析并追加到稳定区
    if (this.pendingAst.length > 0) {
      const patches: Patch[] = [];

      // 移除旧的待定节点
      for (const oldNode of this.pendingAst) {
        patches.push({ op: "remove-node", id: oldNode.id });
      }

      // 解析剩余文本并标记为稳定
      const remainingText = this.buffer.substring(this.stableTextLength);
      if (remainingText) {
        this.parser.reset();
        const finalNodes = this.parser.parse(remainingText);
        this.assignIds(finalNodes);
        this.markNodesStatus(finalNodes, "stable");

        // 追加到稳定区
        if (this.stableAst.length > 0) {
          let currentAnchor = this.stableAst[this.stableAst.length - 1].id;
          for (const newNode of finalNodes) {
            patches.push({ op: "insert-after", id: currentAnchor, newNode });
            currentAnchor = newNode.id;
          }
        } else {
          patches.push({ op: "replace-root", newRoot: finalNodes });
        }

        this.stableAst.push(...finalNodes);
      }

      this.pendingAst = [];
      this.stableTextLength = this.buffer.length;

      if (patches.length > 0) {
        this.onPatch(patches);
      }
    }
  }
  /**
   * 替换待定区（完全替换策略）
   */
  private replacePendingRegion(oldPending: AstNode[], newPending: AstNode[]): Patch[] {
    const patches: Patch[] = [];

    if (oldPending.length === 0 && newPending.length === 0) {
      return [];
    }

    // 优化：单个代码块的流式更新（保留ID）
    if (
      oldPending.length === 1 &&
      newPending.length === 1 &&
      oldPending[0].type === "code_block" &&
      newPending[0].type === "code_block"
    ) {
      const oldNode = oldPending[0] as CodeBlockNode;
      const newNode = newPending[0] as CodeBlockNode;
      if (oldNode.props.language === newNode.props.language) {
        newNode.id = oldNode.id;
        newNode.meta.status = "pending";
        return [{ op: "replace-node", id: oldNode.id, newNode }];
      }
    }

    // 优化：单个段落的流式更新（保留ID）
    if (
      oldPending.length === 1 &&
      newPending.length === 1 &&
      oldPending[0].type === "paragraph" &&
      newPending[0].type === "paragraph"
    ) {
      const oldText = this.getNodeTextContent(oldPending[0]);
      const newText = this.getNodeTextContent(newPending[0]);
      if (newText.startsWith(oldText)) {
        newPending[0].id = oldPending[0].id;
        newPending[0].meta.status = "pending";
        return [{ op: "replace-node", id: oldPending[0].id, newNode: newPending[0] }];
      }
    }

    // 默认：完全替换
    for (const oldNode of oldPending) {
      patches.push({ op: "remove-node", id: oldNode.id });
    }

    if (newPending.length > 0) {
      const anchorId =
        this.stableAst.length > 0 ? this.stableAst[this.stableAst.length - 1].id : undefined;

      if (anchorId) {
        let currentAnchor = anchorId;
        for (const newNode of newPending) {
          patches.push({ op: "insert-after", id: currentAnchor, newNode });
          currentAnchor = newNode.id;
        }
      } else {
        patches.push({ op: "replace-root", newRoot: newPending });
      }
    }

    return patches;
  }

  private getNodeTextContent(node: AstNode): string {
    if (node.type === 'text') {
      return node.props.content;
    }
    if (node.type === 'code_block') {
      return node.props.content;
    }
    if (node.type === 'inline_code') {
      return node.props.content;
    }
    if (node.type === 'html_inline' || node.type === 'html_block') {
      return node.props.content;
    }
    if (!node.children) return '';
    return node.children.map(child => this.getNodeTextContent(child)).join('');
  }

  private preserveExistingIds(newNodes: AstNode[], oldNodes: AstNode[]): void {
    const oldNodeMap = new Map<string, AstNode>();
    for (const node of oldNodes) {
      const key = `${node.type}:${this.getNodeTextContent(node).substring(0, 20)}`;
      if (!oldNodeMap.has(key)) {
        oldNodeMap.set(key, node);
      }
    }

    for (const newNode of newNodes) {
      const key = `${newNode.type}:${this.getNodeTextContent(newNode).substring(0, 20)}`;
      if (oldNodeMap.has(key)) {
        const oldNode = oldNodeMap.get(key)!;
        newNode.id = oldNode.id;
        if (newNode.children && oldNode.children) {
          this.preserveExistingIds(newNode.children, oldNode.children);
        }
        oldNodeMap.delete(key);
      }
    }
  }

  private diffAst(oldNodes: AstNode[], newNodes: AstNode[]): Patch[] {
    const patches: Patch[] = [];
    const minLen = Math.min(oldNodes.length, newNodes.length);

    // 比对共同部分
    for (let i = 0; i < minLen; i++) {
      patches.push(...this.diffSingleNode(oldNodes[i], newNodes[i]));
    }

    // 新增节点
    if (newNodes.length > oldNodes.length) {
      const anchorId = oldNodes.length > 0
        ? oldNodes[oldNodes.length - 1].id
        : this.stableAst[this.stableAst.length - 1]?.id;
      
      if (!anchorId) {
        return [{ op: 'replace-root', newRoot: newNodes }];
      }
      
      let currentAnchor = anchorId;
      for (let i = minLen; i < newNodes.length; i++) {
        patches.push({ op: 'insert-after', id: currentAnchor, newNode: newNodes[i] });
        currentAnchor = newNodes[i].id;
      }
    }

    // 删除节点
    if (oldNodes.length > newNodes.length) {
      for (let i = minLen; i < oldNodes.length; i++) {
        patches.push({ op: 'remove-node', id: oldNodes[i].id });
      }
    }

    return patches;
  }

  private diffSingleNode(oldNode: AstNode, newNode: AstNode): Patch[] {
    newNode.id = oldNode.id;
    
    const typeChanged = oldNode.type !== newNode.type;
    const contentChanged = this.getNodeTextContent(oldNode) !== this.getNodeTextContent(newNode);
    const statusChanged = oldNode.meta.status !== newNode.meta.status;
    
    if (typeChanged || contentChanged || statusChanged) {
      if (oldNode.children && newNode.children) {
        this.preserveExistingIds(newNode.children, oldNode.children);
      }
      return [{ op: 'replace-node', id: oldNode.id, newNode }];
    }

    if (oldNode.children || newNode.children) {
      return this.diffAst(oldNode.children || [], newNode.children || []);
    }

    return [];
  }

  private assignIds(nodes: AstNode[]): void {
    for (const node of nodes) {
      if (!node.id) {
        node.id = this.generateNodeId();
      }
      if (node.children) {
        this.assignIds(node.children);
      }
    }
  }

  private markNodesStatus(nodes: AstNode[], status: "stable" | "pending"): void {
    for (const node of nodes) {
      node.meta.status = status;
      if (node.children) {
        this.markNodesStatus(node.children, status);
      }
    }
  }

  getAst(): AstNode[] {
    return this.stableAst;
  }

  reset(): void {
    this.buffer = "";
    this.stableAst = [];
    this.pendingAst = [];
    this.stableTextLength = 0;
    this.nodeIdCounter = 1;
    this.parser.reset();
  }
}
