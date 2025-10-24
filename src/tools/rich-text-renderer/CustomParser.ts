/**
 * 自定义 Markdown 解析器 (V2架构)
 * 
 * 核心职责：将完整的 Markdown 文本解析为 AST
 * 
 * 设计原则：
 * 1. 不处理流式逻辑（由 StreamProcessorV2 处理）
 * 2. 输入：完整的 Markdown 文本
 * 3. 输出：完整的 AST
 * 4. 两级解析：块级 → 内联
 */

import type { AstNode, GenericHtmlNode, TextNode, ParagraphNode, HeadingNode } from './types';

// ============ 令牌定义 ============

export type Token =
  | { type: 'text'; content: string }
  | { type: 'newline'; count: number }
  | { type: 'html_open'; tagName: string; attributes: Record<string, string>; selfClosing: boolean; raw: string }
  | { type: 'html_close'; tagName: string; raw: string }
  | { type: 'strong_delimiter'; marker: '**' | '__'; raw: string }
  | { type: 'em_delimiter'; marker: '*' | '_'; raw: string }
  | { type: 'code_delimiter'; marker: '`'; raw: string }
  | { type: 'strikethrough_delimiter'; marker: '~~'; raw: string }
  | { type: 'link_text_open'; raw: string }
  | { type: 'link_text_close'; raw: string }
  | { type: 'link_url_open'; raw: string }
  | { type: 'link_url_close'; raw: string }
  | { type: 'heading_marker'; level: number; raw: string }
  | { type: 'blockquote_marker'; raw: string }
  | { type: 'list_marker'; ordered: boolean; raw: string }
  | { type: 'hr_marker'; raw: string }
  | { type: 'code_fence'; language: string; raw: string };

// ============ 分词器 ============

class Tokenizer {
  private htmlTagRegex = /^<(\/?)([a-zA-Z0-9]+)\s*([^>]*?)\s*(\/?)>/;

  /**
   * 将完整文本转换为令牌序列
   */
  public tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    let atLineStart = true; // 跟踪是否在行首

    while (i < text.length) {
      const remaining = text.slice(i);

      // 换行符（优先处理，以更新 atLineStart 状态）
      const newlineMatch = remaining.match(/^(\n+)/);
      if (newlineMatch) {
        tokens.push({ type: 'newline', count: newlineMatch[1].length });
        i += newlineMatch[1].length;
        atLineStart = true;
        continue;
      }

      // 块级标记（只在行首有效）
      if (atLineStart) {
        // 允许前导空格（0-4个）用于块级元素缩进
        // 这符合 Markdown 标准，列表项可以有 0-4 个空格缩进
        const leadingSpaceMatch = remaining.match(/^( {1,4})(?=[*+\-]|\d+\.|#{1,6}\s|>|```)/);
        if (leadingSpaceMatch) {
          // 跳过前导空格，保持 atLineStart 为 true
          i += leadingSpaceMatch[1].length;
          continue;
        }
        
        // 代码围栏
        if (remaining.startsWith('```')) {
          const match = remaining.match(/^```(\w*)/);
          if (match) {
            tokens.push({ type: 'code_fence', language: match[1] || '', raw: match[0] });
            i += match[0].length;
            atLineStart = false;
            continue;
          }
        }

        // 标题标记
        const headingMatch = remaining.match(/^(#{1,6})\s/);
        if (headingMatch) {
          tokens.push({ type: 'heading_marker', level: headingMatch[1].length, raw: headingMatch[0] });
          i += headingMatch[0].length;
          atLineStart = false;
          continue;
        }

        // 水平线
        const hrMatch = remaining.match(/^(---+|\*\*\*+|___+)\s*$/m);
        if (hrMatch) {
          tokens.push({ type: 'hr_marker', raw: hrMatch[0] });
          i += hrMatch[0].length;
          atLineStart = false;
          continue;
        }

        // 列表标记（不包含前导空白）
        const listMatch = remaining.match(/^([*+-]|\d+\.)\s/);
        if (listMatch) {
          tokens.push({ type: 'list_marker', ordered: /\d+\./.test(listMatch[1]), raw: listMatch[0] });
          i += listMatch[0].length;
          atLineStart = false;
          continue;
        }

        // 引用标记
        if (remaining.startsWith('> ') || remaining.startsWith('>')) {
          const match = remaining.match(/^>\s?/);
          if (match) {
            tokens.push({ type: 'blockquote_marker', raw: match[0] });
            i += match[0].length;
            atLineStart = false;
            continue;
          }
        }
      }

      // HTML 标签（无论是否行首都有效）
      const htmlMatch = remaining.match(this.htmlTagRegex);
      if (htmlMatch) {
        const rawTag = htmlMatch[0];
        const isClosing = !!htmlMatch[1];
        const isSelfClosing = !!htmlMatch[4];
        const tagName = htmlMatch[2].toLowerCase();
        const attributes = this.parseAttributes(htmlMatch[3]);

        if (isClosing) {
          tokens.push({ type: 'html_close', tagName, raw: rawTag });
        } else {
          tokens.push({ type: 'html_open', tagName, attributes, selfClosing: isSelfClosing, raw: rawTag });
        }
        i += rawTag.length;
        atLineStart = false;
        continue;
      }

      // Markdown 内联定界符
      if (remaining.startsWith('~~')) {
        tokens.push({ type: 'strikethrough_delimiter', marker: '~~', raw: '~~' });
        i += 2;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith('**')) {
        tokens.push({ type: 'strong_delimiter', marker: '**', raw: '**' });
        i += 2;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith('__')) {
        tokens.push({ type: 'strong_delimiter', marker: '__', raw: '__' });
        i += 2;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith('*') && !remaining.startsWith('**')) {
        tokens.push({ type: 'em_delimiter', marker: '*', raw: '*' });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith('_') && !remaining.startsWith('__')) {
        tokens.push({ type: 'em_delimiter', marker: '_', raw: '_' });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith('`')) {
        tokens.push({ type: 'code_delimiter', marker: '`', raw: '`' });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith('[')) {
        tokens.push({ type: 'link_text_open', raw: '[' });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith(']')) {
        tokens.push({ type: 'link_text_close', raw: ']' });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith('(')) {
        tokens.push({ type: 'link_url_open', raw: '(' });
        i += 1;
        atLineStart = false;
        continue;
      }
      if (remaining.startsWith(')')) {
        tokens.push({ type: 'link_url_close', raw: ')' });
        i += 1;
        atLineStart = false;
        continue;
      }

      // 普通文本
      const specialChars = /<|`|\*|_|~|\[|\]|\(|\)|#|>|\n/;
      const nextSpecialIndex = remaining.search(specialChars);
      
      const textContent = nextSpecialIndex === -1
        ? remaining
        : nextSpecialIndex === 0
          ? remaining[0]
          : remaining.substring(0, nextSpecialIndex);
      
      if (textContent.length > 0) {
        tokens.push({ type: 'text', content: textContent });
        i += textContent.length;
        atLineStart = false;
        continue;
      }

      // 安全保护
      i++;
      atLineStart = false;
    }

    return tokens;
  }

  private parseAttributes(attrString: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
    let match;
    while ((match = attrRegex.exec(attrString)) !== null) {
      const key = match[1];
      const value = match[2] || match[3] || match[4] || '';
      attributes[key] = value;
    }
    return attributes;
  }
}

// ============ 解析器 ============

export class CustomParser {
  /**
   * 解析完整的 Markdown 文本
   */
  public parse(text: string): AstNode[] {
    if (!text) return [];
    
    const tokenizer = new Tokenizer();
    const tokens = tokenizer.tokenize(text);
    
    return this.parseBlocks(tokens);
  }

  /**
   * 块级解析
   */
  private parseBlocks(tokens: Token[]): AstNode[] {
    const blocks: AstNode[] = [];
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      // 跳过换行
      if (token.type === 'newline') {
        i++;
        continue;
      }

      // 代码块
      if (token.type === 'code_fence') {
        const { node, nextIndex } = this.parseCodeBlock(tokens, i);
        if (node) blocks.push(node);
        i = nextIndex;
        continue;
      }

      // 标题
      if (token.type === 'heading_marker') {
        const { node, nextIndex } = this.parseHeading(tokens, i);
        if (node) blocks.push(node);
        i = nextIndex;
        continue;
      }

      // 引用块
      if (token.type === 'blockquote_marker') {
        const { node, nextIndex } = this.parseBlockquote(tokens, i);
        if (node) blocks.push(node);
        i = nextIndex;
        continue;
      }

      // 列表
      if (token.type === 'list_marker') {
        const { node, nextIndex } = this.parseList(tokens, i);
        if (node) blocks.push(node);
        i = nextIndex;
        continue;
      }

      // 表格（检测表格起始）
      if (this.isTableStart(tokens, i)) {
        const { node, nextIndex } = this.parseTable(tokens, i);
        if (node) blocks.push(node);
        i = nextIndex;
        continue;
      }

      // HTML 块
      if (token.type === 'html_open') {
        const { node, nextIndex } = this.parseHtmlBlock(tokens, i);
        if (node) blocks.push(node);
        i = nextIndex;
        continue;
      }

      // 水平线
      if (token.type === 'hr_marker') {
        blocks.push({
          id: '',
          type: 'hr',
          props: {},
          meta: { range: { start: 0, end: 0 }, status: 'stable' }
        });
        i++;
        continue;
      }

      // 段落（默认）
      const { node, nextIndex } = this.parseParagraph(tokens, i);
      if (node) blocks.push(node);
      i = nextIndex;
    }

    return blocks;
  }

  /**
   * 解析标题
   */
  private parseHeading(tokens: Token[], start: number): { node: HeadingNode | null; nextIndex: number } {
    const marker = tokens[start];
    if (marker.type !== 'heading_marker') {
      return { node: null, nextIndex: start + 1 };
    }

    const level = marker.level;
    let i = start + 1;

    // 收集到换行为止
    const contentTokens: Token[] = [];
    while (i < tokens.length && tokens[i].type !== 'newline') {
      contentTokens.push(tokens[i]);
      i++;
    }

    // 跳过换行
    if (i < tokens.length && tokens[i].type === 'newline') {
      i++;
    }

    const children = this.parseInlines(contentTokens);

    return {
      node: {
        id: '',
        type: 'heading',
        props: { level },
        children,
        meta: { range: { start: 0, end: 0 }, status: 'stable' }
      },
      nextIndex: i
    };
  }

  /**
   * 解析 HTML 块
   */
  private parseHtmlBlock(tokens: Token[], start: number): { node: GenericHtmlNode | null; nextIndex: number } {
    const openToken = tokens[start];
    if (openToken.type !== 'html_open') {
      return { node: null, nextIndex: start + 1 };
    }

    const tagName = openToken.tagName;
    const attributes = openToken.attributes;
    const isSelfClosing = openToken.selfClosing;

    let i = start + 1;

    const htmlNode: GenericHtmlNode = {
      id: '',
      type: 'generic_html',
      props: { tagName, attributes },
      children: [],
      meta: { range: { start: 0, end: 0 }, status: 'stable' }
    };

    if (isSelfClosing) {
      return { node: htmlNode, nextIndex: i };
    }

    // 收集内部令牌（去除纯空白的文本节点）
    const contentTokens: Token[] = [];
    let depth = 1;

    while (i < tokens.length && depth > 0) {
      const t = tokens[i];

      if (t.type === 'html_open' && t.tagName === tagName && !t.selfClosing) {
        depth++;
        contentTokens.push(t);
      } else if (t.type === 'html_close' && t.tagName === tagName) {
        depth--;
        if (depth === 0) {
          i++; // 跳过闭合标签
          break;
        }
        contentTokens.push(t);
      } else {
        // 过滤纯空白文本（包括缩进）
        if (t.type === 'text' && /^\s+$/.test(t.content)) {
          // 跳过纯空白
          i++;
          continue;
        }
        contentTokens.push(t);
      }
      i++;
    }

    // 递归解析内部内容
    if (contentTokens.length > 0) {
      htmlNode.children = this.parseBlocks(contentTokens);
    }

    return { node: htmlNode, nextIndex: i };
  }

  /**
   * 解析段落
   */
  private parseParagraph(tokens: Token[], start: number): { node: ParagraphNode | null; nextIndex: number } {
    const contentTokens: Token[] = [];
    let i = start;

    while (i < tokens.length) {
      const t = tokens[i];

      // 块级分隔符：双换行
      if (t.type === 'newline') {
        if (t.count >= 2) {
          break;
        }
        // 单换行继续收集
        contentTokens.push(t);
        i++;
        continue;
      }

      // 块级标记：遇到这些标记停止段落
      if (t.type === 'heading_marker' ||
          t.type === 'html_open' ||
          t.type === 'hr_marker' ||
          t.type === 'code_fence' ||
          t.type === 'list_marker' ||
          t.type === 'blockquote_marker') {
        break;
      }

      contentTokens.push(t);
      i++;
    }

    if (contentTokens.length === 0) {
      return { node: null, nextIndex: i };
    }

    const children = this.parseInlines(contentTokens);

    if (children.length === 0) {
      return { node: null, nextIndex: i };
    }

    return {
      node: {
        id: '',
        type: 'paragraph',
        props: {},
        children,
        meta: { range: { start: 0, end: 0 }, status: 'stable' }
      },
      nextIndex: i
    };
  }

  /**
   * 内联解析
   */
  private parseInlines(tokens: Token[]): AstNode[] {
    const nodes: AstNode[] = [];
    let i = 0;
    let accumulatedText = '';

    const flushText = () => {
      if (accumulatedText) {
        // 去除纯空白文本
        if (accumulatedText.trim().length > 0) {
          nodes.push(this.createTextNode(accumulatedText));
        }
        accumulatedText = '';
      }
    };

    while (i < tokens.length) {
      const token = tokens[i];

      // HTML 内联标签
      if (token.type === 'html_open') {
        flushText();

        const tagName = token.tagName;
        const htmlNode: GenericHtmlNode = {
          id: '',
          type: 'generic_html',
          props: { tagName, attributes: token.attributes },
          children: [],
          meta: { range: { start: 0, end: 0 }, status: 'stable' }
        };

        i++;

        if (token.selfClosing) {
          nodes.push(htmlNode);
          continue;
        }

        // 收集内部令牌
        const innerTokens: Token[] = [];
        let depth = 1;

        while (i < tokens.length && depth > 0) {
          const t = tokens[i];

          if (t.type === 'html_open' && t.tagName === tagName && !t.selfClosing) {
            depth++;
            innerTokens.push(t);
          } else if (t.type === 'html_close' && t.tagName === tagName) {
            depth--;
            if (depth === 0) {
              i++;
              break;
            }
            innerTokens.push(t);
          } else {
            // 过滤纯空白文本
            if (t.type === 'text' && /^\s+$/.test(t.content)) {
              i++;
              continue;
            }
            innerTokens.push(t);
          }
          i++;
        }

        htmlNode.children = this.parseInlines(innerTokens);
        nodes.push(htmlNode);
        continue;
      }

      // 加粗
      if (token.type === 'strong_delimiter') {
        flushText();
        i++;

        const innerTokens: Token[] = [];
        while (i < tokens.length) {
          const t = tokens[i];
          if (t.type === 'strong_delimiter' && t.marker === token.marker) {
            i++;
            break;
          }
          innerTokens.push(t);
          i++;
        }

        nodes.push({
          id: '',
          type: 'strong',
          props: {},
          children: this.parseInlines(innerTokens),
          meta: { range: { start: 0, end: 0 }, status: 'stable' }
        });
        continue;
      }

      // 斜体
      if (token.type === 'em_delimiter') {
        flushText();
        i++;

        const innerTokens: Token[] = [];
        while (i < tokens.length) {
          const t = tokens[i];
          if (t.type === 'em_delimiter' && t.marker === token.marker) {
            i++;
            break;
          }
          innerTokens.push(t);
          i++;
        }

        nodes.push({
          id: '',
          type: 'em',
          props: {},
          children: this.parseInlines(innerTokens),
          meta: { range: { start: 0, end: 0 }, status: 'stable' }
        });
        continue;
      }

      // 行内代码
      if (token.type === 'code_delimiter') {
        flushText();
        i++;

        let codeContent = '';
        while (i < tokens.length) {
          const t = tokens[i];
          if (t.type === 'code_delimiter') {
            i++;
            break;
          }
          if (t.type === 'text') {
            codeContent += t.content;
          }
          i++;
        }

        nodes.push({
          id: '',
          type: 'inline_code',
          props: { content: codeContent },
          meta: { range: { start: 0, end: 0 }, status: 'stable' }
        });
        continue;
      }

      // 删除线
      if (token.type === 'strikethrough_delimiter') {
        flushText();
        i++;

        const innerTokens: Token[] = [];
        while (i < tokens.length) {
          const t = tokens[i];
          if (t.type === 'strikethrough_delimiter') {
            i++;
            break;
          }
          innerTokens.push(t);
          i++;
        }

        nodes.push({
          id: '',
          type: 'strikethrough',
          props: {},
          children: this.parseInlines(innerTokens),
          meta: { range: { start: 0, end: 0 }, status: 'stable' }
        });
        continue;
      }

      // 链接
      if (token.type === 'link_text_open') {
        flushText();
        i++;

        const linkTextTokens: Token[] = [];
        while (i < tokens.length) {
          const t = tokens[i];
          if (t.type === 'link_text_close') {
            i++;
            break;
          }
          linkTextTokens.push(t);
          i++;
        }

        let href = '';
        if (i < tokens.length && tokens[i].type === 'link_url_open') {
          i++;

          while (i < tokens.length) {
            const t = tokens[i];
            if (t.type === 'link_url_close') {
              i++;
              break;
            }
            if (t.type === 'text') {
              href += t.content;
            }
            i++;
          }
        }

        nodes.push({
          id: '',
          type: 'link',
          props: { href, title: '' },
          children: this.parseInlines(linkTextTokens),
          meta: { range: { start: 0, end: 0 }, status: 'stable' }
        });
        continue;
      }

      // 文本
      if (token.type === 'text') {
        accumulatedText += token.content;
        i++;
        continue;
      }

      // 单换行转为硬换行
      if (token.type === 'newline' && token.count === 1) {
        flushText();
        nodes.push({
          id: '',
          type: 'hard_break',
          props: {},
          meta: { range: { start: 0, end: 0 }, status: 'stable' }
        });
        i++;
        continue;
      }

      // 其他令牌跳过
      i++;
    }

    flushText();
    return nodes;
  }

  /**
   * 解析代码块
   */
  private parseCodeBlock(tokens: Token[], start: number): { node: AstNode | null; nextIndex: number } {
    const openFence = tokens[start];
    if (openFence.type !== 'code_fence') {
      return { node: null, nextIndex: start + 1 };
    }

    const language = openFence.language || '';
    let i = start + 1;
    let codeContent = '';

    // 收集代码内容直到遇到闭合围栏
    while (i < tokens.length) {
      const t = tokens[i];
      
      if (t.type === 'code_fence') {
        i++; // 跳过闭合围栏
        break;
      }
      
      if (t.type === 'text') {
        codeContent += t.content;
      } else if (t.type === 'newline') {
        codeContent += '\n'.repeat(t.count);
      }
      
      i++;
    }

    return {
      node: {
        id: '',
        type: 'code_block',
        props: { language, content: codeContent },
        meta: { range: { start: 0, end: 0 }, status: 'stable' }
      },
      nextIndex: i
    };
  }

  /**
   * 解析引用块
   */
  private parseBlockquote(tokens: Token[], start: number): { node: AstNode | null; nextIndex: number } {
    let i = start;
    const quoteLines: Token[][] = [];
    let currentLine: Token[] = [];

    // 收集所有引用行
    while (i < tokens.length) {
      const t = tokens[i];

      // 遇到非引用标记的行首标记，结束引用
      if (t.type === 'heading_marker' ||
          t.type === 'hr_marker' ||
          t.type === 'code_fence' ||
          t.type === 'list_marker') {
        break;
      }

      // 引用标记
      if (t.type === 'blockquote_marker') {
        // 保存上一行（如果有）
        if (currentLine.length > 0) {
          quoteLines.push(currentLine);
          currentLine = [];
        }
        i++;
        continue;
      }

      // 换行
      if (t.type === 'newline') {
        if (currentLine.length > 0) {
          quoteLines.push(currentLine);
          currentLine = [];
        }
        
        // 双换行结束引用
        if (t.count >= 2) {
          i++;
          break;
        }
        
        i++;
        continue;
      }

      // 收集内容
      currentLine.push(t);
      i++;
    }

    // 保存最后一行
    if (currentLine.length > 0) {
      quoteLines.push(currentLine);
    }

    if (quoteLines.length === 0) {
      return { node: null, nextIndex: i };
    }

    // 将所有行合并，用单换行分隔
    const allTokens: Token[] = [];
    for (let j = 0; j < quoteLines.length; j++) {
      allTokens.push(...quoteLines[j]);
      if (j < quoteLines.length - 1) {
        allTokens.push({ type: 'newline', count: 1 });
      }
    }

    const children = this.parseBlocks(allTokens);

    return {
      node: {
        id: '',
        type: 'blockquote',
        props: {},
        children,
        meta: { range: { start: 0, end: 0 }, status: 'stable' }
      },
      nextIndex: i
    };
  }

  /**
   * 解析列表
   */
  private parseList(tokens: Token[], start: number): { node: AstNode | null; nextIndex: number } {
    const firstMarker = tokens[start];
    if (firstMarker.type !== 'list_marker') {
      return { node: null, nextIndex: start + 1 };
    }

    const ordered = firstMarker.ordered;
    let i = start;
    const items: AstNode[] = [];

    while (i < tokens.length) {
      const t = tokens[i];

      // 检查是否是同类型的列表标记
      if (t.type !== 'list_marker') {
        break;
      }
      
      // 不同类型的列表标记，结束当前列表
      if (t.ordered !== ordered) {
        break;
      }

      // 解析列表项
      i++; // 跳过列表标记
      const itemTokens: Token[] = [];

      while (i < tokens.length) {
        const tok = tokens[i];

        // 遇到新的列表项结束当前项
        if (tok.type === 'list_marker') {
          break;
        }

        // 遇到其他块级标记结束当前项
        if (tok.type === 'heading_marker' ||
            tok.type === 'html_open' ||
            tok.type === 'hr_marker' ||
            tok.type === 'code_fence' ||
            tok.type === 'blockquote_marker') {
          break;
        }

        // 遇到双换行结束当前项
        if (tok.type === 'newline' && tok.count >= 2) {
          i++; // 跳过双换行
          break;
        }

        // 单换行：继续收集
        if (tok.type === 'newline') {
          itemTokens.push(tok);
          i++;
          continue;
        }

        itemTokens.push(tok);
        i++;
      }

      if (itemTokens.length > 0) {
        // 列表项内容作为块级元素解析
        const itemChildren = this.parseBlocks(itemTokens);
        
        // 如果解析出了内容
        if (itemChildren.length > 0) {
          items.push({
            id: '',
            type: 'list_item',
            props: {},
            children: itemChildren,
            meta: { range: { start: 0, end: 0 }, status: 'stable' }
          });
        }
      }
    }

    if (items.length === 0) {
      return { node: null, nextIndex: i };
    }

    return {
      node: {
        id: '',
        type: 'list',
        props: { ordered },
        children: items,
        meta: { range: { start: 0, end: 0 }, status: 'stable' }
      },
      nextIndex: i
    };
  }

  /**
   * 检查是否是表格开始
   */
  private isTableStart(tokens: Token[], index: number): boolean {
    // 简单检测：查找包含 | 的行，后跟分隔行
    let i = index;
    let hasContent = false;
    let hasPipe = false;

    // 检查第一行是否包含 |
    while (i < tokens.length) {
      const t = tokens[i];
      
      if (t.type === 'newline') {
        break;
      }
      
      if (t.type === 'text') {
        hasContent = true;
        if (t.content.includes('|')) {
          hasPipe = true;
        }
      }
      
      i++;
    }

    if (!hasPipe || !hasContent) {
      return false;
    }

    // 跳过换行
    if (i < tokens.length && tokens[i].type === 'newline') {
      i++;
    }

    // 检查下一行是否是分隔符行
    let separatorLine = '';
    while (i < tokens.length) {
      const t = tokens[i];
      
      if (t.type === 'newline') {
        break;
      }
      
      if (t.type === 'text') {
        separatorLine += t.content;
      }
      
      i++;
    }

    // 分隔符行应该匹配 |---:|:---|:---:| 等模式
    return /^\|?[\s:-]+\|/.test(separatorLine.trim());
  }

  /**
   * 解析表格
   */
  private parseTable(tokens: Token[], start: number): { node: AstNode | null; nextIndex: number } {
    let i = start;
    const rows: AstNode[] = [];

    // 解析表头
    const headerCells: AstNode[] = [];
    let cellContent: Token[] = [];
    
    while (i < tokens.length) {
      const t = tokens[i];
      
      if (t.type === 'newline') {
        if (cellContent.length > 0) {
          const cellChildren = this.parseInlines(cellContent);
          headerCells.push({
            id: '',
            type: 'table_cell',
            props: { isHeader: true },
            children: cellChildren,
            meta: { range: { start: 0, end: 0 }, status: 'stable' }
          });
        }
        i++;
        break;
      }
      
      if (t.type === 'text') {
        const parts = t.content.split('|');
        for (let j = 0; j < parts.length; j++) {
          const part = parts[j].trim();
          if (part) {
            cellContent.push({ type: 'text', content: part });
          }
          if (j < parts.length - 1) {
            // 遇到 | 分隔符，保存当前单元格
            if (cellContent.length > 0) {
              const cellChildren = this.parseInlines(cellContent);
              headerCells.push({
                id: '',
                type: 'table_cell',
                props: { isHeader: true },
                children: cellChildren,
                meta: { range: { start: 0, end: 0 }, status: 'stable' }
              });
              cellContent = [];
            }
          }
        }
      } else {
        cellContent.push(t);
      }
      
      i++;
    }

    if (headerCells.length > 0) {
      rows.push({
        id: '',
        type: 'table_row',
        props: { isHeader: true },
        children: headerCells,
        meta: { range: { start: 0, end: 0 }, status: 'stable' }
      });
    }

    // 跳过分隔符行
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.type === 'newline') {
        i++;
        break;
      }
      i++;
    }

    // 解析表格内容行
    while (i < tokens.length) {
      const t = tokens[i];
      
      // 空行或非表格行结束表格
      if (t.type === 'newline' ||
          t.type === 'heading_marker' ||
          t.type === 'html_open' ||
          t.type === 'hr_marker' ||
          t.type === 'code_fence' ||
          t.type === 'list_marker' ||
          t.type === 'blockquote_marker') {
        break;
      }

      // 检查是否包含 |
      let hasPipe = false;
      if (t.type === 'text' && t.content.includes('|')) {
        hasPipe = true;
      }

      if (!hasPipe) {
        break;
      }

      // 解析数据行
      const dataCells: AstNode[] = [];
      cellContent = [];
      
      while (i < tokens.length) {
        const tok = tokens[i];
        
        if (tok.type === 'newline') {
          if (cellContent.length > 0) {
            const cellChildren = this.parseInlines(cellContent);
            dataCells.push({
              id: '',
              type: 'table_cell',
              props: {},
              children: cellChildren,
              meta: { range: { start: 0, end: 0 }, status: 'stable' }
            });
          }
          i++;
          break;
        }
        
        if (tok.type === 'text') {
          const parts = tok.content.split('|');
          for (let j = 0; j < parts.length; j++) {
            const part = parts[j].trim();
            if (part) {
              cellContent.push({ type: 'text', content: part });
            }
            if (j < parts.length - 1) {
              if (cellContent.length > 0) {
                const cellChildren = this.parseInlines(cellContent);
                dataCells.push({
                  id: '',
                  type: 'table_cell',
                  props: {},
                  children: cellChildren,
                  meta: { range: { start: 0, end: 0 }, status: 'stable' }
                });
                cellContent = [];
              }
            }
          }
        } else {
          cellContent.push(tok);
        }
        
        i++;
      }

      if (dataCells.length > 0) {
        rows.push({
          id: '',
          type: 'table_row',
          props: {},
          children: dataCells,
          meta: { range: { start: 0, end: 0 }, status: 'stable' }
        });
      }
    }

    if (rows.length === 0) {
      return { node: null, nextIndex: i };
    }

    return {
      node: {
        id: '',
        type: 'table',
        props: {},
        children: rows,
        meta: { range: { start: 0, end: 0 }, status: 'stable' }
      },
      nextIndex: i
    };
  }

  private createTextNode(content: string): TextNode {
    return {
      id: '',
      type: 'text',
      props: { content },
      meta: { range: { start: 0, end: 0 }, status: 'stable' }
    };
  }

  public reset(): void {
    // 不再需要重置计数器
  }
}

// ============ 导出工具函数 ============

export function parseText(text: string): AstNode[] {
  const parser = new CustomParser();
  return parser.parse(text);
}