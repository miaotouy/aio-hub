<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <details
    class="details-node"
    :class="[`variant-${variant}`, `tone-${tone}`, { 'is-dense': isDense }]"
    :open="isOpen"
    :data-node-id="nodeId"
    :style="sanitizedStyle"
    @toggle="handleToggle"
  >
    <summary class="details-summary" @click="handleSummaryClick">
      <span class="details-arrow" :class="{ 'is-expanded': isOpen }">
        <ChevronRight :size="16" />
      </span>

      <div class="details-title">
        <AstNodeRenderer
          v-if="summaryNodes.length > 0"
          :nodes="summaryNodes"
          :enable-enter-animation="false"
        />
        <span v-else class="details-fallback-title">{{ fallbackSummary }}</span>
      </div>

      <div class="details-actions" v-if="showCopyButton">
        <el-tooltip :content="copied ? '已复制' : '复制内容'" :show-after="300">
          <button
            class="details-action-btn"
            :class="{ 'is-active': copied }"
            @click.stop.prevent="handleCopy"
            aria-label="复制内容"
          >
            <Check v-if="copied" :size="14" />
            <Copy v-else :size="14" />
          </button>
        </el-tooltip>
      </div>
    </summary>

    <div
      ref="contentRef"
      class="details-content"
      :class="{ 'has-max-height': !!maxHeightStyle }"
      :style="maxHeightStyle ? { maxHeight: maxHeightStyle } : undefined"
    >
      <AstNodeRenderer v-if="bodyNodes.length > 0" :nodes="bodyNodes" />
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronRight, Copy, Check } from "lucide-vue-next";
import type { AstNode } from "../../types";
import AstNodeRenderer from "../AstNodeRenderer";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";

const errorHandler = createModuleErrorHandler("rich-text-renderer/DetailsNode");
const logger = createModuleLogger("rich-text-renderer/DetailsNode");

const props = defineProps<{
  nodeId: string;
  tagName: string;
  attributes: Record<string, string>;
  /** 原始 AST 子节点数组（由 AstNodeRenderer 通过 sourceNodes 模式传入） */
  sourceNodes?: AstNode[];
}>();

// ============ 工具函数 ============

/**
 * 解析 HTML 风格的布尔属性
 * - 缺失（undefined） → false
 * - 存在且值不为 "false" / "0" → true
 */
function parseBooleanAttr(val: string | undefined): boolean {
  if (val === undefined || val === null) return false;
  if (val === "false" || val === "0") return false;
  return true;
}

/**
 * 把 max-height 输入规范化：纯数字补 px，其余原样
 */
function formatMaxHeight(val: string | undefined): string | undefined {
  if (!val) return undefined;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return trimmed;
}

/**
 * 内联 style 安全清理（复用自 GenericHtmlNode 的同名逻辑）
 * 过滤可能导致布局逃逸或覆盖宿主 UI 的 CSS 属性
 */
const DANGEROUS_STYLE_PATTERNS = [
  /position\s*:\s*(fixed|sticky)/gi,
  /z-index\s*:\s*\d{4,}/gi,
];

function sanitizeInlineStyle(styleStr: string): string {
  if (!styleStr || typeof styleStr !== "string") return "";
  let sanitized = styleStr;
  for (const pattern of DANGEROUS_STYLE_PATTERNS) {
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, "/* blocked */");
  }
  return sanitized;
}

// ============ 属性解析 ============

const VALID_VARIANTS = new Set(["default", "card", "ghost"]);
const VALID_TONES = new Set([
  "neutral",
  "info",
  "success",
  "warning",
  "danger",
]);

const variant = computed<"default" | "card" | "ghost">(() => {
  const v = props.attributes["data-variant"];
  if (v && VALID_VARIANTS.has(v)) return v as "default" | "card" | "ghost";
  return "default";
});

const tone = computed<"neutral" | "info" | "success" | "warning" | "danger">(
  () => {
    const t = props.attributes["data-tone"];
    if (t && VALID_TONES.has(t))
      return t as "neutral" | "info" | "success" | "warning" | "danger";
    return "neutral";
  }
);

const maxHeightStyle = computed(() =>
  formatMaxHeight(props.attributes["data-max-height"])
);

const isDense = computed(() =>
  parseBooleanAttr(props.attributes["data-dense"])
);

const showCopyButton = computed(
  () => !parseBooleanAttr(props.attributes["data-no-copy"])
);

const fallbackSummary = computed(
  () => props.attributes["data-summary"] || "详情"
);

const sanitizedStyle = computed(() => {
  const raw = props.attributes.style;
  if (!raw) return undefined;
  return sanitizeInlineStyle(raw);
});

// ============ summary / body 拆分 ============

/**
 * 从 sourceNodes 中拣出第一个 tagName="summary" 的节点作为标题区，
 * 其余作为正文。
 */
const summaryNodes = computed<AstNode[]>(() => {
  const list = props.sourceNodes ?? [];
  for (const child of list) {
    if (
      child.type === "generic_html" &&
      (child.props as any)?.tagName?.toLowerCase() === "summary"
    ) {
      return (child.children ?? []) as AstNode[];
    }
  }
  return [];
});

const bodyNodes = computed<AstNode[]>(() => {
  const list = props.sourceNodes ?? [];
  let foundSummary = false;
  const result: AstNode[] = [];
  for (const child of list) {
    const isSummary =
      child.type === "generic_html" &&
      (child.props as any)?.tagName?.toLowerCase() === "summary";
    if (isSummary && !foundSummary) {
      foundSummary = true;
      continue;
    }
    result.push(child);
  }
  return result;
});

// ============ 展开/折叠状态 ============

/**
 * 是否默认展开
 * - HTML 原生 `open` 属性存在 → 展开
 * - 否则 → 折叠（与 HTML 标准一致）
 */
const isOpen = ref(parseBooleanAttr(props.attributes.open));

function handleToggle(event: Event) {
  const target = event.target as HTMLDetailsElement | null;
  if (target) {
    isOpen.value = target.open;
  }
}

function handleSummaryClick(_event: MouseEvent) {
  // 留空：交给 <details> 的原生 toggle 行为处理。
  // 这里只是占位，方便后续按需扩展（比如自定义快捷键）。
}

// ============ 复制按钮 ============

const contentRef = ref<HTMLElement | null>(null);
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

async function handleCopy() {
  const el = contentRef.value;
  if (!el) {
    logger.warn("复制失败：内容容器引用为空");
    return;
  }

  // v1：复制 innerText（保留可视化文本，丢弃格式）
  const text = el.innerText?.trim() ?? "";
  if (!text) {
    customMessage.warning("内容为空");
    return;
  }

  const ok = await errorHandler.wrapAsync(
    async () => {
      await navigator.clipboard.writeText(text);
      return true;
    },
    { userMessage: "复制失败，请检查剪贴板权限" }
  );

  if (ok === null) return;

  copied.value = true;
  customMessage.success("已复制");
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copied.value = false;
    copyTimer = null;
  }, 1500);
}
</script>

<style scoped>
/* ============ 容器基础 ============ */

.details-node {
  display: block;
  margin: 12px 0;
  border-radius: 8px;
  box-sizing: border-box;
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
  /* tone 强调色变量，由子选择器覆盖 */
  --details-accent: var(--el-color-info, #909399);
  --details-accent-rgb: var(--el-color-info-rgb, 144, 147, 153);
}

/* ============ Variant: default ============ */

.details-node.variant-default {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
}

.details-node.variant-default[open] {
  border-color: var(--details-accent);
}

/* ============ Variant: card ============ */

.details-node.variant-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  box-shadow: var(--el-box-shadow-light, 0 2px 8px rgba(0, 0, 0, 0.08));
}

.details-node.variant-card .details-summary {
  background-color: rgba(
    var(--details-accent-rgb),
    calc(var(--card-opacity, 1) * 0.08)
  );
}

.details-node.variant-card[open] .details-summary {
  background-color: rgba(
    var(--details-accent-rgb),
    calc(var(--card-opacity, 1) * 0.12)
  );
  border-bottom: var(--border-width) solid var(--border-color);
}

/* ============ Variant: ghost ============ */

.details-node.variant-ghost {
  background-color: transparent;
  border: none;
  border-left: 3px solid var(--details-accent);
  border-radius: 0;
  padding-left: 4px;
}

.details-node.variant-ghost .details-summary {
  padding: 6px 8px;
}

/* ============ Tone 强调色 ============ */

.details-node.tone-neutral {
  --details-accent: var(--el-color-info, #909399);
  --details-accent-rgb: var(--el-color-info-rgb, 144, 147, 153);
}

.details-node.tone-info {
  --details-accent: var(--el-color-primary, #409eff);
  --details-accent-rgb: var(--el-color-primary-rgb, 64, 158, 255);
}

.details-node.tone-success {
  --details-accent: var(--el-color-success, #67c23a);
  --details-accent-rgb: var(--el-color-success-rgb, 103, 194, 58);
}

.details-node.tone-warning {
  --details-accent: var(--el-color-warning, #e6a23c);
  --details-accent-rgb: var(--el-color-warning-rgb, 230, 162, 60);
}

.details-node.tone-danger {
  --details-accent: var(--el-color-danger, #f56c6c);
  --details-accent-rgb: var(--el-color-danger-rgb, 245, 108, 108);
}

/* ============ 标题栏 ============ */

.details-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  list-style: none;
  outline: none;
  transition: background-color 0.2s ease;
}

/* 隐藏浏览器默认的三角箭头 */
.details-summary::-webkit-details-marker {
  display: none;
}

.details-summary::marker {
  content: "";
}

.details-summary:hover {
  background-color: rgba(
    var(--details-accent-rgb),
    calc(var(--card-opacity, 1) * 0.06)
  );
}

.details-summary:focus-visible {
  outline: 2px solid var(--details-accent);
  outline-offset: -2px;
}

/* dense 紧凑模式 */
.details-node.is-dense .details-summary {
  padding: 6px 10px;
}

/* 箭头 */
.details-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: var(--details-accent);
  transition: transform 0.2s ease;
}

.details-arrow.is-expanded {
  transform: rotate(90deg);
}

/* 标题 */
.details-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
  line-height: 1.4;
  word-break: break-word;
}

/* 标题内被 AstNodeRenderer 递归出来的 paragraph 等块级元素需要去掉默认 margin */
.details-title :deep(p),
.details-title :deep(.rich-text-block) {
  margin: 0;
  display: inline;
}

.details-fallback-title {
  color: var(--el-text-color-secondary, #909399);
  font-weight: 500;
}

/* 操作按钮区 */
.details-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.details-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--el-text-color-secondary, #909399);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.details-action-btn:hover {
  background-color: rgba(
    var(--details-accent-rgb),
    calc(var(--card-opacity, 1) * 0.15)
  );
  color: var(--details-accent);
}

.details-action-btn.is-active {
  color: var(--el-color-success, #67c23a);
}

/* ============ 内容区 ============ */

.details-content {
  padding: 12px 14px;
  color: var(--el-text-color-regular, #606266);
  /* content-visibility 让 viewport 外的内容跳过渲染 */
  content-visibility: auto;
  contain-intrinsic-size: 0 200px;
}

.details-node.is-dense .details-content {
  padding: 8px 10px;
}

/* 当设置了 max-height 时启用纵向滚动 */
.details-content.has-max-height {
  overflow-y: auto;
  overflow-x: hidden;
}

/* 内容区第一个块级子元素去掉顶部 margin */
.details-content > :deep(*:first-child) {
  margin-top: 0;
}

.details-content > :deep(*:last-child) {
  margin-bottom: 0;
}

/* ghost variant 内容区也降低 padding */
.details-node.variant-ghost .details-content {
  padding: 8px 8px 8px 12px;
}
</style>
