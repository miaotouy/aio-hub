import { RenderPreset } from '../types';

export const advancedMixedTestPreset: RenderPreset = {
  id: "advanced-mixed-test",
  name: "高级混合解析与复杂 UI 测试",
  description: "测试 HTML 深度嵌套、容器边缘 Banner、嵌套 Markdown 表格及复杂 CSS 样式",
  content: `<think>
正在生成高级混合测试场景...
[设计目标]：
1. 验证 HTML 容器内嵌套 Markdown 表格的解析。
2. 验证复杂 CSS 样式（渐变、阴影、绝对定位模拟边缘 Banner）。
3. 验证混合解析器在处理跨行结构时的稳定性。
4. 验证内联样式与 AIO 主题变量的集成。
</think>

<div style="margin: 40px 20px; position: relative; font-family: 'Segoe UI', system-ui, sans-serif;">

  <!-- 边缘 Banner 模拟 -->
  <div style="position: absolute; top: -15px; left: -15px; background: linear-gradient(135deg, #ff4e50, #f9d423); color: white; padding: 5px 15px; border-radius: 4px; font-weight: bold; box-shadow: 3px 3px 10px rgba(0,0,0,0.2); transform: rotate(-5deg); z-index: 10; font-size: 12px; border: 1px solid rgba(255,255,255,0.3);">
    PREMIUM TEST CASE
  </div>

  <!-- 主容器 -->
  <div style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 25px; box-shadow: var(--el-box-shadow-light); backdrop-filter: blur(var(--ui-blur)); overflow: hidden;">
    
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
      <div>
        <h2 style="margin: 0; background: linear-gradient(to right, var(--primary-color), var(--el-color-success)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 1.8em;">核心架构演进报告</h2>
        <p style="margin: 5px 0 0 0; color: var(--text-color-secondary); font-size: 0.9em;">AIO Rich Text Engine v2.5.0-beta</p>
      </div>
      <div style="text-align: right;">
        <span style="display: inline-block; padding: 2px 8px; background: var(--el-color-primary-light-9); color: var(--el-color-primary); border-radius: 4px; font-size: 0.75em; border: 1px solid var(--el-color-primary-light-5);">INTERNAL USE ONLY</span>
      </div>
    </div>

    <!-- 嵌套表格测试区 -->
    <div style="background: var(--container-bg); border: 1px solid var(--border-color-light); border-radius: 8px; padding: 16px; margin: 20px 0;">
      <h4 style="margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px;">
        <span style="color: var(--el-color-warning);">📊</span> 解析器版本对比
      </h4>

| 阶段 | 核心架构 | 咕咕的评价 | 状态 |
| :--- | :--- | :--- | :--- |
| **V1 (初始)** | \`markdown-it\` + AST 封装 | **“带着镣铐跳舞”** | 🪦 已弃用 |
| **V2 (现状)** | **全自研 CustomParser** | **“我的地盘我做主”** | 🚀 活跃中 |
| **V2.5 (增强)** | **混合递归解析** | **“万物皆可嵌套”** | ✨ 本次测试 |

    </div>

    <!-- 混合内容区 -->
    <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px;">
      
      <!-- 左侧：逻辑说明 -->
      <div style="font-size: 0.95em; line-height: 1.6;">
        <p>本次更新重点解决了 <strong>HTML 容器与 Markdown 块级语法</strong> 的兼容性问题。通过改进 <code>parseHtmlContent</code> 的 Token 收集策略，我们现在可以：</p>
        
        <ul style="padding-left: 20px; color: var(--text-color);">
          <li>在 <code>div</code> 内部直接书写管道表格。</li>
          <li>支持在自定义容器中使用 <code>> blockquote</code> 引用。</li>
          <li>保持内联样式的稳定性，如这个 <span style="color: #ff4757; font-weight: bold; text-shadow: 0 0 5px rgba(255,71,87,0.3);">红色发光文本</span>。</li>
        </ul>

        <blockquote style="margin: 15px 0; border-left: 4px solid var(--primary-color); padding: 10px 15px; background: var(--primary-color-light-9); border-radius: 0 4px 4px 0;">
          “架构的优雅在于它能容纳不期而至的复杂性。”
        </blockquote>
      </div>

      <!-- 右侧：技术指标 -->
      <div style="background: var(--vscode-editor-background); border: 1px solid var(--border-color); border-radius: 6px; padding: 15px;">
        <h5 style="margin: 0 0 10px 0; font-family: monospace; color: var(--el-color-info);">TECHNICAL_METRICS.log</h5>
        
\`\`\`mermaid
graph LR
    A[Tokenize] --> B{Parser}
    B -->|Block| C[AST Node]
    B -->|Inline| D[AST Node]
    C --> E[Renderer]
    D --> E
\`\`\`

        <div style="margin-top: 10px; font-family: 'JetBrains Mono', monospace; font-size: 0.8em; color: var(--el-color-success);">
          > Parsing Depth: 12 levels<br>
          > Recursion: Enabled<br>
          > Table Support: Full
        </div>
      </div>
    </div>

    <!-- 底部公式区 -->
    <div style="margin-top: 25px; padding-top: 15px; border-top: 1px dashed var(--border-color); text-align: center;">
      <p style="font-size: 0.9em; color: var(--text-color-secondary);">解析器稳定性函数：</p>
      $$ S_{parser} = \\lim_{n \\to \\infty} \\sum_{i=1}^{n} \\frac{Context_{i}}{Recursion_{depth}} $$
    </div>

  </div>

  <!-- 底部装饰 -->
  <div style="margin-top: 15px; display: flex; justify-content: center; gap: 10px;">
    <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--el-color-danger); opacity: 0.6;"></div>
    <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--el-color-warning); opacity: 0.6;"></div>
    <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--el-color-success); opacity: 0.6;"></div>
  </div>

</div>
`,
};