<script setup lang="ts">
import { computed, ref } from "vue";
import { marked } from "marked";
import { Copy, Check } from "lucide-vue-next";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/feedback";
import ThinkBlock from "./components/ThinkBlock.vue";
import KatexRenderer from "./components/KatexRenderer.vue";
import MermaidDiagram from "./components/MermaidDiagram.vue";

defineOptions({
  name: "RichTextRenderer",
});

const logger = createModuleLogger("rich-text-renderer");

const props = withDefaults(
  defineProps<{
    content?: string;
    tokens?: any[]; // 支持直接传入 tokens 数组用于递归
    isStreaming?: boolean;
    resolveAsset?: (content: string) => string;
    disableThinkParsing?: boolean;
  }>(),
  {
    content: "",
    isStreaming: false,
  }
);

// 是否是递归子调用
const isRecursive = computed(() => !!props.tokens);

/**
 * 经过资产解析处理后的内容
 */
const processedContent = computed(() => {
  let text = props.content || "";
  if (props.resolveAsset && !isRecursive.value) {
    text = props.resolveAsset(text);
  }
  return text;
});

type RenderSegment =
  | { type: "markdown"; tokens: any[] }
  | {
      type: "think";
      tagName: string;
      content: string;
      isThinking: boolean;
    }
  | { type: "katex_block"; content: string };

const THINK_TAG_PATTERN = /<(think|guguthink)\s*>/gi;
const KATEX_BLOCK_PATTERN = /\$\$([\s\S]*?)\$\$/g;
const KATEX_INLINE_PATTERN = /(?<!\$)\$([^$\n]+?)\$(?!\$)/g;

function splitInlineMath(text: string): any[] {
  const tokens: any[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  KATEX_INLINE_PATTERN.lastIndex = 0;
  while ((match = KATEX_INLINE_PATTERN.exec(text))) {
    if (match.index > cursor) {
      tokens.push({ type: "text", text: text.slice(cursor, match.index) });
    }
    tokens.push({ type: "katex_inline", text: match[1].trim() });
    cursor = KATEX_INLINE_PATTERN.lastIndex;
  }
  if (cursor < text.length || !tokens.length) {
    tokens.push({ type: "text", text: text.slice(cursor) });
  }
  return tokens;
}

function transformMathTokens(tokens: any[]): any[] {
  return tokens.flatMap((token) => {
    if (Array.isArray(token.tokens)) {
      return [{ ...token, tokens: transformMathTokens(token.tokens) }];
    }
    if (token.type === "text" && typeof token.text === "string") {
      return splitInlineMath(token.text);
    }
    return [token];
  });
}

function parseMarkdownTokens(text: string): any[] {
  if (!text) return [];
  try {
    return transformMathTokens(marked.lexer(text));
  } catch (error) {
    logger.error("Markdown 解析失败，降级为纯文本", error);
    return [{ type: "text", text }];
  }
}

function splitContentSegments(
  text: string,
  includeThinkTags = true
): RenderSegment[] {
  const segments: RenderSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    THINK_TAG_PATTERN.lastIndex = cursor;
    KATEX_BLOCK_PATTERN.lastIndex = cursor;
    const opening = includeThinkTags ? THINK_TAG_PATTERN.exec(text) : null;
    const math = KATEX_BLOCK_PATTERN.exec(text);
    const next =
      opening && (!math || opening.index <= math.index)
        ? { type: "think" as const, match: opening }
        : math
          ? { type: "katex_block" as const, match: math }
          : null;

    if (!next) break;
    if (next.match.index > cursor) {
      segments.push({
        type: "markdown",
        tokens: parseMarkdownTokens(text.slice(cursor, next.match.index)),
      });
    }

    if (next.type === "katex_block") {
      segments.push({ type: "katex_block", content: next.match[1].trim() });
      cursor = KATEX_BLOCK_PATTERN.lastIndex;
      continue;
    }

    const tagName = next.match[1].toLowerCase();
    const contentStart = THINK_TAG_PATTERN.lastIndex;
    const closing = new RegExp(`</${tagName}\\s*>`, "i").exec(
      text.slice(contentStart)
    );
    if (!closing && !props.isStreaming) break;
    const contentEnd = closing ? contentStart + closing.index : text.length;
    segments.push({
      type: "think",
      tagName,
      content: text.slice(contentStart, contentEnd),
      isThinking: !closing,
    });
    cursor = closing ? contentEnd + closing[0].length : text.length;
  }

  if (cursor < text.length || !segments.length) {
    segments.push({
      type: "markdown",
      tokens: parseMarkdownTokens(text.slice(cursor)),
    });
  }
  return segments;
}

const displaySegments = computed<RenderSegment[]>(() => {
  if (props.tokens) return [{ type: "markdown", tokens: props.tokens }];
  const text = processedContent.value;
  if (!text) return [];
  return splitContentSegments(text, !props.disableThinkParsing);
});

/**
 * 解析图片 URL
 */
function resolveImageUrl(url: string) {
  if (props.resolveAsset) {
    return props.resolveAsset(url);
  }
  return url;
}

function isSafeLinkUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const normalized = url.trim();
  return normalized.startsWith("#") || /^(https?:|mailto:)/i.test(normalized);
}

// 复制代码块内容
const copiedIndex = ref<number | null>(null);
async function copyCode(code: string, index: number) {
  try {
    await navigator.clipboard.writeText(code);
    copiedIndex.value = index;
    setTimeout(() => {
      if (copiedIndex.value === index) {
        copiedIndex.value = null;
      }
    }, 2000);
  } catch (err) {
    logger.warn("复制代码失败", err);
    customMessage("复制失败", "error");
  }
}
</script>

<template>
  <div class="rich-text-renderer" :class="{ 'is-recursive': isRecursive }">
    <template
      v-for="(segment, segmentIndex) in displaySegments"
      :key="segmentIndex"
    >
      <KatexRenderer
        v-if="segment.type === 'katex_block'"
        :content="segment.content"
        display-mode
      />
      <ThinkBlock
        v-else-if="segment.type === 'think'"
        :tag-name="segment.tagName"
        :raw-content="segment.content"
        :is-thinking="segment.isThinking"
      >
        <RichTextRenderer
          :content="segment.content"
          :is-streaming="isStreaming"
          :resolve-asset="resolveAsset"
          disable-think-parsing
        />
      </ThinkBlock>
      <template v-else>
        <template v-for="(token, index) in segment.tokens" :key="index">
          <!-- 1. 标题 -->
          <component
            v-if="token.type === 'heading'"
            :is="'h' + token.depth"
            class="md-heading"
            :class="'md-h' + token.depth"
          >
            <RichTextRenderer
              :tokens="token.tokens"
              :resolve-asset="resolveAsset"
            />
          </component>

          <!-- 2. 段落 -->
          <p v-else-if="token.type === 'paragraph'" class="md-paragraph">
            <RichTextRenderer
              :tokens="token.tokens"
              :resolve-asset="resolveAsset"
            />
          </p>

          <!-- 3. Mermaid 图表 -->
          <MermaidDiagram
            v-else-if="
              token.type === 'code' && token.lang?.toLowerCase() === 'mermaid'
            "
            :content="token.text"
          />

          <!-- 4. 代码块 -->
          <div v-else-if="token.type === 'code'" class="code-block-container">
            <div class="code-block-header">
              <span class="code-lang">{{ token.lang || "code" }}</span>
              <button class="copy-btn" @click="copyCode(token.text, index)">
                <Check
                  v-if="copiedIndex === index"
                  :size="14"
                  class="success-icon"
                />
                <Copy v-else :size="14" />
                <span>{{ copiedIndex === index ? "已复制" : "复制" }}</span>
              </button>
            </div>
            <pre class="code-block-pre"><code>{{ token.text }}</code></pre>
          </div>

          <!-- 4. 引用块 -->
          <blockquote
            v-else-if="token.type === 'blockquote'"
            class="md-blockquote"
          >
            <RichTextRenderer
              :tokens="token.tokens"
              :resolve-asset="resolveAsset"
            />
          </blockquote>

          <!-- 5. 列表 -->
          <component
            v-else-if="token.type === 'list'"
            :is="token.ordered ? 'ol' : 'ul'"
            :start="token.start || undefined"
            class="md-list"
            :class="{ 'is-ordered': token.ordered }"
          >
            <li
              v-for="(item, itemIdx) in token.items"
              :key="itemIdx"
              class="md-list-item"
            >
              <!-- 递归渲染列表项内部的 tokens -->
              <RichTextRenderer
                :tokens="item.tokens"
                :resolve-asset="resolveAsset"
              />
            </li>
          </component>

          <!-- 6. 水平线 -->
          <hr v-else-if="token.type === 'hr'" class="md-hr" />

          <!-- 7. 表格 -->
          <div v-else-if="token.type === 'table'" class="table-wrapper">
            <table class="md-table">
              <thead>
                <tr>
                  <th
                    v-for="(headerCell, cellIdx) in token.header"
                    :key="cellIdx"
                    :style="{ textAlign: token.align[cellIdx] || 'left' }"
                  >
                    <RichTextRenderer
                      :tokens="headerCell.tokens"
                      :resolve-asset="resolveAsset"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, rowIdx) in token.rows" :key="rowIdx">
                  <td
                    v-for="(cell, cellIdx) in row"
                    :key="cellIdx"
                    :style="{ textAlign: token.align[cellIdx] || 'left' }"
                  >
                    <RichTextRenderer
                      :tokens="cell.tokens"
                      :resolve-asset="resolveAsset"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 8. HTML 块：移动端尚未具备白名单/沙箱，保持字面文本以禁止执行。 -->
          <pre v-else-if="token.type === 'html'" class="md-html">{{
            token.text
          }}</pre>

          <!-- 9. 行内数学公式 -->
          <KatexRenderer
            v-else-if="token.type === 'katex_inline'"
            :content="token.text"
          />

          <!-- 10. 行内粗体 -->
          <strong v-else-if="token.type === 'strong'" class="md-strong">
            <RichTextRenderer
              :tokens="token.tokens"
              :resolve-asset="resolveAsset"
            />
          </strong>

          <!-- 10. 行内斜体 -->
          <em v-else-if="token.type === 'em'" class="md-italic">
            <RichTextRenderer
              :tokens="token.tokens"
              :resolve-asset="resolveAsset"
            />
          </em>

          <!-- 11. 行内代码 -->
          <code v-else-if="token.type === 'codespan'" class="md-inline-code">{{
            token.text
          }}</code>

          <!-- 12. 删除线 -->
          <del v-else-if="token.type === 'del'" class="md-del">
            <RichTextRenderer
              :tokens="token.tokens"
              :resolve-asset="resolveAsset"
            />
          </del>

          <!-- 13. 链接 -->
          <a
            v-else-if="token.type === 'link' && isSafeLinkUrl(token.href)"
            :href="token.href"
            :title="token.title || undefined"
            target="_blank"
            rel="noopener noreferrer"
            class="md-link"
          >
            <RichTextRenderer
              :tokens="token.tokens"
              :resolve-asset="resolveAsset"
            />
          </a>
          <span
            v-else-if="token.type === 'link'"
            class="md-link md-link-disabled"
          >
            <RichTextRenderer
              :tokens="token.tokens"
              :resolve-asset="resolveAsset"
            />
          </span>

          <!-- 14. 图片 -->
          <img
            v-else-if="token.type === 'image'"
            :src="resolveImageUrl(token.href)"
            :alt="token.text"
            :title="token.title || undefined"
            class="md-image"
          />

          <!-- 15. 换行 -->
          <br v-else-if="token.type === 'br'" />

          <!-- 16. 纯文本 -->
          <span v-else-if="token.type === 'text'" class="md-text">
            <template v-if="token.tokens">
              <RichTextRenderer
                :tokens="token.tokens"
                :resolve-asset="resolveAsset"
              />
            </template>
            <template v-else>{{ token.text }}</template>
          </span>

          <!-- 17. 空间/空白 -->
          <span v-else-if="token.type === 'space'"> </span>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
/* 基础排版 */
.rich-text-renderer {
  font-size: 1rem;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.rich-text-renderer.is-recursive {
  display: inline;
}

.md-paragraph {
  margin: 0 0 8px 0;
}

.md-paragraph:last-child {
  margin-bottom: 0;
}

.md-text {
  white-space: pre-wrap;
  display: inline;
}

/* 标题样式 */
.md-heading {
  font-weight: 600;
  line-height: 1.3;
  margin: 16px 0 8px 0;
  color: var(--el-text-color-primary);
}

.md-h1 {
  font-size: 1.4rem;
  border-bottom: 1px solid var(--el-border-color-light);
  padding-bottom: 4px;
}
.md-h2 {
  font-size: 1.25rem;
}
.md-h3 {
  font-size: 1.15rem;
}
.md-h4 {
  font-size: 1.05rem;
}
.md-h5 {
  font-size: 1rem;
}
.md-h6 {
  font-size: 0.9rem;
  color: var(--el-text-color-secondary);
}

/* 粗体与斜体 */
.md-strong {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.md-italic {
  font-style: italic;
}

.md-del {
  text-decoration: line-through;
  opacity: 0.75;
}

/* 行内代码 */
.md-inline-code {
  font-family: monospace;
  padding: 2px 6px;
  margin: 0 4px;
  font-size: 0.85em;
  background-color: var(--el-fill-color-darker);
  border-radius: 4px;
  color: var(--el-color-danger);
  word-break: break-all;
}

/* 链接与图片 */
.md-link {
  color: var(--el-color-primary);
  text-decoration: none;
  font-weight: 500;
}

.md-link:hover {
  text-decoration: underline;
}

.md-link-disabled {
  color: var(--text-color-light);
  cursor: not-allowed;
}

.md-image {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  margin: 8px 0;
  display: block;
}

/* 引用块 */
.md-blockquote {
  margin: 12px 0;
  padding: 4px 12px;
  border-left: 4px solid var(--el-border-color-darker);
  background-color: var(--el-fill-color-lighter);
  color: var(--el-text-color-regular);
  border-radius: 0 4px 4px 0;
}

/* 列表 */
.md-list {
  margin: 8px 0;
  padding-left: 20px;
}

.md-list.is-ordered {
  list-style-type: decimal;
}

.md-list:not(.is-ordered) {
  list-style-type: disc;
}

.md-list-item {
  margin-bottom: 4px;
}

.md-list-item:last-child {
  margin-bottom: 0;
}

/* 水平线 */
.md-hr {
  height: 1px;
  border: none;
  background-color: var(--el-border-color-light);
  margin: 16px 0;
}

/* 表格 */
.table-wrapper {
  width: 100%;
  overflow-x: auto;
  margin: 12px 0;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
}

.md-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.md-table th,
.md-table td {
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-light);
}

.md-table th {
  background-color: var(--el-fill-color-darker);
  font-weight: 600;
}

.md-table tr:nth-child(even) {
  background-color: var(--el-fill-color-extra-light);
}

/* 代码块样式 */
.code-block-container {
  margin: 12px 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-light);
  background-color: var(--el-fill-color-blank);
}

.code-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background-color: var(--el-fill-color-darker);
  border-bottom: 1px solid var(--el-border-color-light);
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
}

.code-lang {
  font-family: monospace;
  text-transform: lowercase;
  font-weight: 500;
}

.copy-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.copy-btn:hover {
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}

.success-icon {
  color: var(--el-color-success);
}

.code-block-pre {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
  font-family: monospace;
  font-size: 0.85rem;
  line-height: 1.4;
  background-color: var(--el-fill-color-extra-light);
}

.code-block-pre code {
  font-family: monospace;
  white-space: pre;
  word-break: normal;
  word-wrap: normal;
}

.md-html {
  margin: 8px 0;
  overflow-x: auto;
  white-space: pre-wrap;
  font: inherit;
}
</style>
