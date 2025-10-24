/**
 * 流式处理器 - 遵循架构文档的健壮实现
 *
 * 核心策略 (v2):
 * 1. 引入 MarkdownBoundaryDetector 智能判断块边界，区分稳定区与待定区。
 * 2. 稳定区 (Stable Region): 内容被确认为语法完整的部分。对此区域进行增量 Diff，并固化结果。
 * 3. 待定区 (Pending Region): 内容在流式传输中，语法可能不完整（如未闭合的代码块）。此区域每次都进行全量重解析和替换。
 * 4. 这种策略确保了流式解析的正确性，避免了对不完整语法的错误固化。
 */

import MarkdownIt from 'markdown-it';
import type {
  AstNode,
  Patch,
  StreamProcessorOptions,
  NodeMeta,
  ParagraphNode,
  HeadingNode,
  CodeBlockNode,
  ListNode,
  ListItemNode,
  BlockquoteNode,
  HrNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  TextNode,
  StrongNode,
  EmNode,
  InlineCodeNode,
  LinkNode,
  StrikethroughNode,
} from './types';

/**
 * Markdown 语义边界检测器
 *
 * 根据架构文档 4.1.2 节实现，用于判断 Markdown 文本的解析安全点。
 */
class MarkdownBoundaryDetector {
  /**
   * 判断当前文本的末尾是否是一个安全的解析点。
   * 安全点意味着不存在未闭合的块级结构。
   */
  isSafeParsePoint(text: string): boolean {
    const lines = text.split('\n');
    const lastLines = lines.slice(-3); // 检查最后几行

    // 不安全情况：
    if (this.isInsideCodeBlock(lines)) return false;
    if (this.isIncompleteTable(lastLines)) return false;
    // 更多检查可以按需添加...

    return true;
  }

  /**
   * 检查是否在未闭合的代码块内部
   */
  private isInsideCodeBlock(lines: string[]): boolean {
    let fenceCount = 0;
    for (const line of lines) {
      if (/^```/.test(line.trim())) {
        fenceCount++;
      }
    }
    // 奇数个 ``` 围栏表示未闭合
    return fenceCount % 2 !== 0;
  }

  /**
   * 检查表格是否不完整
   * 主要检查最后一行是否是表格的分隔符
   */
  private isIncompleteTable(lastLines: string[]): boolean {
    const lastLine = lastLines[lastLines.length - 1]?.trim() || '';
    if (/^\|[\s:-]+\|/.test(lastLine)) {
      // 检查前一行是否是表头
      if (lastLines.length > 1) {
        const prevLine = lastLines[lastLines.length - 2]?.trim() || '';
        return prevLine.includes('|');
      }
    }
    return false;
  }
  
  /**
   * 找到安全的块边界，将文本分割为稳定区和待定区
   */
  splitByBlockBoundary(text: string): { stable: string; pending: string } {
    const lines = text.split('\n');
    let stableEndLineIndex = -1;

    // 从后向前查找最后一个安全的块边界（通常是双换行符）
    for (let i = lines.length - 1; i >= 0; i--) {
      // 检查当前行是否为空行，且前面的内容是安全的
      if (lines[i].trim() === '') {
        const testText = lines.slice(0, i).join('\n');
        if (this.isSafeParsePoint(testText)) {
          stableEndLineIndex = i;
          break;
        }
      }
    }

    if (stableEndLineIndex !== -1) {
      // 找到边界，进行分割
      const stableLines = lines.slice(0, stableEndLineIndex + 1);
      const pendingLines = lines.slice(stableEndLineIndex + 1);
      return {
        stable: stableLines.join('\n'),
        pending: pendingLines.join('\n'),
      };
    } else {
      // 没有找到明确的边界，检查整个文本是否安全
      if (this.isSafeParsePoint(text)) {
        return { stable: text, pending: '' };
      } else {
        return { stable: '', pending: text };
      }
    }
  }
}


export class StreamProcessor {
  private nodeIdCounter = 1;
  private buffer = '';
  private onPatch: (patches: Patch[]) => void;
  private md: MarkdownIt;
  private boundaryDetector: MarkdownBoundaryDetector;

  // 状态
  private stableAst: AstNode[] = [];      // 已稳定的节点
  private pendingAst: AstNode[] = [];     // 上次解析的待定区 AST
  private stableTextLength = 0;          // 已稳定文本的长度

  constructor(options: StreamProcessorOptions) {
    this.onPatch = options.onPatch;
    this.boundaryDetector = new MarkdownBoundaryDetector();
    
    this.md = new MarkdownIt({
      html: false,
      breaks: true,
      linkify: true,
      typographer: true,
    });
  }

  private generateNodeId(): string {
    return `node-${this.nodeIdCounter++}`;
  }

  process(chunk: string, isComplete = false): void {
    this.buffer += chunk;

    if (isComplete) {
      this.processComplete();
    } else {
      this.processIncremental();
    }
  }

  private processComplete(): void {
    const finalAst = this.parseMarkdown(this.buffer);
    this.assignIds(finalAst);
    
    const currentAst = [...this.stableAst, ...this.pendingAst];
    this.preserveExistingIds(finalAst, currentAst);

    const patches = this.diffAst(currentAst, finalAst);
    
    if (patches.length > 0) {
      this.onPatch(patches);
    } else if (currentAst.length === 0 && finalAst.length > 0) {
      // 首次解析，直接替换根
      this.onPatch([{ op: 'replace-root', newRoot: finalAst }]);
    }

    // 标记所有为稳定
    this.stableAst = finalAst;
    this.pendingAst = [];
    this.stableTextLength = this.buffer.length;
  }

  private processIncremental(): void {
    const allPatches: Patch[] = [];

    // 1. 划分稳定区和待定区
    const { stable: stableText, pending: pendingText } = this.boundaryDetector.splitByBlockBoundary(this.buffer);

    // 2. 处理稳定区 (如果有新的稳定内容)
    if (stableText.length > this.stableTextLength) {
      const newStableAst = this.parseMarkdown(stableText);
      this.assignIds(newStableAst);
      this.preserveExistingIds(newStableAst, this.stableAst);
      
      const stablePatches = this.diffAst(this.stableAst, newStableAst);
      allPatches.push(...stablePatches);
      
      this.stableAst = newStableAst;
      this.stableTextLength = stableText.length;
    }

    // 3. 处理待定区 (全量替换)
    const newPendingAst = this.parseMarkdown(pendingText);
    this.assignIds(newPendingAst);
    
    const pendingPatches = this.replacePendingRegion(this.pendingAst, newPendingAst);
    allPatches.push(...pendingPatches);
    this.pendingAst = newPendingAst;

    // 4. 统一发送所有变更
    if (allPatches.length > 0) {
      this.onPatch(allPatches);
    }
  }

  /**
   * 生成替换待定区的 Patch 指令
   */
  private replacePendingRegion(oldPending: AstNode[], newPending: AstNode[]): Patch[] {
    const patches: Patch[] = [];

    if (oldPending.length === 0 && newPending.length === 0) {
      return [];
    }

    // 1. 如果新旧都只有一个段落节点，且内容是追加的，则优化为 text-append
    if (
      oldPending.length === 1 && newPending.length === 1 &&
      oldPending[0].type === 'paragraph' && newPending[0].type === 'paragraph'
    ) {
      const oldText = this.getNodeTextContent(oldPending[0]);
      const newText = this.getNodeTextContent(newPending[0]);
      if (newText.startsWith(oldText)) {
        // 这是最常见的打字机场景，需要进行更精细的 diff
        newPending[0].id = oldPending[0].id;
        this.preserveExistingIds(newPending[0].children!, oldPending[0].children!);
        return this.diffSingleNode(oldPending[0], newPending[0]);
      }
    }

    // 2. 否则，执行完全替换
    // 移除所有旧的待定节点
    for (const oldNode of oldPending) {
      patches.push({ op: 'remove-node', id: oldNode.id });
    }

    // 插入所有新的待定节点
    if (newPending.length > 0) {
      // 锚点是最后一个稳定节点
      let anchorId = this.stableAst.length > 0
        ? this.stableAst[this.stableAst.length - 1].id
        : undefined;

      if (anchorId) {
        // 在最后一个稳定节点后插入
        for (const newNode of newPending) {
          patches.push({ op: 'insert-after', id: anchorId, newNode });
          anchorId = newNode.id;
        }
      } else {
        // 如果没有稳定节点，说明整个文档都是待定区，直接替换根
        patches.push({ op: 'replace-root', newRoot: newPending });
      }
    }
    
    return patches;
  }

  private getNodeTextContent(node: AstNode): string {
    if (node.type === 'text') {
      return (node as TextNode).props.content;
    }
    if (!node.children) return '';
    return node.children.map(child => this.getNodeTextContent(child)).join('');
  }

  private preserveExistingIds(newNodes: AstNode[], oldNodes: AstNode[]): void {
    const oldNodeMap = new Map<string, AstNode>();
    for (const node of oldNodes) {
      // 使用类型和内容的组合作为简化的 key
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
        oldNodeMap.delete(key); // 一个旧节点只能匹配一次
      }
    }
  }

  private diffAst(oldNodes: AstNode[], newNodes: AstNode[]): Patch[] {
    const patches: Patch[] = [];
    const minLen = Math.min(oldNodes.length, newNodes.length);

    // 1. 比对共同部分
    for (let i = 0; i < minLen; i++) {
      patches.push(...this.diffSingleNode(oldNodes[i], newNodes[i]));
    }

    // 2. 处理新增节点
    if (newNodes.length > oldNodes.length) {
      let anchorId = oldNodes.length > 0 ? oldNodes[oldNodes.length - 1].id : this.stableAst[this.stableAst.length - 1]?.id;
      if (!anchorId) {
        // 如果没有锚点，说明是首次创建，应使用 replace-root
        return [{ op: 'replace-root', newRoot: newNodes }];
      }
      for (let i = minLen; i < newNodes.length; i++) {
        patches.push({ op: 'insert-after', id: anchorId, newNode: newNodes[i] });
        anchorId = newNodes[i].id;
      }
    }

    // 3. 处理删除节点
    if (oldNodes.length > newNodes.length) {
      for (let i = minLen; i < oldNodes.length; i++) {
        patches.push({ op: 'remove-node', id: oldNodes[i].id });
      }
    }

    return patches;
  }

  private diffSingleNode(oldNode: AstNode, newNode: AstNode): Patch[] {
    // ID 必须预先处理好
    newNode.id = oldNode.id;
    
    if (oldNode.type !== newNode.type || this.getNodeTextContent(oldNode) !== this.getNodeTextContent(newNode)) {
      // 节点类型或内容变化，直接替换
      // 递归保留子节点 ID
      if (oldNode.children && newNode.children) {
        this.preserveExistingIds(newNode.children, oldNode.children);
      }
      return [{ op: 'replace-node', id: oldNode.id, newNode }];
    }

    // 类型和内容相同，递归比较子节点
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

  private parseMarkdown(text: string): AstNode[] {
    if (!text) return [];
    const tokens = this.md.parse(text, {});
    return this.tokensToAst(tokens);
  }

  private tokensToAst(tokens: any[]): AstNode[] {
    const ast: AstNode[] = [];
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      const node = this.tokenToNode(token, tokens, i);
      if (node) {
        ast.push(node);
        if (token.type.endsWith('_open')) {
          i = this.skipToClosingToken(tokens, i, token.type.replace('_open', ''));
        }
      }
      i++;
    }
    return ast;
  }

  private parseInlineTokens(tokens: any[]): AstNode[] {
    const nodes: AstNode[] = [];
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      switch (token.type) {
        case 'text':
          nodes.push({ id: this.generateNodeId(), type: 'text', props: { content: token.content }, meta: { range: { start: 0, end: 0 } } } as TextNode);
          break;
        case 'strong_open': {
          const { innerTokens, nextIndex } = this.extractInnerTokens(tokens, i, 'strong_close');
          nodes.push({ id: this.generateNodeId(), type: 'strong', props: {}, children: this.parseInlineTokens(innerTokens), meta: { range: { start: 0, end: 0 } } } as StrongNode);
          i = nextIndex;
          break;
        }
        case 'em_open': {
          const { innerTokens, nextIndex } = this.extractInnerTokens(tokens, i, 'em_close');
          nodes.push({ id: this.generateNodeId(), type: 'em', props: {}, children: this.parseInlineTokens(innerTokens), meta: { range: { start: 0, end: 0 } } } as EmNode);
          i = nextIndex;
          break;
        }
        case 's_open': {
          const { innerTokens, nextIndex } = this.extractInnerTokens(tokens, i, 's_close');
          nodes.push({ id: this.generateNodeId(), type: 'strikethrough', props: {}, children: this.parseInlineTokens(innerTokens), meta: { range: { start: 0, end: 0 } } } as StrikethroughNode);
          i = nextIndex;
          break;
        }
        case 'code_inline':
          nodes.push({ id: this.generateNodeId(), type: 'inline_code', props: { content: token.content }, meta: { range: { start: 0, end: 0 } } } as InlineCodeNode);
          break;
        case 'link_open': {
          const { innerTokens, nextIndex } = this.extractInnerTokens(tokens, i, 'link_close');
          const href = token.attrGet('href') || '';
          const title = token.attrGet('title') || undefined;
          nodes.push({ id: this.generateNodeId(), type: 'link', props: { href, title }, children: this.parseInlineTokens(innerTokens), meta: { range: { start: 0, end: 0 } } } as LinkNode);
          i = nextIndex;
          break;
        }
      }
      i++;
    }
    return nodes;
  }

  private extractInnerTokens(tokens: any[], startIndex: number, closingType: string): { innerTokens: any[], nextIndex: number } {
    const innerTokens: any[] = [];
    let i = startIndex + 1;
    while (i < tokens.length && tokens[i].type !== closingType) {
      innerTokens.push(tokens[i]);
      i++;
    }
    return { innerTokens, nextIndex: i };
  }

  private tokenToNode(token: any, tokens: any[], index: number): AstNode | null {
    const meta: NodeMeta = { range: { start: 0, end: 0 } };
    switch (token.type) {
      case 'paragraph_open': {
        const contentToken = tokens[index + 1];
        const children = contentToken?.children ? this.parseInlineTokens(contentToken.children) : [];
        return { id: this.generateNodeId(), type: 'paragraph', props: {}, children, meta } as ParagraphNode;
      }
      case 'heading_open': {
        const level = parseInt(token.tag.substring(1));
        const contentToken = tokens[index + 1];
        const children = contentToken?.children ? this.parseInlineTokens(contentToken.children) : [];
        return { id: this.generateNodeId(), type: 'heading', props: { level }, children, meta } as HeadingNode;
      }
      case 'code_block':
      case 'fence': {
        return { id: this.generateNodeId(), type: 'code_block', props: { language: token.info || undefined, content: token.content }, meta } as CodeBlockNode;
      }
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const ordered = token.type === 'ordered_list_open';
        const children = this.extractListItems(tokens, index);
        return { id: this.generateNodeId(), type: 'list', props: { ordered, start: token.attrGet('start') || undefined }, children, meta } as ListNode;
      }
      case 'blockquote_open': {
        const children = this.extractContainerContent(tokens, index, 'blockquote_close');
        return { id: this.generateNodeId(), type: 'blockquote', props: {}, children, meta } as BlockquoteNode;
      }
      case 'hr':
        return { id: this.generateNodeId(), type: 'hr', props: {}, meta } as HrNode;
      case 'table_open': {
        const children = this.extractTableContent(tokens, index);
        return { id: this.generateNodeId(), type: 'table', props: {}, children, meta } as TableNode;
      }
      default:
        return null;
    }
  }

  private extractContainerContent(tokens: any[], startIndex: number, closingType: string): AstNode[] {
    const content: AstNode[] = [];
    let i = startIndex + 1;
    while (i < tokens.length && tokens[i].type !== closingType) {
      const node = this.tokenToNode(tokens[i], tokens, i);
      if (node) {
        content.push(node);
        if (tokens[i].type.endsWith('_open')) {
          i = this.skipToClosingToken(tokens, i, tokens[i].type.replace('_open', ''));
        }
      }
      i++;
    }
    return content;
  }

  private extractListItems(tokens: any[], startIndex: number): AstNode[] {
    const items: AstNode[] = [];
    let i = startIndex + 1;
    const closingType = tokens[startIndex].type === 'bullet_list_open' ? 'bullet_list_close' : 'ordered_list_close';
    while (i < tokens.length && tokens[i].type !== closingType) {
      if (tokens[i].type === 'list_item_open') {
        const children = this.extractContainerContent(tokens, i, 'list_item_close');
        items.push({ id: this.generateNodeId(), type: 'list_item', props: {}, children, meta: { range: { start: 0, end: 0 } } } as ListItemNode);
        i = this.skipToClosingToken(tokens, i, 'list_item');
      }
      i++;
    }
    return items;
  }

  private extractTableContent(tokens: any[], startIndex: number): AstNode[] {
    const rows: AstNode[] = [];
    let i = startIndex + 1;
    while (i < tokens.length && tokens[i].type !== 'table_close') {
      if (tokens[i].type === 'tr_open') {
        const cells: AstNode[] = [];
        const isHeader = tokens[i - 1]?.type === 'thead_open';
        let j = i + 1;
        while (j < tokens.length && tokens[j].type !== 'tr_close') {
          if (tokens[j].type === 'th_open' || tokens[j].type === 'td_open') {
            const contentToken = tokens[j + 1];
            const children = contentToken?.children ? this.parseInlineTokens(contentToken.children) : [];
            cells.push({ id: this.generateNodeId(), type: 'table_cell', props: { isHeader }, children, meta: { range: { start: 0, end: 0 } } } as TableCellNode);
          }
          j++;
        }
        rows.push({ id: this.generateNodeId(), type: 'table_row', props: { isHeader }, children: cells, meta: { range: { start: 0, end: 0 } } } as TableRowNode);
        i = j;
      }
      i++;
    }
    return rows;
  }

  private skipToClosingToken(tokens: any[], startIndex: number, baseType: string): number {
    let depth = 1;
    let i = startIndex + 1;
    const openType = `${baseType}_open`;
    const closeType = `${baseType}_close`;
    while (i < tokens.length) {
      if (tokens[i].type === openType) depth++;
      else if (tokens[i].type === closeType) depth--;
      if (depth === 0) return i;
      i++;
    }
    return i - 1; // Fallback
  }

  reset(): void {
    this.buffer = '';
    this.nodeIdCounter = 1;
    this.stableAst = [];
    this.pendingAst = [];
    this.stableTextLength = 0;
  }
}