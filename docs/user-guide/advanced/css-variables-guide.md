<div v-pre>

# CSS 变量宏

CSS 变量宏用于让 LLM Chat 中的视觉化输出读取当前主题颜色、背景、模糊强度等样式信息。它适合写 Agent 的视觉化输出指南，也适合让 AI 生成更贴合 AIO Hub 当前外观的 HTML 片段。

## 什么时候使用

当你希望 AI 输出带样式的内容时，建议使用 CSS 变量宏：

- 让生成的卡片、按钮、表格跟随当前主题。
- 避免硬编码浅色或深色背景导致切换主题后看不清。
- 把当前主色、文字色、边框色注入 Agent 的视觉规范。
- 让同一个 Agent 在不同外观配置下仍保持一致体验。

## 基本语法

使用 `{{cssvar::--变量名}}` 读取当前 CSS 变量的计算值。

```text
当前主色：{{cssvar::--el-color-primary}}
当前卡片背景：{{cssvar::--card-bg}}
当前文字色：{{cssvar::--el-text-color-primary}}
```

宏会在消息发送前展开，返回浏览器计算后的实际值，例如 `#409eff` 或 `rgba(255, 255, 255, 0.82)`。

## 常用变量

| 变量                      | 用途               |
| :------------------------ | :----------------- |
| `--el-color-primary`      | 应用主色           |
| `--el-text-color-primary` | 主要文字颜色       |
| `--el-text-color-regular` | 正文文字颜色       |
| `--el-border-color`       | 常规边框颜色       |
| `--card-bg`               | 卡片或容器背景     |
| `--input-bg`              | 输入框背景         |
| `--sidebar-bg`            | 侧边栏背景         |
| `--ui-blur`               | 当前毛玻璃模糊强度 |
| `--card-opacity`          | 卡片透明度数值     |

如果要写可维护的 HTML，优先让 AI 在 CSS 中使用变量名本身，例如 `background: var(--card-bg)`；只有当模型需要知道实际颜色值时，再用宏读取。

## 写进视觉化输出指南

在 Agent 编辑器的视觉化输出指南中，可以这样写：

````markdown
请遵循当前主题：

- 主色：{{cssvar::--el-color-primary}}
- 文本：{{cssvar::--el-text-color-primary}}
- 卡片背景：{{cssvar::--card-bg}}

生成 HTML 时优先使用 CSS 变量：

```css
.panel {
  background: var(--card-bg);
  color: var(--el-text-color-primary);
  border: 1px solid var(--el-border-color);
  backdrop-filter: blur(var(--ui-blur));
}
```
````

## 与自定义 CSS 的区别

- CSS 变量宏：把当前样式值注入到提示词或消息中，主要影响 AI 生成内容。
- CSS 样式覆盖：你手动编写全局覆盖样式，直接影响 AIO Hub 界面。
- 视觉化输出指南：告诉 Agent 如何组织和渲染富文本或 HTML。

三者可以配合使用：先用设置中的 CSS 样式覆盖调整应用外观，再用 CSS 变量宏把当前外观传给 Agent。

## 注意事项

- 宏只适用于支持宏处理的文本位置。
- 变量不存在时，返回值可能为空。
- 动态主题切换后，下一次宏展开会读取新的计算值。
- 不要把大量 CSS 变量全部注入提示词，只提供当前任务需要的关键变量。
- 如果生成内容要长期保存，建议保存变量名而不是保存某一次展开后的颜色值。

## 常见问题

### 为什么宏没有展开？

确认当前位置支持宏处理，并检查语法是否为 `{{cssvar::--变量名}}`。如果在普通 Markdown 文档或不经过 LLM Chat 宏引擎的地方使用，它只会显示原文本。

### 为什么生成内容在不同主题下仍然不协调？

可能是 AI 硬编码了颜色。请在视觉化输出指南中明确要求优先使用 `var(--变量名)`，并只在需要推理颜色时读取宏值。

### 可以读取自定义变量吗？

可以。只要变量已经在当前页面的计算样式中生效，就可以用同样语法读取。

### 相关阅读

- [宏参考手册](../tools/llm-chat/macro-system/macro-reference)
- [CSS 样式覆盖](../settings/custom-css)
- [Agent 编辑器指南](../tools/llm-chat/agents/editor-guide)

</div>
