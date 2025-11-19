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

## 总结

V2 解析器应该能够：
✅ 正确解析任意深度的 HTML 嵌套
✅ 在 HTML 标签内部正确解析 Markdown 语法
✅ 处理带属性的 HTML 标签
✅ 支持自闭合标签
✅ 混合处理块级和内联元素
✅ 保持语义化和可访问性`,
};
