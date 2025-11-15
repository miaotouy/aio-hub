/**
 * 流式处理器 V2 - 基于 CustomParser 的新实现
 *
 * 核心设计：
 * 1. 使用 CustomParser 替代 markdown-it
 * 2. 借鉴 V1 的边界检测和稳定区/待定区分离策略
 * 3. CustomParser 只负责解析完整文本，本类负责流式管理
 */

import type { AstNode, Patch, StreamProcessorOptions } from "./types";
import { CustomParser } from "./CustomParser";

/**
 * Markdown 语义边界检测器（增强版）
 *
 * 检测内容是否处于完整状态，包括：
 * 1. 代码块是否闭合
 * 2. 表格是否完整
 * 3. HTML 标签是否闭合
 */
class MarkdownBoundaryDetector {
  isSafeParsePoint(text: string): boolean {
    const lines = text.split("\n");
    if (this.isInsideCodeBlock(lines)) return false;
    if (this.isIncompleteTable(lines.slice(-3))) return false;
    if (this.hasUnclosedHtmlTags(text)) return false;
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

  /**
   * 检查是否存在未闭合的 HTML 标签
   *
   * 简化策略：统计开放标签和闭合标签的数量
   * - 跳过自闭合标签（如 <br />）
   * - 跳过常见的空标签（如 <img>, <hr>）
   */
  private hasUnclosedHtmlTags(text: string): boolean {
    const tagStack: string[] = [];
    const selfClosingTags = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);
    
    // 匹配所有 HTML 标签
    const tagRegex = /<\/?([a-zA-Z0-9]+)(?:\s[^>]*)?\/?>/g;
    let match;
    
    while ((match = tagRegex.exec(text)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();

      // 忽略 <think> 标签
      if (tagName === 'think') continue;
      
      // 跳过自闭合标签
      if (selfClosingTags.has(tagName)) continue;
      if (fullTag.endsWith('/>')) continue;
      
      // 闭合标签
      if (fullTag.startsWith('</')) {
        // 从栈顶弹出匹配的开放标签
        if (tagStack.length > 0 && tagStack[tagStack.length - 1] === tagName) {
          tagStack.pop();
        }
      } else {
        // 开放标签
        tagStack.push(tagName);
      }
    }
    
    // 如果栈不为空，说明有未闭合的标签
    return tagStack.length > 0;
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
   * 增量处理（统一 diff 策略）
   *
   * 核心改进：不再分别处理稳定区和待定区，而是：
   * 1. 解析新的稳定区和待定区
   * 2. 将当前的 stableAst 和 pendingAst 合并为"旧状态树"
   * 3. 将新的稳定区和待定区 AST 合并为"新状态树"
   * 4. 对整个树进行一次性 diff
   *
   * 这样可以确保节点从待定区转移到稳定区时，ID 能被正确保留
   */
  private processIncremental(): void {
    // 1. 划分稳定区和待定区
    const { stable: stableText, pending: pendingText } =
      this.boundaryDetector.splitByBlockBoundary(this.buffer);

    // 2. 解析稳定区
    this.parser.reset();
    const newStableAst = this.parser.parse(stableText);
    
    // 3. 解析待定区
    this.parser.reset();
    const newPendingAst = this.parser.parse(pendingText);
    
    // 4. 合并当前的完整状态树（旧状态）
    const currentFullAst = [...this.stableAst, ...this.pendingAst];
    
    // 5. 合并新的完整状态树（新状态）
    const newFullAst = [...newStableAst, ...newPendingAst];
    
    // 6. 在整个旧状态树中为新状态树保留 ID
    this.preserveExistingIds(newFullAst, currentFullAst);
    this.assignIds(newFullAst);
    
    // 7. 标记节点状态
    this.markNodesStatus(newStableAst, 'stable');
    this.markNodesStatus(newPendingAst, 'pending');
    
    // 8. 对整个树进行一次性 diff
    const patches = this.diffAst(currentFullAst, newFullAst);
    
    // 9. 更新状态
    this.stableAst = newStableAst;
    this.pendingAst = newPendingAst;
    
    // 10. 发送变更
    if (patches.length > 0) {
      this.onPatch(patches);
    }
  }
  /**
   * 完整处理（重写版）
   *
   * 在流结束时，将整个 buffer 作为最终内容重新解析，
   * 然后与当前的 AST 进行 diff，确保正确处理节点合并等情况
   */
  private processComplete(): void {
    // 将整个 buffer 作为最终内容重新解析
    this.parser.reset();
    const finalAst = this.parser.parse(this.buffer);
    
    // 保留现有节点的 ID
    const currentFullAst = [...this.stableAst, ...this.pendingAst];
    this.preserveExistingIds(finalAst, currentFullAst);
    this.assignIds(finalAst);
    this.markNodesStatus(finalAst, 'stable');
    
    // 计算 diff
    const patches = this.diffAst(currentFullAst, finalAst);
    
    // 更新状态
    this.stableAst = finalAst;
    this.pendingAst = [];
    
    // 发送变更
    if (patches.length > 0) {
      this.onPatch(patches);
    }
  }

  private getNodeTextContent(node: AstNode): string {
    if (node.type === 'text') {
      return node.props.content;
    }
    if (node.type === 'code_block') {
      return node.props.content;
    }
    if (node.type === 'mermaid') {
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

  /**
   * 解耦后的 diffAst 方法
   *
   * @param anchorId 可选的锚点ID，用于计算插入位置
   */
  private diffAst(oldNodes: AstNode[], newNodes: AstNode[], anchorId?: string): Patch[] {
    const patches: Patch[] = [];
    const minLen = Math.min(oldNodes.length, newNodes.length);

    // 比对共同部分
    for (let i = 0; i < minLen; i++) {
      patches.push(...this.diffSingleNode(oldNodes[i], newNodes[i]));
    }

    // 新增节点
    if (newNodes.length > oldNodes.length) {
      // 确定锚点：优先使用传入的 anchorId，其次使用 oldNodes 的最后一个节点，最后回退到 stableAst
      let insertAnchorId: string | undefined;
      if (anchorId !== undefined) {
        insertAnchorId = anchorId;
      } else if (oldNodes.length > 0) {
        insertAnchorId = oldNodes[oldNodes.length - 1].id;
      } else {
        insertAnchorId = this.stableAst[this.stableAst.length - 1]?.id;
      }
      
      if (!insertAnchorId) {
        return [{ op: 'replace-root', newRoot: [...newNodes] }];
      }
      
      let currentAnchor = insertAnchorId;
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
    this.nodeIdCounter = 1;
    this.parser.reset();
  }
}
