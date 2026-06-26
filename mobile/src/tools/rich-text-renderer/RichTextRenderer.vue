<script setup lang="ts">
import { computed, ref } from "vue";
import { marked } from "marked";
import { Copy, Check } from "lucide-vue-next";

defineOptions({
  name: "RichTextRenderer",
});

const props = withDefaults(
  defineProps<{
    content?: string;
    tokens?: any[]; // 支持直接传入 tokens 数组用于递归
    isStreaming?: boolean;
    resolveAsset?: (content: string) => string;
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

/**
 * 解析得到的 Tokens 列表
 */
const displayTokens = computed(() => {
  if (props.tokens) {
    return props.tokens;
  }
  const text = processedContent.value;
  if (!text) return [];

  try {
    // 使用 marked.lexer 拿到标准的 AST Tokens 数组
    return marked.lexer(text);
  } catch (err) {
    console.error("[RichTextRenderer] Failed to parse markdown:", err);
    // 降级为纯文本 Token
    return [{ type: "text", text }];
  }
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
    console.error("Failed to copy code:", err);
  }
}
</script>

<template>
  <div class="rich-text-renderer" :class="{ 'is-recursive': isRecursive }">
    <template v-for="(token, index) in displayTokens" :key="index">
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

      <!-- 3. 代码块 -->
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
      <blockquote v-else-if="token.type === 'blockquote'" class="md-blockquote">
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

      <!-- 8. HTML 块 -->
      <div
        v-else-if="token.type === 'html'"
        v-html="token.text"
        class="md-html"
      ></div>

      <!-- 9. 行内粗体 -->
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
        v-else-if="token.type === 'link'"
        :href="token.href"
        :title="token.title || undefined"
        target="_blank"
        class="md-link"
      >
        <RichTextRenderer
          :tokens="token.tokens"
          :resolve-asset="resolveAsset"
        />
      </a>

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
}
</style>
