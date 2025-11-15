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
  | { type: 'inline_code'; content: string }
  | { type: 'strikethrough_delimiter'; marker: '~~'; raw: string }
  | { type: 'image_marker'; raw: string }
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
  
  // HTML void elements (不需要闭合标签的元素)
  private voidElements = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

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
        
        // 代码围栏 - 立即处理整个代码块
        if (remaining.startsWith('```')) {
          const openMatch = remaining.match(/^```(\w*)/);
          if (openMatch) {
            const language = openMatch[1] || '';
            i += openMatch[0].length; // 跳过开始标记
            
            // 跳过开始标记后的第一个换行符（如果有）
            if (i < text.length && text[i] === '\n') {
              i++;
            }
            
            // 收集代码块内容（原始文本，不做任何解析）
            let codeContent = '';
            
            while (i < text.length) {
              // 检查是否遇到闭合的 ```
              if (text[i] === '\n' || i === 0) {
                const checkRemaining = text.slice(i === 0 ? i : i + 1);
                if (checkRemaining.startsWith('```')) {
                  if (i > 0 && text[i] === '\n') {
                    i++; // 跳过最后一个换行
                  }
                  i += 3; // 跳过 ```
                  break;
                }
              }
              
              codeContent += text[i];
              i++;
            }
            
            // 添加代码块 token（包含完整内容）
            tokens.push({ type: 'code_fence', language, raw: codeContent });
            atLineStart = true;
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
        const tagName = htmlMatch[2].toLowerCase();
        const attributes = this.parseAttributes(htmlMatch[3]);
        
        // 判断是否是自闭合标签：显式的 /> 或者是 void element
        const isSelfClosing = !!htmlMatch[4] || this.voidElements.has(tagName);

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
      // 行内代码 - 立即处理完整的代码块
      if (remaining.startsWith('`')) {
        const codeMatch = remaining.match(/^`([^`]*)`/);
        if (codeMatch) {
          // 找到了完整的行内代码
          tokens.push({ type: 'inline_code', content: codeMatch[1] });
          i += codeMatch[0].length;
          atLineStart = false;
          continue;
        } else {
          // 没有找到匹配的反引号，按普通文本处理
          tokens.push({ type: 'text', content: '`' });
          i += 1;
          atLineStart = false;
          continue;
        }
      }
      // 图片标记 ![
      if (remaining.startsWith('![')) {
        tokens.push({ type: 'image_marker', raw: '!' });
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
      const specialChars = /<|`|\*|_|~|!|\[|\]|\(|\)|#|>|\n/;
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
    
    const blocks = this.parseBlocks(tokens);
    
    // 优化徽章之间的换行
    return this.optimizeBadgeLineBreaks(blocks);
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

    // 判断是块级还是内联 HTML 元素
    const blockLevelTags = ['div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav', 'blockquote', 'pre', 'table', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'details', 'summary'];
    const isBlockLevel = blockLevelTags.includes(tagName);

    // 收集内部令牌
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
      // 块级元素：使用块级解析
      // 内联元素：使用内联解析
      if (isBlockLevel) {
        htmlNode.children = this.parseBlocks(contentTokens);
      } else {
        htmlNode.children = this.parseInlines(contentTokens);
      }
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

      // 行内代码 - 直接使用分词器处理好的内容
      if (token.type === 'inline_code') {
        flushText();
        nodes.push({
          id: '',
          type: 'inline_code',
          props: { content: token.content },
          meta: { range: { start: 0, end: 0 }, status: 'stable' }
        });
        i++;
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

      // 图片 ![alt](url)
      if (token.type === 'image_marker') {
        flushText();
        i++;

        // 检查后面是否跟着 [
        if (i < tokens.length && tokens[i].type === 'link_text_open') {
          i++; // 跳过 [

          // 收集 alt 文本
          let alt = '';
          while (i < tokens.length) {
            const t = tokens[i];
            if (t.type === 'link_text_close') {
              i++;
              break;
            }
            if (t.type === 'text') {
              alt += t.content;
            }
            i++;
          }

          // 收集 URL
          let src = '';
          let title = '';
          if (i < tokens.length && tokens[i].type === 'link_url_open') {
            i++;

            while (i < tokens.length) {
              const t = tokens[i];
              if (t.type === 'link_url_close') {
                i++;
                break;
              }
              if (t.type === 'text') {
                // 支持 title：(url "title")
                const parts = t.content.match(/^([^\s]+)(?:\s+"([^"]+)")?$/);
                if (parts) {
                  src += parts[1];
                  if (parts[2]) {
                    title = parts[2];
                  }
                } else {
                  src += t.content;
                }
              }
              i++;
            }
          }

          nodes.push({
            id: '',
            type: 'image',
            props: { src, alt, title },
            meta: { range: { start: 0, end: 0 }, status: 'stable' }
          });
          continue;
        } else {
          // 不是图片语法，按普通文本处理
          accumulatedText += '!';
          continue;
        }
      }

      // 链接 [text](url)
      if (token.type === 'link_text_open') {
        flushText();
        i++;

        // 收集链接文本，支持嵌套的括号（如图片）
        const linkTextTokens: Token[] = [];
        let bracketDepth = 1; // 已经遇到了一个 [
        
        while (i < tokens.length && bracketDepth > 0) {
          const t = tokens[i];
          
          if (t.type === 'link_text_open') {
            bracketDepth++;
            linkTextTokens.push(t);
          } else if (t.type === 'link_text_close') {
            bracketDepth--;
            if (bracketDepth === 0) {
              i++; // 跳过最外层的 ]
              break;
            }
            linkTextTokens.push(t);
          } else {
            linkTextTokens.push(t);
          }
          i++;
        }

        // 收集 URL
        let href = '';
        let title = '';
        if (i < tokens.length && tokens[i].type === 'link_url_open') {
          i++;
          
          let parenDepth = 1; // 已经遇到了一个 (
          
          while (i < tokens.length && parenDepth > 0) {
            const t = tokens[i];
            
            if (t.type === 'link_url_open') {
              parenDepth++;
              if (parenDepth > 1) {
                href += '(';
              }
            } else if (t.type === 'link_url_close') {
              parenDepth--;
              if (parenDepth === 0) {
                i++; // 跳过最外层的 )
                break;
              }
              href += ')';
            } else if (t.type === 'text') {
              // 支持 title：(url "title")
              const parts = t.content.match(/^([^\s]+)(?:\s+"([^"]+)")?$/);
              if (parts) {
                href += parts[1];
                if (parts[2]) {
                  title = parts[2];
                }
              } else {
                href += t.content;
              }
            }
            i++;
          }
        }

        nodes.push({
          id: '',
          type: 'link',
          props: { href, title },
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
   * 解析代码块 - 分词器已经处理好了完整内容
   */
  private parseCodeBlock(tokens: Token[], start: number): { node: AstNode | null; nextIndex: number } {
    const fence = tokens[start];
    if (fence.type !== 'code_fence') {
      return { node: null, nextIndex: start + 1 };
    }

    const language = fence.language || '';
    
    // 如果语言标记为 mermaid，则生成 MermaidNode
    if (language === 'mermaid') {
      return {
        node: {
          id: '',
          type: 'mermaid',
          props: {
            content: fence.raw
          },
          meta: { range: { start: 0, end: 0 }, status: 'stable' }
        },
        nextIndex: start + 1
      };
    }

    return {
      node: {
        id: '',
        type: 'code_block',
        props: {
          language,
          content: fence.raw // raw 现在包含完整的代码内容
        },
        meta: { range: { start: 0, end: 0 }, status: 'stable' }
      },
      nextIndex: start + 1
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

  /**
   * 优化连续链接（徽章和导航链接）之间的换行
   * 检测以 [ 开头的链接（包括图片链接和普通链接），移除它们之间的硬换行
   */
  private optimizeBadgeLineBreaks(nodes: AstNode[]): AstNode[] {
    return nodes.map(node => {
      // 只处理段落节点
      if (node.type !== 'paragraph' || !node.children) {
        // 递归处理子节点
        if (node.children) {
          return {
            ...node,
            children: this.optimizeBadgeLineBreaks(node.children)
          };
        }
        return node;
      }

      // 处理段落内的子节点
      const children = node.children;
      const optimizedChildren: AstNode[] = [];
      
      for (let i = 0; i < children.length; i++) {
        const current = children[i];
        const next = children[i + 1];
        const afterNext = children[i + 2];
        const afterAfterNext = children[i + 3];

        // 检测是否是链接或图片节点
        const isLinkLike = (n: AstNode | undefined): boolean => {
          if (!n) return false;
          return n.type === 'link' || n.type === 'image';
        };

        // 模式1：链接 + 硬换行 + 链接
        if (isLinkLike(current) &&
            next?.type === 'hard_break' &&
            isLinkLike(afterNext)) {
          // 保留当前节点，跳过硬换行
          optimizedChildren.push(current);
          i++; // 跳过 hard_break
          continue;
        }

        // 模式2：链接 + 短文本分隔符 + 硬换行 + 链接
        if (isLinkLike(current) &&
            next?.type === 'text' &&
            typeof next.props?.content === 'string' &&
            next.props.content.trim().length <= 3 && // 短分隔符，如 " •"
            afterNext?.type === 'hard_break' &&
            isLinkLike(afterAfterNext)) {
          // 保留当前链接和分隔符，跳过硬换行
          optimizedChildren.push(current);
          optimizedChildren.push(next); // 分隔符文本
          i += 2; // 跳过分隔符和硬换行
          continue;
        }

        optimizedChildren.push(current);
      }

      return {
        ...node,
        children: optimizedChildren
      };
    });
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