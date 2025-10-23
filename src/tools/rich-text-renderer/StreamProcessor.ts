/**
 * 流式处理器 - 简化版
 * 
 * 职责：
 * 1. 将 Markdown 文本解析为 AST 节点
 * 2. 生成 Patch 指令通知状态管理层
 * 3. 使用单调计数器生成稳定的节点 ID
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
} from './types';

export class StreamProcessor {
  private nodeIdCounter = 1;
  private buffer = '';
  private onPatch: (patches: Patch[]) => void;
  private md: MarkdownIt;

  constructor(options: StreamProcessorOptions) {
    this.onPatch = options.onPatch;
    
    // 初始化 markdown-it，禁用 HTML 以确保安全
    this.md = new MarkdownIt({
      html: false,        // 禁用 HTML 标签
      breaks: true,       // 将换行符转换为 <br>
      linkify: true,      // 自动将 URL 转换为链接
      typographer: true,  // 启用智能引号等排版功能
    });
  }

  /**
   * 生成稳定的节点 ID
   */
  private generateNodeId(): string {
    return `node-${this.nodeIdCounter++}`;
  }

  /**
   * 处理输入的文本块
   * @param chunk 文本块
   * @param isComplete 是否为完整内容
   */
  process(chunk: string, isComplete = false): void {
    this.buffer += chunk;

    if (isComplete) {
      // 完整内容，直接解析并替换根节点
      const ast = this.parseMarkdown(this.buffer);
      const patch: Patch = {
        op: 'replace-root',
        newRoot: ast,
      };
      this.onPatch([patch]);
    } else {
      // TODO: 流式处理逻辑，暂时也按完整处理
      const ast = this.parseMarkdown(this.buffer);
      const patch: Patch = {
        op: 'replace-root',
        newRoot: ast,
      };
      this.onPatch([patch]);
    }
  }

  /**
   * 解析 Markdown 文本为 AST
   */
  private parseMarkdown(text: string): AstNode[] {
    const tokens = this.md.parse(text, {});
    return this.tokensToAst(tokens);
  }

  /**
   * 将 markdown-it 的 token 转换为我们的 AST 节点
   */
  private tokensToAst(tokens: any[]): AstNode[] {
    const ast: AstNode[] = [];
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];
      const node = this.tokenToNode(token, tokens, i);
      
      if (node) {
        ast.push(node);
        // 如果是容器节点，跳过已处理的子 token
        if (token.type.endsWith('_open')) {
          i = this.skipToClosingToken(tokens, i, token.type.replace('_open', ''));
        }
      }
      
      i++;
    }

    return ast;
  }

  /**
   * 将单个 token 转换为 AST 节点
   */
  private tokenToNode(token: any, tokens: any[], index: number): AstNode | null {
    const meta: NodeMeta = {
      range: { start: 0, end: 0 }, // 简化版暂不计算精确范围
    };

    switch (token.type) {
      case 'paragraph_open': {
        const contentToken = tokens[index + 1];
        const node: ParagraphNode = {
          id: this.generateNodeId(),
          type: 'paragraph',
          props: { content: this.extractTextContent(contentToken) },
          meta,
        };
        return node;
      }

      case 'heading_open': {
        const level = parseInt(token.tag.substring(1)); // h1 -> 1
        const contentToken = tokens[index + 1];
        const node: HeadingNode = {
          id: this.generateNodeId(),
          type: 'heading',
          props: {
            level,
            content: this.extractTextContent(contentToken),
          },
          meta,
        };
        return node;
      }

      case 'code_block':
      case 'fence': {
        const node: CodeBlockNode = {
          id: this.generateNodeId(),
          type: 'code_block',
          props: {
            language: token.info || undefined,
            content: token.content,
          },
          meta,
        };
        return node;
      }

      case 'bullet_list_open':
      case 'ordered_list_open': {
        const ordered = token.type === 'ordered_list_open';
        const children = this.extractListItems(tokens, index);
        const node: ListNode = {
          id: this.generateNodeId(),
          type: 'list',
          props: {
            ordered,
            start: token.attrGet('start') || undefined,
          },
          children,
          meta,
        };
        return node;
      }

      case 'blockquote_open': {
        const children = this.extractBlockquoteContent(tokens, index);
        const node: BlockquoteNode = {
          id: this.generateNodeId(),
          type: 'blockquote',
          props: {},
          children,
          meta,
        };
        return node;
      }

      case 'hr': {
        const node: HrNode = {
          id: this.generateNodeId(),
          type: 'hr',
          props: {},
          meta,
        };
        return node;
      }

      case 'table_open': {
        const children = this.extractTableContent(tokens, index);
        const node: TableNode = {
          id: this.generateNodeId(),
          type: 'table',
          props: {},
          children,
          meta,
        };
        return node;
      }

      default:
        return null;
    }
  }

  /**
   * 提取文本内容（包括内联元素）
   */
  private extractTextContent(token: any): string {
    if (!token) return '';
    
    if (token.type === 'inline') {
      // 处理内联 token
      let text = '';
      if (token.children) {
        for (const child of token.children) {
          if (child.type === 'text') {
            text += child.content;
          } else if (child.type === 'code_inline') {
            text += `\`${child.content}\``;
          } else if (child.type === 'link_open') {
            // 简化处理，只提取链接文本
            continue;
          } else if (child.type === 'link_close') {
            continue;
          } else if (child.content) {
            text += child.content;
          }
        }
      }
      return text;
    }
    
    return token.content || '';
  }

  /**
   * 提取列表项
   */
  private extractListItems(tokens: any[], startIndex: number): AstNode[] {
    const items: AstNode[] = [];
    let i = startIndex + 1;
    
    while (i < tokens.length && tokens[i].type !== 'bullet_list_close' && tokens[i].type !== 'ordered_list_close') {
      if (tokens[i].type === 'list_item_open') {
        const children = this.extractListItemContent(tokens, i);
        const node: ListItemNode = {
          id: this.generateNodeId(),
          type: 'list_item',
          props: {},
          children,
          meta: { range: { start: 0, end: 0 } },
        };
        items.push(node);
        i = this.skipToClosingToken(tokens, i, 'list_item');
      }
      i++;
    }
    
    return items;
  }

  /**
   * 提取列表项内容
   */
  private extractListItemContent(tokens: any[], startIndex: number): AstNode[] {
    const content: AstNode[] = [];
    let i = startIndex + 1;
    
    while (i < tokens.length && tokens[i].type !== 'list_item_close') {
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

  /**
   * 提取引用块内容
   */
  private extractBlockquoteContent(tokens: any[], startIndex: number): AstNode[] {
    const content: AstNode[] = [];
    let i = startIndex + 1;
    
    while (i < tokens.length && tokens[i].type !== 'blockquote_close') {
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

  /**
   * 提取表格内容
   */
  private extractTableContent(tokens: any[], startIndex: number): AstNode[] {
    const rows: AstNode[] = [];
    let i = startIndex + 1;
    
    while (i < tokens.length && tokens[i].type !== 'table_close') {
      if (tokens[i].type === 'thead_open' || tokens[i].type === 'tbody_open') {
        i++;
        continue;
      }
      
      if (tokens[i].type === 'tr_open') {
        const cells: AstNode[] = [];
        const isHeader = tokens[i - 1]?.type === 'thead_open';
        let j = i + 1;
        
        while (j < tokens.length && tokens[j].type !== 'tr_close') {
          if (tokens[j].type === 'th_open' || tokens[j].type === 'td_open') {
            const contentToken = tokens[j + 1];
            const cell: TableCellNode = {
              id: this.generateNodeId(),
              type: 'table_cell',
              props: {
                isHeader,
                content: this.extractTextContent(contentToken),
              },
              meta: { range: { start: 0, end: 0 } },
            };
            cells.push(cell);
          }
          j++;
        }
        
        const row: TableRowNode = {
          id: this.generateNodeId(),
          type: 'table_row',
          props: { isHeader },
          children: cells,
          meta: { range: { start: 0, end: 0 } },
        };
        rows.push(row);
        i = j;
      }
      i++;
    }
    
    return rows;
  }

  /**
   * 跳转到匹配的关闭 token
   */
  private skipToClosingToken(tokens: any[], startIndex: number, baseType: string): number {
    let depth = 1;
    let i = startIndex + 1;
    const openType = `${baseType}_open`;
    const closeType = `${baseType}_close`;
    
    while (i < tokens.length && depth > 0) {
      if (tokens[i].type === openType) {
        depth++;
      } else if (tokens[i].type === closeType) {
        depth--;
      }
      i++;
    }
    
    return i - 1;
  }

  /**
   * 重置处理器状态
   */
  reset(): void {
    this.buffer = '';
    this.nodeIdCounter = 1;
  }
}