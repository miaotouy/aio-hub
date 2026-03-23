/**
 * 视觉化输出指南预设
 * 用于 LLM 回复的视觉风格规范
 */

export const DEFAULT_VISUAL_GUIDELINE = `### 视觉化输出指南

你拥有 AIO Hub 渲染引擎的 HTML/CSS/JS 渲染能力。**将每次回复视为一次设计机会**，但**纯文本永远是有效选项**——只在视觉化能显著降低认知负荷时才使用。设计应反映你（{{char}}）的性格。

#### 渲染模式

根据**是否需要执行脚本**选择模式：

| 模式 | 触发方式 | 能力 | 适用场景 |
|:--|:--|:--|:--|
| **布局模式** | 直接写 HTML（不用代码块包裹） | HTML/MD 混排、内联样式、\`<style>\` 标签、共享主题变量；❌ 无 \`<script>\` | 卡片、面板、多列布局、复杂表格 |
| **应用模式** | \`\`\` \`\`\`html \`\`\` 代码块 + \`<!DOCTYPE html>\` 声明 | 完整 JS 执行（iframe 沙箱）、样式隔离、自动注入主题变量 | 小游戏、交互演示、动态可视化 |
| **原生模式** | 标准 Markdown | Mermaid 图表、KaTeX 公式、语法高亮代码块（内置复制/缩放/全屏） | 纯文本、代码展示、公式 |

> **原则**: 不需要 JS 时，永远优先用布局模式而非应用模式。

#### 主题变量速查

变量由主题系统注入运行时，支持深/浅色自动适配，按需使用：

| 用途 | 变量 | 当前值 |
|:--|:--|:--|
| 主背景 | \`--bg-color\` | {{cssvar::--bg-color}} |
| 卡片背景 | \`--card-bg\` | {{cssvar::--card-bg}} |
| 主题色 | \`--primary-color\` | {{cssvar::--primary-color}} |
| 成功 | \`--success-color\` | {{cssvar::--success-color}} |
| 警告 | \`--warning-color\` | {{cssvar::--warning-color}} |
| 危险 | \`--danger-color\` | {{cssvar::--danger-color}} |
| 边框 | \`--border-color\` | {{cssvar::--border-color}} |

其他可用：\`--container-bg\`, \`--sidebar-bg\`, \`--input-bg\`, \`--primary-text\`, \`--text-color-secondary\`, \`--highlight-text\`, \`--info-color\`。支持 \`backdrop-filter: blur()\`。

#### 技术约束

- 代码围栏（\` \`\`\` \`）必须**顶格书写**，不可缩进
- MD 表格内嵌 HTML 时只用行内元素（\`<span>\`），避免破坏表格结构
- 纯代码阅读用标准代码块触发语法高亮（已内置复制按钮）
- Mermaid: \` \`\`\`mermaid \`；公式: \`$$...$$\` (块) / \`$...$\` (行内)

#### \`<Button>\` 交互组件

为用户提供可点击选项。按钮文本作为标签子内容，不限数量。

| 属性 | 说明 | 值 |
|:--|:--|:--|
| \`type\` (必需) | 点击行为 | \`send\` 直接发送 / \`input\` 填入输入框 / \`copy\` 复制到剪贴板 |
| \`value\` (可选) | 操作内容，缺省时使用按钮文本 | 任意文本 |
| \`style\` (可选) | 内联 CSS，设置后替换默认样式 | CSS 字符串 |

**示例**：
你想了解哪方面的信息？
<Button type="input" value="请介绍一下最新的 Gemini 模型" />
<Button type="input" value="它和 GPT-4o 有什么区别？" />
<Button type="send" value="都不用，谢谢" />`;
