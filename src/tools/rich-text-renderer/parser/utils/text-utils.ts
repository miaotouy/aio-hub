// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Token } from "../types";
import { AstNode } from "../../types";

/**
 * 计算两个字符串的编辑距离 (Levenshtein Distance)
 */
export function getEditDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 替换
          matrix[i][j - 1] + 1, // 插入
          matrix[i - 1][j] + 1 // 删除
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// 定义同义词/词根平替集合
const THINK_STEM_GROUPS = [
  ["think", "thinking", "thought", "thoughtprocess", "thought-process"],
  ["思考", "心路历程", "推理", "想", "思索"],
];

/**
 * 将字符串中的同义词/词根归一化为标准词根
 */
function normalizeStems(s: string): string {
  let result = s;
  for (const group of THINK_STEM_GROUPS) {
    const standard = group[0]; // 以第一个作为标准词根
    for (const stem of group) {
      if (stem !== standard && result.includes(stem)) {
        result = result.replace(new RegExp(stem, "g"), standard);
      }
    }
  }
  return result;
}

/**
 * 判断遇到的闭合标签是否是当前开启标签的模糊匹配体（完全通用算法，无硬编码）
 *
 * @param openTag 开启标签名（如 'guguthink' 或 '张三的思考'）
 * @param closeTag 闭合标签名（如 'gugugu-think' 或 '张三-思考'）
 * @param registeredTags 系统注册的所有思考标签名集合（用于动态平替判定）
 */
export function isFuzzyMatchCloseTag(
  openTag: string,
  closeTag: string,
  registeredTags?: Set<string>
): boolean {
  const open = openTag.toLowerCase();
  const close = closeTag.toLowerCase();

  // 1. 精确匹配
  if (open === close) return true;

  // 2. 动态平替：如果两个标签都是系统注册的思考标签，允许它们互相闭合
  if (registeredTags && registeredTags.has(open) && registeredTags.has(close)) {
    return true;
  }

  // 3. 归一化处理：移除非字母数字和非中文字符（如 -, _, 标点等）
  const normalize = (s: string) => s.replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
  const normOpen = normalize(open);
  const normClose = normalize(close);

  if (normOpen === normClose) return true;

  // 4. 同义词/词根平替判定
  const stemOpen = normalizeStems(normOpen);
  const stemClose = normalizeStems(normClose);
  if (stemOpen === stemClose) return true;

  // 5. 子串包含关系（如 'guguthink' 和 'think'，或者 '张三的思考' 和 '张三'）
  const minLen = /[\u4e00-\u9fa5]/.test(stemOpen) ? 2 : 3;
  if (stemOpen.length >= minLen && stemClose.length >= minLen) {
    if (stemOpen.includes(stemClose) || stemClose.includes(stemOpen)) {
      return true;
    }
  }

  // 6. 编辑距离容错（针对手抖拼错）
  const maxLen = Math.max(stemOpen.length, stemClose.length);
  if (maxLen > 3) {
    const distance = getEditDistance(stemOpen, stemClose);
    const threshold = Math.max(1, Math.ceil(maxLen * 0.3));
    if (distance <= threshold) {
      return true;
    }
  }

  return false;
}

/**
 * 将令牌序列转换回原始文本
 */
export function tokensToRawText(tokens: Token[]): string {
  let text = "";
  for (const token of tokens) {
    switch (token.type) {
      case "text":
        text += token.raw ?? token.content;
        break;
      case "newline":
        text += "\n".repeat(token.count);
        break;
      case "html_open":
      case "html_close":
      case "strong_delimiter":
      case "em_delimiter":
      case "triple_delimiter":
      case "subscript_delimiter":
      case "superscript_delimiter":
      case "html_comment":
      case "autolink":
      case "strikethrough_delimiter":
      case "quote_delimiter":
      case "image_marker":
      case "link_text_open":
      case "link_text_close":
      case "link_url_open":
      case "link_url_close":
      case "heading_marker":
      case "blockquote_marker":
      case "list_marker":
      case "hr_marker":
        text += token.raw;
        break;
      case "inline_code":
        text += `\`${token.content}\``;
        break;
      case "code_fence":
        text += token.raw;
        break;
      case "katex_inline":
        text += `$${token.content}$`;
        break;
      case "katex_block":
        text += `$$${token.content}$$`;
        break;
    }
  }
  return text;
}

/**
 * 优化连续链接（徽章和导航链接）之间的换行
 * 检测以 [ 开头的链接（包括图片链接和普通链接），移除它们之间的硬换行
 */
export function optimizeBadgeLineBreaks(nodes: AstNode[]): AstNode[] {
  let optimized: AstNode[] | undefined;
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    let replacement = node;
    if (node.children) {
      let children: AstNode[];
      if (node.type === "paragraph") {
        const original = node.children;
        let changed: AstNode[] | undefined;
        for (let i = 0; i < original.length; i++) {
          const current = original[i];
          const previous = original[i - 1];
          const isLinkLike = (n: AstNode | undefined): boolean =>
            n?.type === "link" || n?.type === "image";
          // A short separator may stay between links; remove only the hard break.
          if (
            current.type === "hard_break" &&
            isLinkLike(original[i + 1]) &&
            (isLinkLike(previous) ||
              (previous?.type === "text" &&
                typeof previous.props?.content === "string" &&
                previous.props.content.trim().length <= 3 &&
                isLinkLike(original[i - 2])))
          ) {
            changed ??= original.slice(0, i);
          } else {
            changed?.push(current);
          }
        }
        children = changed ?? original;
      } else {
        children = optimizeBadgeLineBreaks(node.children);
      }
      if (children !== node.children) replacement = { ...node, children };
    }
    if (replacement !== node) optimized ??= nodes.slice(0, index);
    optimized?.push(replacement);
  }
  return optimized ?? nodes;
}

/**
 * 计算节点的快速指纹
 * 公式: length + ":" + firstChar + ":" + lastChar
 * 用于 Diff 算法快速跳过无变化的节点
 */
export function computeFingerprint(content: string): string {
  if (!content) return "0::";
  const len = content.length;
  const first = content[0] || "";
  const last = content[len - 1] || "";
  return `${len}:${first}:${last}`;
}

export function createTextNode(content: string): AstNode {
  return {
    id: "",
    type: "text",
    props: { content },
    meta: { range: { start: 0, end: 0 }, status: "stable" },
    _fp: computeFingerprint(content),
  };
}

/**
 * 反转义常见的 HTML 实体
 * 用于处理 LLM 在 HTML 块中输出的转义内容
 *
 * 注意：替换顺序很重要！&amp; 必须最后替换，否则会导致双重转义问题
 * 例如：&amp;lt; 应该变成 &lt; 然后变成 <
 * 如果先替换 &amp;，会得到 &lt;，但后续的 &lt; 替换不会再执行
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes("&")) return text;

  // 重要：&amp; 必须最后替换！
  // 这样 &amp;lt; 会先保持不变，然后 &lt; 被替换为 <
  // 最后 &amp; 被替换为 &
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
