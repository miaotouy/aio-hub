<template>
  <component
    :is="safeTagName"
    v-bind="filteredAttributes"
    :class="computedClass"
    :data-node-id="nodeId"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { RICH_TEXT_CONTEXT_KEY, type RichTextContext } from "../../types";

const props = defineProps<{
  nodeId: string;
  tagName: string;
  attributes: Record<string, string>;
  /** 是否允许渲染危险的 HTML 标签（覆盖 context 中的设置） */
  allowDangerousHtml?: boolean;
}>();

// 注入上下文以获取资产解析钩子
const context = inject<RichTextContext | null>(RICH_TEXT_CONTEXT_KEY, null);

// 验证标签名是否合法
// HTML 标签名必须以字母开头,只能包含字母、数字、连字符和下划线
// 参考：https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name
const isValidTagName = (tag: string): boolean => {
  // 基本规则：以字母开头，后跟字母、数字、连字符或下划线
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(tag);
};

// 危险标签黑名单：即便语法合法也不允许渲染的标签
const DANGEROUS_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "base",
  "meta",
  "link",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "frame",
  "frameset",
  "applet",
]);

// 安全的标签名：非法或危险标签名退化为 span
const safeTagName = computed(() => {
  const tag = props.tagName.toLowerCase();

  // 检查是否在黑名单中
  // 仅在未显式允许危险 HTML 时进行检查
  const isDangerousAllowed = props.allowDangerousHtml ?? context?.allowDangerousHtml?.value ?? false;

  if (DANGEROUS_TAGS.has(tag) && !isDangerousAllowed) {
    console.warn(
      `[GenericHtmlNode] Dangerous tag blocked: "${props.tagName}", fallback to <span>. Set allowDangerousHtml to true to bypass.`
    );
    return "span";
  }

  if (isValidTagName(props.tagName)) {
    return props.tagName;
  }

  // 非法标签名，使用 span 包裹，并在控制台警告
  console.warn(
    `[GenericHtmlNode] Invalid tag name detected: "${props.tagName}", fallback to <span>`
  );
  return "span";
});

// 为特定标签自动添加 Markdown 样式类
const computedClass = computed(() => {
  const classes: string[] = [];

  // 如果用户提供了 class，先添加
  if (props.attributes.class) {
    classes.push(props.attributes.class);
  }

  // 为特定的 HTML 标签添加 Markdown 样式
  // 这样可以让 HTML 块内的这些元素保持与 Markdown 元素相同的视觉效果
  if (props.tagName === "blockquote") {
    classes.push("markdown-blockquote");
  }

  return classes.length > 0 ? classes.join(" ") : undefined;
});

// 验证属性名是否合法
const isValidAttributeName = (name: string): boolean => {
  // 属性名必须以字母或下划线开头（HTML5 实际上允许更多，但为了安全起见我们限制严格一点）
  // 绝对不能以数字开头，这会导致 setAttribute 报错
  return /^[a-zA-Z_][a-zA-Z0-9_\-:]*$/.test(name);
};

// 过滤和处理属性
// 移除可能有安全风险的属性，并处理特殊属性
const filteredAttributes = computed(() => {
  const attrs: Record<string, any> = {};

  for (const [key, value] of Object.entries(props.attributes)) {
    // 首先检查属性名是否合法
    if (!isValidAttributeName(key)) {
      continue;
    }

    const lowerKey = key.toLowerCase();

    // 跳过危险属性
    if (lowerKey.startsWith("on")) {
      // 跳过事件处理器（如 onclick, onload 等）
      continue;
    }

    // 跳过 class，因为我们在 computedClass 中统一处理
    if (lowerKey === "class") {
      continue;
    }

    // 过滤 javascript: 协议的 URL 属性
    const isUrlAttr = ["src", "href", "action", "formaction", "data"].includes(lowerKey);
    if (
      isUrlAttr &&
      typeof value === "string" &&
      value.toLowerCase().trim().startsWith("javascript:")
    ) {
      console.warn(`[GenericHtmlNode] Blocked javascript: URL in attribute "${key}"`);
      continue;
    }

    // 处理特殊属性
    if (lowerKey === "style") {
      attrs.style = value;
    } else if (
      lowerKey === "src" &&
      typeof value === "string" &&
      value.startsWith("agent-asset://")
    ) {
      // 解析智能体资产链接
      if (context?.resolveAsset) {
        attrs.src = context.resolveAsset(value);
      } else {
        attrs.src = value;
      }
    } else {
      // 其他属性直接传递
      attrs[key] = value;
    }
  }

  return attrs;
});
</script>

<style scoped>
/* 为 HTML 块内的 blockquote 添加 Markdown 样式 */
.markdown-blockquote {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 4px solid var(--primary-color);
  background-color: var(--hover-bg);
  color: var(--text-color-light);
}
</style>
