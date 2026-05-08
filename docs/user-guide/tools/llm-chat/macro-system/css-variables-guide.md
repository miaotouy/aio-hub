# CSS 变量与视觉化输出指南

在 LLM Chat 中，智能体可以通过输出 HTML/CSS 内容来实现丰富的视觉交互。为了确保这些输出内容与当前应用的主题外观完美融合，系统提供了 `{{cssvar}}` 宏来获取实时样式信息。

## 1. 为什么需要 CSS 变量宏？

由于 LLM Chat 支持动态的主题外观切换（透明度、模糊度、主色调等），硬编码颜色值会导致输出内容在切换主题后显得突兀。

通过 `{{cssvar}}` 宏，你可以：
- 让 LLM 了解当前界面的主色、背景色、文字颜色。
- 在视觉化输出指南（Visual Guideline）中注入当前的样式约束。
- 确保生成的 UI 组件（如卡片、按钮）与原生界面步调一致。

## 2. 常用变量参考

你可以通过 `{{cssvar::--变量名}}` 引用以下常用的系统变量：

### 基础颜色
- `--el-color-primary`: 应用主色。
- `--el-text-color-primary`: 主要文字颜色。
- `--el-border-color`: 标准边框颜色。

### 主题外观系统变量
- `--card-bg`: 卡片/容器的背景色（已包含透明度）。
- `--input-bg`: 输入框背景色。
- `--ui-blur`: 当前的模糊强度（用于 `backdrop-filter`）。
- `--card-opacity`: 当前卡片的透明度数值。

## 3. 使用示例

在 Agent 编辑器的 **「视觉化输出指南」** 中，你可以这样编写：

```markdown
# 视觉规范

你的输出应遵循以下当前主题的配色方案：
- 背景色: {{cssvar::--card-bg}}
- 主色调: {{cssvar::--el-color-primary}}
- 文字色: {{cssvar::--el-text-color-primary}}

在编写 HTML 时，请优先使用 CSS 变量名而非固定颜色值，例如：
`background-color: var(--card-bg); color: var(--el-text-color-primary);`
```

## 4. 运行机制

- **执行阶段**: `{{cssvar}}` 在宏引擎的 `POST_PROCESS` 阶段执行。
- **动态获取**: 宏会直接从浏览器的计算样式（Computed Style）中提取当前生效的值。
- **格式**: 返回的是浏览器计算后的实际值（如 `#3b82f6` 或 `rgba(255, 255, 255, 0.8)`）。

---

### 相关阅读
- [主题外观系统规范](../../../architecture/theme-system-architecture)
- [宏参考手册](./macro-reference)
- [Agent 视觉化输出设置](../agents/editor-guide#4-输出与显示-output)