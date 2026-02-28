/**
 * 流式处理器 V2 - 基于 CustomParser 的新实现
 *
 * 核心设计：
 * 1. 使用 CustomParser 替代 markdown-it
 * 2. 借鉴 V1 的边界检测和稳定区/待定区分离策略
 * 3. CustomParser 只负责解析完整文本，本类负责流式管理
 */

import type { AstNode, Patch, StreamProcessorOptions, LlmThinkRule } from "../types";
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
  private llmThinkTagNames: Set<string>;

  constructor(llmThinkTagNames: Set<string> = new Set()) {
    this.llmThinkTagNames = llmThinkTagNames;
  }

  isSafeParsePoint(text: string): boolean {
    const lines = text.split("\n");
    if (this.isInsideCodeBlock(lines)) return false;
    if (this.isIncompleteTable(lines.slice(-3))) return false;
    if (this.hasUnclosedKatexBlock(text)) return false;

    // 内联链接/图片检查
    if (this.hasUnclosedLinkOrImage(text)) return false;

    // HTML 综合检查
    if (this.hasUnclosedHtmlTags(text)) return false;
    if (this.hasIncompleteHtmlTag(text)) return false;
    if (this.isLikelyInsideHtmlAttribute(text)) return false;

    return true;
  }

  /**
   * 检查是否可能处于 HTML 属性值中间
   */
  private isLikelyInsideHtmlAttribute(fullText: string): boolean {
    // 查找最后一个 <，看它之后是否有未闭合的引号
    const lastOpenBracket = fullText.lastIndexOf("<");
    if (lastOpenBracket === -1) return false;

    const textAfterBracket = fullText.slice(lastOpenBracket);
    // 如果已经闭合了标签，则不属于属性中间
    if (textAfterBracket.includes(">")) return false;

    // 统计引号数量
    const doubleQuotes = (textAfterBracket.match(/"/g) || []).length;
    const singleQuotes = (textAfterBracket.match(/'/g) || []).length;

    // 如果某类引号是奇数个，说明未闭合
    return doubleQuotes % 2 !== 0 || singleQuotes % 2 !== 0;
  }

  /**
   * 检查是否存在未闭合的 KaTeX 块级公式 $$...$$
   *
   * 策略：统计 $$ 的出现次数，如果是奇数则说明有未闭合的块级公式
   * 注意：需要排除被转义的 \$$ 和行内公式 $...$
   */
  private hasUnclosedKatexBlock(text: string): boolean {
    // 移除转义的 \$
    const cleanText = text.replace(/\\\$/g, "");

    // 统计 $$ 的出现次数
    let count = 0;
    let i = 0;
    while (i < cleanText.length) {
      if (cleanText[i] === "$" && i + 1 < cleanText.length && cleanText[i + 1] === "$") {
        count++;
        i += 2; // 跳过这两个 $
      } else {
        i++;
      }
    }

    // 如果 $$ 出现次数为奇数，说明有未闭合的块级公式
    return count % 2 !== 0;
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
   * 检测两种情况：
   * 1. 已完成的 HTML 标签（有 >）但未闭合（缺少 </tag>）
   * 2. 未完成的 HTML 标签（缺少 >，如 <div style="...）
   *
   * 策略：
   * - 统计开放标签和闭合标签的数量
   * - 跳过自闭合标签（如 <br />）
   * - 跳过常见的空标签（如 <img>, <hr>）
   * - 特别处理 LLM 思考标签
   * - 检测未完成的 HTML 标签（流式输出中常见）
   */
  private hasUnclosedHtmlTags(text: string): boolean {
    const tagStack: string[] = [];
    const thinkTagStack: string[] = [];
    const selfClosingTags = new Set(["br", "hr", "img", "input", "meta", "link"]);

    // 匹配所有 HTML 标签
    const tagRegex = /<\/?([a-zA-Z0-9]+)(?:\s[^>]*)?\/?>/g;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();

      // 特别处理 LLM 思考标签
      if (this.llmThinkTagNames.has(tagName)) {
        // 跳过自闭合标签
        if (fullTag.endsWith("/>")) continue;

        if (fullTag.startsWith("</")) {
          // 闭合标签
          if (thinkTagStack.length > 0 && thinkTagStack[thinkTagStack.length - 1] === tagName) {
            thinkTagStack.pop();
          }
        } else {
          // 开放标签
          thinkTagStack.push(tagName);
        }
        continue;
      }

      // 跳过自闭合标签
      if (selfClosingTags.has(tagName)) continue;
      if (fullTag.endsWith("/>")) continue;

      // 闭合标签
      if (fullTag.startsWith("</")) {
        // 从栈顶弹出匹配的开放标签
        if (tagStack.length > 0 && tagStack[tagStack.length - 1] === tagName) {
          tagStack.pop();
        }
      } else {
        // 开放标签
        tagStack.push(tagName);
      }
    }

    // 如果有未闭合的思考标签，说明不安全
    return tagStack.length > 0 || thinkTagStack.length > 0;
  }

  /**
   * 检测未闭合的内联链接或图片 [text](url) 或 ![alt](url)
   *
   * 在流式输出中，如果链接或图片未完成（缺少闭合括号），
   * 提前解析会导致 URL 不完整，从而触发 CSP 拦截或加载错误。
   */
  private hasUnclosedLinkOrImage(text: string): boolean {
    // 查找最后一个可能引起歧义的标记
    const lastOpenBracket = text.lastIndexOf("[");
    const lastOpenParen = text.lastIndexOf("(");

    // 如果没有任何括号，肯定安全
    if (lastOpenBracket === -1 && lastOpenParen === -1) return false;

    // 情况 1: 文本部分未闭合 [text... 或 ![alt...
    if (lastOpenBracket > -1) {
      const textAfterBracket = text.slice(lastOpenBracket);
      if (!textAfterBracket.includes("]")) {
        return true;
      }
    }

    // 情况 2: URL 部分未闭合 [...](url...
    if (lastOpenParen > -1) {
      const textAfterParen = text.slice(lastOpenParen);
      if (!textAfterParen.includes(")")) {
        // 检查这个 ( 是否紧跟在 ] 后面
        const textBeforeParen = text.slice(0, lastOpenParen);
        if (textBeforeParen.endsWith("]")) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 检测未完成的 HTML 标签（缺少 >）
   *
   * 在流式输出中，HTML 标签可能被截断，如：
   * - <div style="
   * - <div style="background: red;
   * - <span class="foo
   *
   * 这些都是未完成的标签，需要等待更多内容才能正确解析
   */
  private hasIncompleteHtmlTag(text: string): boolean {
    // 从文本末尾向前搜索，查找最后一个 < 符号
    const lastOpenBracket = text.lastIndexOf("<");
    if (lastOpenBracket === -1) {
      return false;
    }

    // 获取从 < 开始到文本末尾的内容
    const potentialTag = text.slice(lastOpenBracket);

    // 如果这部分内容包含 >，说明标签已完成
    if (potentialTag.includes(">")) {
      return false;
    }

    // 检查是否看起来像一个 HTML 标签的开始
    // 匹配: <tagName 或 </tagName 或 <tagName attr
    // 排除: < 后面直接跟数字或空格（如 "< 100" 或 "<100"）
    const incompleteTagRegex = /^<\/?[a-zA-Z][a-zA-Z0-9_-]*(?:\s|$)/;
    if (incompleteTagRegex.test(potentialTag)) {
      return true;
    }

    // 特殊情况：标签名正在输入中，如 "<di" 或 "</di"
    // 匹配: <字母 或 </字母（后面没有空格或 >）
    const partialTagRegex = /^<\/?[a-zA-Z][a-zA-Z0-9_-]*$/;
    if (partialTagRegex.test(potentialTag)) {
      return true;
    }

    return false;
  }

  /**
   * 获取安全的可解析切分点
   * 如果末尾存在不完整的 HTML 标签或属性，返回其起始位置以隐藏残缺部分
   */
  private getSafeCutPoint(text: string): number {
    // 如果在代码块内部，不执行 HTML 截断逻辑，防止代码中的 < 导致闪烁
    if (this.isInsideCodeBlock(text.split("\n"))) {
      return text.length;
    }

    // 1. 检查 HTML 标签截断 (如 <div st...)
    const lastHtmlBracket = text.lastIndexOf("<");
    if (lastHtmlBracket !== -1) {
      const suffix = text.slice(lastHtmlBracket);
      // 如果这个 < 之后没有 >，且看起来像标签开始或属性开始，则回退
      if (!suffix.includes(">")) {
        if (this.hasIncompleteHtmlTag(text) || this.isLikelyInsideHtmlAttribute(text)) {
          return lastHtmlBracket;
        }
      }
    }

    // 2. 检查内联链接/图片截断
    // 优先检查 URL 部分 (url... 因为它最容易触发 CSP 错误
    const lastParen = text.lastIndexOf("(");
    if (lastParen !== -1) {
      const suffix = text.slice(lastParen);
      if (!suffix.includes(")")) {
        const textBeforeParen = text.slice(0, lastParen);
        if (textBeforeParen.endsWith("]")) {
          // 找到 ![alt]( 或 [text]( 的起始位置
          // 向前找 [
          const lastBracket = textBeforeParen.lastIndexOf("[");
          if (lastBracket !== -1) {
            // 如果前面有 !，也一起截断
            return lastBracket > 0 && text[lastBracket - 1] === "!" ? lastBracket - 1 : lastBracket;
          }
        }
      }
    }

    // 检查文本部分 [text...
    const lastBracket = text.lastIndexOf("[");
    if (lastBracket !== -1) {
      const suffix = text.slice(lastBracket);
      if (!suffix.includes("]")) {
        // 如果前面有 !，也一起截断
        return lastBracket > 0 && text[lastBracket - 1] === "!" ? lastBracket - 1 : lastBracket;
      }
    }

    return text.length;
  }

  splitByBlockBoundary(text: string): { stable: string; pending: string } {
    // 剔除末尾不安全的部分，防止残缺的 HTML 渲染
    const safeLen = this.getSafeCutPoint(text);
    const safeText = text.slice(0, safeLen);

    const lines = safeText.split("\n");
    let stableEndLineIndex = -1;

    // 从后往前找最后一个空行作为稳定边界
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === "") {
        // 找到空行后，还需要确认空行之前的部分是安全的
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
    }

    // 如果没有空行，则整体作为 pending（前提是已经在 getSafeCutPoint 中过滤了残缺部分）
    return { stable: "", pending: safeText };
  }
}

export class StreamProcessorV2 {
  private parser: CustomParser;
  private onPatch: (patches: Patch[]) => void;
  private boundaryDetector: MarkdownBoundaryDetector;
  private llmThinkRules: LlmThinkRule[];

  // 状态管理
  private buffer = "";
  private stableAst: AstNode[] = [];
  private pendingAst: AstNode[] = [];
  private nodeIdCounter = 1;

  // 性能优化：引用冻结 - 记录上次的稳定区文本
  private lastStableText = "";

  // 安全护栏配置（已大幅放宽限制，防止误杀长文本）
  private readonly MAX_SINGLE_PARSE_MS = 1000000; // 单次解析硬上限
  private readonly MAX_ITERATION_TIME_MS = 6000000; // 单次迭代总时长上限
  private readonly MAX_BUFFER_SIZE = 50 * 1024 * 1024; // 缓冲区大小上限
  private readonly MAX_STALL_ITERATIONS = 10000; // 边界停滞最大容忍次数
  private isDegraded = false; // 是否已进入降级模式
  private safetyGuardEnabled = true; // 是否启用安全护栏
  private lastStableLength = 0; // 上次稳定区长度（用于检测边界停滞）
  private stallCount = 0; // 边界停滞计数

  constructor(options: StreamProcessorOptions) {
    this.onPatch = options.onPatch;
    this.llmThinkRules = options.llmThinkRules || [];

    const llmThinkTagNames = options.llmThinkTagNames || new Set();
    this.parser = new CustomParser(llmThinkTagNames, this.llmThinkRules, options.defaultToolCallCollapsed);
    this.boundaryDetector = new MarkdownBoundaryDetector(llmThinkTagNames);
    this.safetyGuardEnabled = options.safetyGuardEnabled !== false;
  }

  private generateNodeId(): string {
    return `node-v2-${this.nodeIdCounter++}`;
  }

  private isProcessing = false;
  private pendingBuffer: string | null = null;
  private resolveProcessing: (() => void) | null = null;

  /**
   * 处理新的文本块
   */
  async process(chunk: string): Promise<void> {
    // 如果已降级，停止接收新数据
    if (this.isDegraded) {
      return;
    }

    this.buffer += chunk;

    // 安全护栏：内容过长保护
    if (this.safetyGuardEnabled && this.buffer.length > this.MAX_BUFFER_SIZE) {
      this.enterDegradedMode("内容过长，为防止卡顿已切换至极简渲染模式");
      return;
    }

    await this.processIncremental();
  }

  /**
   * 进入降级模式
   * 改进：不再替换整个根节点，而是在末尾追加警告并停止后续处理
   */
  private enterDegradedMode(reason: string): void {
    if (!this.safetyGuardEnabled || this.isDegraded) return;
    this.isDegraded = true;
    console.warn(`[StreamProcessorV2] Degraded: ${reason}`);

    const degradedNode: AstNode = {
      id: this.generateNodeId(),
      type: "alert",
      props: { alertType: "warning" },
      meta: { range: { start: 0, end: 0 }, status: "stable" },
      children: [
        {
          id: this.generateNodeId(),
          type: "text",
          props: { content: `⚠️ ${reason}。为保证界面响应，已暂停后续渲染。如果需要强制渲染，请在“设置 -> 渲染设置”中关闭“渲染安全护栏”。` },
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        },
      ],
    };

    // 获取当前最后一个节点的 ID 作为锚点
    const lastNode =
      this.pendingAst.length > 0
        ? this.pendingAst[this.pendingAst.length - 1]
        : this.stableAst.length > 0
          ? this.stableAst[this.stableAst.length - 1]
          : null;

    if (lastNode) {
      // 在末尾追加警告
      this.onPatch([{ op: "insert-after", id: lastNode.id, newNode: degradedNode }]);
    } else {
      // 如果之前没有任何内容，则作为根节点显示
      this.onPatch([{ op: "replace-root", newRoot: [degradedNode] }]);
    }
  }

  /**
   * 设置完整内容并触发解析。
   * 适用于流式源订阅中每次都应用正则后的全量更新。
   */
  public async setContent(content: string): Promise<void> {
    this.buffer = content;
    await this.processIncremental();
  }

  /**
   * 结束流式处理
   */
  async finalize(): Promise<void> {
    await this.processComplete();
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
   *
   * 性能优化：引用冻结 - 如果 stableText 没有变化，复用已有的 stableAst 引用
   */
  private async processIncremental(): Promise<void> {
    if (this.isProcessing) {
      // 如果正在处理中，则记录当前 buffer，等处理完后再运行一次最新的
      this.pendingBuffer = this.buffer;
      return;
    }

    try {
      this.isProcessing = true;
      while (true) {
        const iterationStart = performance.now();

        // 1. 划分稳定区和待定区
        const { stable: stableText, pending: pendingText } = this.boundaryDetector.splitByBlockBoundary(this.buffer);

        // 安全护栏：边界停滞检测
        if (this.safetyGuardEnabled && stableText.length === this.lastStableLength && stableText.length > 0) {
          this.stallCount++;
          if (this.stallCount >= this.MAX_STALL_ITERATIONS) {
            this.enterDegradedMode("内容边界解析停滞，可能存在病态嵌套结构");
            break;
          }
        } else {
          this.stallCount = 0;
          this.lastStableLength = stableText.length;
        }

        // 2. 解析稳定区（带超时保护）
        let newStableAst: AstNode[];
        if (stableText === this.lastStableText && this.stableAst.length > 0) {
          // 稳定区文本没有变化，复用已有的 stableAst 引用
          newStableAst = this.stableAst;
        } else {
          // 稳定区文本发生变化，重新解析
          const stableParseStart = performance.now();
          this.parser.reset();
          newStableAst = await this.parser.parseAsync(stableText);
          this.lastStableText = stableText;

          // 安全护栏：单次解析超时检查
          const stableElapsed = performance.now() - stableParseStart;
          if (this.safetyGuardEnabled && stableElapsed > this.MAX_SINGLE_PARSE_MS) {
            this.enterDegradedMode(`稳定区解析超时 (${stableElapsed.toFixed(0)}ms)，内容可能包含病态结构`);
            break;
          }
        }

        // 3. 解析待定区（带超时保护）
        const pendingParseStart = performance.now();
        this.parser.reset();
        const newPendingAst = await this.parser.parseAsync(pendingText);

        // 安全护栏：单次解析超时检查
        const pendingElapsed = performance.now() - pendingParseStart;
        if (this.safetyGuardEnabled && pendingElapsed > this.MAX_SINGLE_PARSE_MS) {
          this.enterDegradedMode(`待定区解析超时 (${pendingElapsed.toFixed(0)}ms)，内容可能包含病态结构`);
          break;
        }

        // 4. 合并当前的完整状态树（旧状态）
        const currentFullAst = [...this.stableAst, ...this.pendingAst];

        // 5. 合并新的完整状态树（新状态）
        const newFullAst = [...newStableAst, ...newPendingAst];

        // 6. 关键：在 diff 之前完成所有 ID 分配
        if (newStableAst !== this.stableAst) {
          this.assignIds(newStableAst);
        }
        this.assignIds(newPendingAst);

        // 7. 标记节点状态
        this.markNodesStatus(newStableAst, "stable");
        this.markNodesStatus(newPendingAst, "pending");

        // 8. 对整个树进行一次性 diff（diff 内部会处理 ID 保留）
        const patches = this.diffAst(currentFullAst, newFullAst, true);

        // 9. 更新状态
        this.stableAst = newStableAst;
        this.pendingAst = newPendingAst;

        // 10. 发送变更
        if (patches.length > 0) {
          this.onPatch(patches);
        }

        // 安全护栏：单次迭代总时长检查（包括 diff）
        const iterationElapsed = performance.now() - iterationStart;
        if (this.safetyGuardEnabled && iterationElapsed > this.MAX_ITERATION_TIME_MS) {
          this.enterDegradedMode(`单次迭代超时 (${iterationElapsed.toFixed(0)}ms)，内容过于复杂`);
          break;
        }

        // 检查是否有新的待处理内容
        if (this.pendingBuffer !== null) {
          this.buffer = this.pendingBuffer;
          this.pendingBuffer = null;
          continue;
        }
        break;
      }
    } finally {
      this.isProcessing = false;
      if (this.resolveProcessing) {
        this.resolveProcessing();
        this.resolveProcessing = null;
      }
    }
  }
  /**
   * 完整处理（重写版）
   *
   * 在流结束时，将整个 buffer 作为最终内容重新解析，
   * 然后与当前的 AST 进行 diff，确保正确处理节点合并等情况
   */
  private async processComplete(): Promise<void> {
    if (this.isProcessing) {
      // 如果正在处理中，创建一个 Promise 等待它结束
      if (!this.resolveProcessing) {
        const processingPromise = new Promise<void>((resolve) => {
          this.resolveProcessing = resolve;
        });
        // 增加超时保护，防止死等
        await Promise.race([processingPromise, new Promise((resolve) => setTimeout(resolve, 1000))]);
      }
    }

    try {
      this.isProcessing = true;
      // 将整个 buffer 作为最终内容重新解析
      this.parser.reset();
      const finalAst = await this.parser.parseAsync(this.buffer);

      // 保留现有节点的 ID
      const currentFullAst = [...this.stableAst, ...this.pendingAst];

      // 分配 ID（diff 内部会处理 ID 保留）
      this.assignIds(finalAst);
      this.markNodesStatus(finalAst, "stable");

      // 强制结束所有思考节点的思考状态（流已结束，即使标签未闭合也不应再显示思考中）
      this.forceStopThinking(finalAst);

      // 计算 diff
      const patches = this.diffAst(currentFullAst, finalAst, true);

      // 更新状态
      this.stableAst = finalAst;
      this.pendingAst = [];

      // 发送变更
      if (patches.length > 0) {
        this.onPatch(patches);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private getNodeTextContent(node: AstNode): string {
    if (node.type === "text") {
      return node.props.content;
    }
    if (node.type === "code_block") {
      return node.props.content;
    }
    if (node.type === "mermaid") {
      return node.props.content;
    }
    if (node.type === "inline_code") {
      return node.props.content;
    }
    if (node.type === "html_inline" || node.type === "html_block") {
      return node.props.content;
    }
    if (node.type === "vcp_tool") {
      return node.props.raw;
    }
    if (!node.children) return "";
    return node.children.map((child) => this.getNodeTextContent(child)).join("");
  }

  /**
   * 解耦后的 diffAst 方法
   * @param isRoot 是否是根节点列表（根节点列表为空时允许发送 replace-root）
   */
  private diffAst(oldNodes: AstNode[], newNodes: AstNode[], isRoot: boolean = false): Patch[] {
    const patches: Patch[] = [];

    // 如果旧节点为空且新节点不为空
    if (oldNodes.length === 0 && newNodes.length > 0) {
      if (isRoot) {
        return [{ op: "replace-root", newRoot: [...newNodes] }];
      } else {
        // 非根节点（子节点列表）从无到有，由父节点的 replace-node 处理，或者在此处生成 insert 操作
        // 理论上 diffSingleNode 会处理 contentChanged，但为了保险，这里返回全量 insert
        let currentAnchor: string | undefined = undefined;
        for (const newNode of newNodes) {
          if (!currentAnchor) {
            // 第一个子节点没有锚点，这种情况通常由父节点的 replace-node 覆盖
            // 但如果父节点尝试复用并递归到这里，我们需要一种方式处理
            // 目前 diffSingleNode 在内容变化时会优先使用 replace-node，所以这里通常不会被触发
          } else {
            patches.push({ op: "insert-after", id: currentAnchor, newNode });
            currentAnchor = newNode.id;
          }
        }
        return patches;
      }
    }

    // 如果新旧节点都为空，无需任何操作
    if (oldNodes.length === 0 && newNodes.length === 0) {
      return [];
    }

    const minLen = Math.min(oldNodes.length, newNodes.length);

    // 比对共同部分
    for (let i = 0; i < minLen; i++) {
      patches.push(...this.diffSingleNode(oldNodes[i], newNodes[i]));
    }

    // 新增节点（这些节点已经有了独立的 ID）
    if (newNodes.length > oldNodes.length) {
      // 使用共同部分的最后一个节点作为锚点
      // 因为这个节点的 ID 已经在 diffSingleNode 中被同步到 newNode
      const insertAnchorId = newNodes[minLen - 1]?.id;

      if (!insertAnchorId) {
        // 理论上不应该走到这里，但为了安全起见还是处理一下
        return [{ op: "replace-root", newRoot: [...newNodes] }];
      }

      let currentAnchor = insertAnchorId;
      for (let i = minLen; i < newNodes.length; i++) {
        patches.push({ op: "insert-after", id: currentAnchor, newNode: newNodes[i] });
        currentAnchor = newNodes[i].id;
      }
    }

    // 删除节点
    if (oldNodes.length > newNodes.length) {
      for (let i = minLen; i < oldNodes.length; i++) {
        patches.push({ op: "remove-node", id: oldNodes[i].id });
      }
    }

    return patches;
  }

  private diffSingleNode(oldNode: AstNode, newNode: AstNode): Patch[] {
    // 检查节点是否可以复用（类型相同且内容相似）
    const canReuse = this.canReuseNode(oldNode, newNode);

    if (canReuse) {
      // 复用旧节点的 ID
      newNode.id = oldNode.id;

      // 检查是否需要更新
      const statusChanged = oldNode.meta.status !== newNode.meta.status;

      // 性能优化：使用指纹快速判断内容是否变化
      // 如果两个节点都有指纹，先比较指纹，指纹一致则直接判定内容未变
      let contentChanged = false;
      if (oldNode._fp && newNode._fp) {
        // 指纹不一致才需要进一步检查
        contentChanged = oldNode._fp !== newNode._fp;
        // 如果指纹一致但节点有子节点，仍需递归检查子节点
        if (!contentChanged && (oldNode.children || newNode.children)) {
          contentChanged = false; // 指纹一致，认为内容相同
        }
      } else {
        // 没有指纹，回退到旧的比较方式
        contentChanged = this.getNodeTextContent(oldNode) !== this.getNodeTextContent(newNode);
      }

      if (statusChanged || contentChanged) {
        // 内容或状态变化，但可以复用 ID，发送 replace-node
        if (oldNode.children && newNode.children) {
          // 递归处理子节点的 ID 保留
          this.syncChildrenIds(oldNode.children, newNode.children);
        }
        return [{ op: "replace-node", id: oldNode.id, newNode }];
      }

      // 检查子节点
      if (oldNode.children || newNode.children) {
        // 同步子节点 ID 后再进行 diff
        if (oldNode.children && newNode.children) {
          this.syncChildrenIds(oldNode.children, newNode.children);
        }
        return this.diffAst(oldNode.children || [], newNode.children || [], false);
      }

      return [];
    } else {
      // 不能复用，newNode 保持其原有的独立 ID
      // 发送 replace-node（用新节点替换旧节点）
      return [{ op: "replace-node", id: oldNode.id, newNode }];
    }
  }

  /**
   * 判断新节点是否可以复用旧节点的 ID
   */
  private canReuseNode(oldNode: AstNode, newNode: AstNode): boolean {
    // 类型不同，不能复用
    if (oldNode.type !== newNode.type) {
      return false;
    }

    // 特殊节点（Mermaid 和代码块）的复用规则
    if (oldNode.type === "mermaid" && newNode.type === "mermaid") {
      return true; // Mermaid 图表始终可以复用
    }

    if (oldNode.type === "code_block" && newNode.type === "code_block") {
      // 代码块语言相同时可以复用
      return oldNode.props.language === newNode.props.language;
    }

    // 其他节点：类型相同即可复用
    return true;
  }

  /**
   * 同步子节点的 ID（从旧节点树复制到新节点树）
   */
  private syncChildrenIds(oldChildren: AstNode[], newChildren: AstNode[]): void {
    const minLen = Math.min(oldChildren.length, newChildren.length);
    for (let i = 0; i < minLen; i++) {
      if (this.canReuseNode(oldChildren[i], newChildren[i])) {
        newChildren[i].id = oldChildren[i].id;
        if (oldChildren[i].children && newChildren[i].children) {
          this.syncChildrenIds(oldChildren[i].children!, newChildren[i].children!);
        }
      }
    }
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
      // 只有在 pending 区的未闭合节点才显示执行/思考中动画
      if (node.type === "llm_think") {
        node.props.isThinking = status === "pending";
      }
      if (node.type === "vcp_tool") {
        node.props.isPending = status === "pending" && !node.props.closed;
      }

      if (node.children) {
        this.markNodesStatus(node.children, status);
      }
    }
  }

  /**
   * 强制结束所有思考节点的思考状态
   * 用于流结束时，确保即使标签未闭合，也不再显示"思考中"动画
   */
  private forceStopThinking(nodes: AstNode[]): void {
    for (const node of nodes) {
      if (node.type === "llm_think" && node.props.isThinking) {
        node.props.isThinking = false;
      }
      if (node.type === "vcp_tool" && node.props.isPending) {
        node.props.isPending = false;
      }
      if (node.children) {
        this.forceStopThinking(node.children);
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
    this.lastStableText = "";
    this.lastStableLength = 0;
    this.stallCount = 0;
    this.isDegraded = false;
    this.parser.reset();
  }
}
