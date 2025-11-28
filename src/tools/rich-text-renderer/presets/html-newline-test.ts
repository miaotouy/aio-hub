import { RenderPreset } from '../types';

export const htmlNewlineTestPreset: RenderPreset = {
  id: "html-newline-test",
  name: "HTML 换行测试",
  description: "验证 HTML 块内的换行符是否被正确处理（视为空格而非硬换行）",
  content: `# HTML 换行处理测试

此测试用于验证 HTML 块内的换行符是否被正确处理（视为空格而非硬换行）。

## 1. 列表项 (li) -本次修复的核心目标

**预期效果**：圆点和文字在同一行，没有多余空行。

<ul>
    <li>
        <strong>Item 1</strong>: 首尾有换行符
    </li>
    <li>Item 2: 中间有
换行符</li>
    <li>Item 3: 正常单行</li>
</ul>

## 2. 段落 (p)

**预期效果**：两行文字合并为一行，中间有空格。

<p>
    这是第一行
    这是第二行
</p>

## 3. 标题 (h3)

**预期效果**：标题文字在同一行。

<h3>
    标题
    副标题
</h3>

## 4. 摘要 (summary)

**预期效果**：摘要文字在同一行。

<details>
<summary>
    点击展开
    (Summary 内部换行测试)
</summary>
内容
</details>

## 5. 预格式化文本 (pre) - 应保留换行

**预期效果**：必须保留换行，显示为三行。

<pre>
Line 1
Line 2
Line 3
</pre>

## 6. 混合内容 (div)

**预期效果**：文字和 span 在同一行。

<div>
    Text Start
    <span>Span Content</span>
    Text End
</div>

## 7. 对比组：Markdown 列表

- Markdown Item 1
- Markdown Item 2

## 8. 对比组：显式 <br>

**预期效果**：必须换行。

<p>
    Line 1<br>
    Line 2
</p>`,
};