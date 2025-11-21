import { RenderPreset } from '../types';

export const v2ParserTestPreset: RenderPreset = {
  id: "v2-parser-test",
  name: "V2 解析器测试",
  description: "专门测试 V2 解析器的 HTML 嵌套和混合内容能力",
  content: `# V2 解析器测试套件

## 核心特性测试

### 1. 简单 HTML 标签

<div>这是一个简单的 div 标签</div>

<p>这是一个段落标签</p>

<span>这是一个行内标签</span>

### 2. HTML 标签内嵌 Markdown

<div>
这个 div 内部包含 **粗体文本** 和 *斜体文本*，还有 \`行内代码\`。
</div>

<p>段落中的 [链接](https://example.com) 和 ~~删除线~~</p>

### 3. 嵌套 HTML 结构

<div class="outer">
  <div class="inner">
    <p>嵌套的段落，包含 **Markdown 语法**</p>
  </div>
</div>

<div>
  <p>第一段</p>
  <p>第二段，包含 *强调文本*</p>
  <div>
    <span>嵌套的 span，包含 \`代码\`</span>
  </div>
</div>

### 4. HTML 属性测试

<div class="container" style="border: 1px solid #ccc; padding: 10px;">
  这是带样式的容器，内容包括：
  - **列表项 1**
  - *列表项 2*
  - \`列表项 3\`
</div>

<p style="color: red; font-weight: bold;">
  红色粗体文本，包含 [链接](https://example.com)
</p>

### 5. 复杂嵌套

<article>
  <header>
    <h2>文章标题</h2>
    <p>发布时间：2025-01-15</p>
  </header>
  <section>
    <p>这是文章内容，包含 **重要信息** 和 *补充说明*。</p>
    <div class="note">
      <strong>注意：</strong>这是一个特别提示框
      - 提示项 1
      - 提示项 2
    </div>
  </section>
  <footer>
    <p>作者：<em>张三</em></p>
  </footer>
</article>

### 6. 表单和 Markdown 混合

<form>
  <p>请填写以下信息：</p>
  <div>
    <label>姓名：</label>
    <input type="text" placeholder="请输入姓名" />
  </div>
  <div>
    <label>简介：</label>
    <textarea rows="3"></textarea>
  </div>
  <p>说明：所有字段均为 **必填项**</p>
</form>

### 7. 列表和 HTML 混合

- 这是普通列表项
- <div>HTML div 包裹的列表项，包含 **粗体**</div>
- <p>HTML p 标签，包含 [链接](https://example.com)</p>

1. 有序列表第一项
2. <span style="color: blue;">蓝色的第二项</span>
3. 包含 \`代码\` 的第三项

### 8. 引用块和 HTML

> 这是引用块
> <div>引用内的 div，包含 **强调文本**</div>
> <p>引用内的段落</p>

### 9. 自闭合标签

<br />
<hr />
<img src="/agent-icons/sakata-gintoki.jpg" alt="测试图片" width="200" />
<input type="text" placeholder="自闭合输入框" />

### 10. 深度嵌套测试

<div class="level1">
  <p>Level 1 - 包含 **粗体**</p>
  <div class="level2">
    <p>Level 2 - 包含 *斜体*</p>
    <div class="level3">
      <p>Level 3 - 包含 \`代码\`</p>
      <div class="level4">
        <span>Level 4 - 包含 [链接](https://example.com)</span>
        <div class="level5">
          <p>Level 5 - 包含 ~~删除线~~</p>
        </div>
      </div>
    </div>
  </div>
</div>

### 11. 多种标签组合

<div style="background: #1a1f2e; padding: 15px; margin: 10px 0;">
  <h3>组合测试</h3>
  <p>段落包含：</p>
  <ul>
    <li><b>HTML 粗体</b></li>
    <li>**Markdown 粗体**</li>
    <li><i>HTML 斜体</i></li>
    <li>*Markdown 斜体*</li>
    <li><code>HTML 代码</code></li>
    <li>\`Markdown 代码\`</li>
  </ul>
  <blockquote>
    <p>引用中的 <strong>强调</strong> 和 **Markdown** 混合</p>
  </blockquote>
</div>

### 12. 表格内的 HTML

| 列1 | 列2 | 列3 |
|-----|-----|-----|
| <b>粗体单元格</b> | *斜体内容* | \`代码\` |
| <div>div 包裹</div> | [链接](https://example.com) | ~~删除~~ |

### 13. Details 和折叠内容

<details>
  <summary>点击展开详情</summary>
  <div>
    <p>这是隐藏的内容，包含：</p>
    <ul>
      <li>**重要信息 1**</li>
      <li>*补充说明 2*</li>
      <li>\`代码示例 3\`</li>
    </ul>
    <p>更多内容...</p>
  </div>
</details>

<details>
  <summary>Summary 内部不应产生 P 标签</summary>
  这是一个 **Details** 的直接子内容。
</details>


### 14. 语义化标签嵌套

<article>
  <header>
    <nav>
      <ul>
        <li><a href="#section1">章节 1</a></li>
        <li><a href="#section2">章节 2</a></li>
      </ul>
    </nav>
  </header>
  <main>
    <section id="section1">
      <h2>章节 1</h2>
      <p>内容包含 **重点** 和 *说明*</p>
      <aside>
        <p>侧边栏信息</p>
      </aside>
    </section>
  </main>
  <footer>
    <p>页脚 - <em>版权所有</em></p>
  </footer>
</article>

### 15. 极端嵌套测试

<div><div><div><div><div>
  五层嵌套的内容，包含 **所有** *类型* 的 \`Markdown\` [语法](https://example.com)
</div></div></div></div></div>

---

## V2 新增特性测试

### 16. KaTeX 数学公式

#### 块级公式

$$
f(x) = \\int_{-\\infty}^\\infty \\hat f(\\xi)\\,e^{2 \\pi i \\xi x} \\,d\\xi
$$

#### 行内公式

这是一个行内公式 $E=mc^2$ 的示例，它应该和文本在同一行。

#### 混合内容

<div>
  <p>HTML 标签内的公式 $a^2 + b^2 = c^2$</p>
  <ul>
    <li>列表项中的公式：$\\frac{\\partial L}{\\partial q_i} - \\frac{d}{dt}\\frac{\\partial L}{\\partial \\dot{q}_i} = 0$</li>
  </ul>
</div>

### 17. LLM 思考标签

<think>
这是一个 LLM 思考块。
内部可以包含 **Markdown** 语法。

- 列表项 1
- 列表项 2
</think>

<think>
  <p>这是在思考块内部的 HTML 段落</p>
  <think>
    这是一个嵌套的思考块，包含 \`代码\`。
  </think>
</think>

这是一个未闭合的思考块（模拟流式输出）：
<think>
  内部有一些内容，但是标签没有闭合。

### 18. Markdown 引号

这是一个 “中文引号” 的例子。
这是另一个 "英文引号" 的例子。
这是一个不成对的引号 “ 后面没有闭合。

### 19. 徽章换行优化

下面两个徽章在源码中是换行的，但应该渲染在同一行。
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Made with Vue](https://img.shields.io/badge/made%20with-Vue.js-brightgreen.svg)](https://vuejs.org/)

### 20. HTML 解析健壮性

这个 \`<100ms>\` 不应该被解析为 HTML 标签，而应视为纯文本。

### 21. Mermaid 图表

\`\`\`mermaid
graph TD
    A[开始] --> B{判断}
    B -- 是 --> C[执行操作]
    B -- 否 --> D[结束]
    C --> D
\`\`\`

### 22. 自动链接 (Autolink)

V2 解析器支持直接识别 URL：
<https://example.com>
<mailto:user@example.com>

### 23. 多种分割线样式

星号分割线：
***

下划线分割线：
___

### 24. 复杂列表嵌套 (增强版)

- 第一层无序列表
  - 第二层无序列表
    1. 第三层有序列表
    2. 第三层有序列表项 2
       - 第四层无序列表
       - 第四层无序列表项 2
  - 第二层无序列表项 2
- 第一层无序列表项 2
  1. 第二层有序列表
     1. 第三层有序列表
        - 第四层无序列表（包含 **粗体**）
        - 第四层无序列表（包含 \`代码\`）

### 25. 转义字符测试

Markdown 转义字符应被正确渲染：
\\*这不是斜体\\*
\\[这不是链接\\]
\\<这不是标签\\>

### 26. 真实场景：复杂列表嵌套 (LLM 输出风格)

2.  **技术核心（背插3.0）**：
    *   **主板**：
        *   **供电整合**：将CPU、24pin、PCIe等所有供电整合到一个基于服务器CRPS标准的金手指接口，置于主板背面。
        *   **I/O整合**：将机箱前面板的USB、音频、开关等接口统一布局，实现“一插全接好”。
        *   **SATA供电**：主板背面集成SATA供电口。
    *   **显卡**：
        *   **兼容方案**：金手指供电+传统侧插供电口二合一。通过可拆卸转接板切换，兼顾新标准、兼容性和二手残值。
    *   **电源**：
        *   **标准**：采用ATX3.0标准（放弃12VO以规避bug），通过金手指与主板连接。
        *   **布局**：置于主板右侧，是散热与布线权衡后的结果。可通过“延长线”实现个性化安装。
    *   **机箱**：
        *   **兼容性**：同时支持背插与传统配件。
        *   **风扇免理线**：在风扇位预留供电/RGB接口，或更激进地将接口做在机箱上，风扇安装即连接。
    *   **整体目标**：将繁琐的手动接线过程，转变为模块化的即插即用体验，大幅降低DIY门槛，提升整洁度。
`,
};
