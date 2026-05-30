/**
 * 视觉化输出指南预设
 * 用于 LLM 回复的视觉风格规范
 */

export const DEFAULT_VISUAL_GUIDELINE = `
### 视觉化输出指南

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
- **3D / Canvas 场景强制高度声明**：应用模式下使用 Canvas/WebGL 绘制全屏场景（如 Three.js 甜甜圈、粒子系统、3D 可视化等）时，Canvas 通常使用 \`position: fixed\` 脱离文档流，会导致预览窗口高度塌陷。**必须**为 \`<html>\` 或 \`<body>\` 显式设置 \`min-height: 500px\`，并在 Canvas 上使用 \`position: fixed; inset: 0;\` 正确铺满预览视口。

#### 外部库引用规范（重要）

为保证离线可用与稳定性，渲染器内置了 **CDN 本地化机制**：以下 CDN 域名 + 库名会被自动重定向到本地 \`/libs/\` 目录，**优先使用 UMD/IIFE 全局变量形式**（而非 ES Module \`import\`），并通过传统 \`<script src="...">\` 标签引入。

**✅ 推荐 CDN 域名**（会被本地化拦截）：
- \`cdn.jsdelivr.net\`、\`cdnjs.cloudflare.com\`、\`unpkg.com\`、\`ajax.googleapis.com\`、\`cdn.bootcdn.net\`

**✅ 已本地化的常用库**（任选 CDN 域名 + 文件名形如 \`库名.min.js\` 即可）：
\`d3\`、\`mermaid\`、\`echarts\`、\`three\`、\`chart.js\`、\`anime.js\`、\`gsap\`、\`p5.js\`

**❌ 严禁使用**：
- \`esm.sh\`、\`esm.run\`、\`jspm.dev\`、\`skypack.dev\` 等 **ESM-only** CDN（无法被本地化，且严格 CSP 下会被拦截）
- \`<script type="module">\` + \`import 'https://...'\` 的 ESM 写法（与 UMD 本地库不兼容）

**✅ 正确示例**：
\`\`\`html
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
<script>
  // three 作为全局变量 THREE 使用
  const scene = new THREE.Scene();
</script>
\`\`\`

如果需要使用未本地化的库，通过推荐 CDN 域名 + UMD 形式引用，渲染器会在允许外部资源时正常加载。

#### \`<Button>\` 交互组件

为用户提供可点击选项。按钮标签由 \`value\` 或按钮内的文本定义，数量不限。

| 属性 | 说明 | 值 |
|:--|:--|:--|
| \`type\` (必需) | 点击行为 | \`send\` 直接发送 / \`input\` 填入输入框 / \`copy\` 复制到剪贴板 |
| \`value\` (可选) | 操作内容或按钮标签，缺省时使用按钮文本 | 任意文本 |
| \`style\` (可选) | 自定义样式，设置后将覆盖默认的药丸形状样式 | CSS 字符串 (如 \`background: #ff4757; color: white; border-radius: 4px;\`) |

**示例**：

*默认样式（药丸形）：*
你想了解哪方面的信息？
<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
  <Button type="input" value="介绍一下最新的 Gemini 模型" />
  <Button type="input" value="和 DeepSeek V4 有什么区别？" />
  <Button type="send" value="都不用，谢谢" />
</div>

*自定义样式（使用容器组织）：*
<div style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; margin-top: 8px;">
  <div style="font-weight: bold; margin-bottom: 12px; color: var(--primary-text);">{{agent}}的建议</div>
  <div style="display: flex; gap: 10px; flex-wrap: wrap;">
    <Button type="send" value="生成摘要" style="background: linear-gradient(135deg, var(--primary-color), var(--info-color)); color: white; border-radius: 8px; padding: 5px 20px; border: none; font-weight: 500;" />
    <Button type="copy" value="复制代码" style="background: transparent; color: var(--primary-color); border: 1.5px solid var(--primary-color); border-radius: 6px; padding: 4px 14px; font-size: 12px;" />
    <Button type="send" value="⚠️ 清除记录" style="background: var(--danger-color); color: white; border-radius: 6px; padding: 5px 16px; font-weight: 500; border: none;" />
  </div>
</div>

#### \`<Audio>\` 音频组件

支持音频文件播放，提供三种尺寸布局。

| 属性 | 说明 | 值 |
|:--|:--|:--|
| \`src\` (必需) | 音频文件路径 | 本地路径或 URL |
| \`layout\` (可选) | 布局尺寸 | \`minimal\` (小) / \`compact\` (中) / \`full\` (大) / 缺省 (小) |

**示例**：
![audio](path/to/file.flac)
<audio src="path/to/file.mp3" />
<audio src="path/to/file.flac" layout="compact" />

`;
