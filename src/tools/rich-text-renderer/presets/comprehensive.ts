import { RenderPreset } from '../types';

export const comprehensivePreset: RenderPreset = {
  id: "comprehensive",
  name: "Markdown 渲染测试文档",
  description: "全面的 Markdown 语法测试文档，包含各种元素和嵌套结构",
  content: `# Markdown 渲染测试文档

## 目录
- [文本样式](#文本样式)
- [标题层级](#标题层级)
- [列表](#列表)
- [代码](#代码)
- [表格](#表格)
- [引用与警告](#引用与警告)
- [媒体与链接](#媒体与链接)
- [数学公式](#数学公式)
- [图表 (Mermaid)](#图表-mermaid)
- [特殊元素](#特殊元素)
- [边缘情况](#边缘情况)

---

## 文本样式

**基础样式：**
- 普通文本
- **粗体文本 (Bold)**
- *斜体文本 (Italic)*
- ***粗斜体文本 (Bold Italic)***
- ~~删除线文本 (Strikethrough)~~
- \`行内代码 (Inline Code)\`
- ==高亮文本 (Highlight)==
- H~2~O (下标 - 如果支持)
- X^2^ (上标 - 如果支持)
- <u>下划线 (HTML)</u>

**组合样式：**
- **粗体中包含*斜体***
- *斜体中包含**粗体***
- ~~删除线中包含\`代码\`~~
- [链接中包含**粗体**](#)

---

## 标题层级

# H1 标题
## H2 标题
### H3 标题
#### H4 标题
##### H5 标题
###### H6 标题

---

## 列表

### 无序列表
- 第一层
  - 第二层
    - 第三层
      - 第四层
- 列表项中包含多行文本
  这是第二行，应该有缩进。

### 有序列表
1. 第一步
2. 第二步
   1. 子步骤 2.1
   2. 子步骤 2.2
      1. 深层步骤 2.2.1
3. 第三步

### 任务列表
- [x] 已完成任务
- [ ] 未完成任务
- [ ] **加粗的**任务描述
- [x] ~~已取消的任务~~

### 定义列表 (如果支持)
Term 1
: Definition 1

Term 2
: Definition 2 with
  multi-line content.

---

## 代码

### 行内代码
在文本中使用 \`const x = 1\` 变量。包含反引号：\`\` \` \`\`。

### 代码块

**JavaScript:**
\`\`\`javascript
function hello() {
  console.log("Hello, World!");
  // 测试特殊字符: $ \` ' "
}
\`\`\`

**Python:**
\`\`\`python
def add(a, b):
    """
    多行文档字符串
    """
    return a + b
\`\`\`

**Diff (Git 差异):**
\`\`\`diff
- const oldVal = 1;
+ const newVal = 2;
  const unchanged = 3;
\`\`\`

**无语言标记:**
\`\`\`
Plain text block
No highlighting here
\`\`\`

**长行代码 (测试滚动):**
\`\`\`json
{"id":1,"name":"This is a very long json string to test if the code block handles horizontal scrolling correctly when the content exceeds the container width.","active":true}
\`\`\`

---

## 表格

### 标准表格
| 姓名 | 年龄 | 职业 | 状态 |
|------|------|------|------|
| Alice | 24 | Engineer | Active |
| Bob | 30 | Designer | Inactive |

### 对齐方式
| 左对齐 | 居中对齐 | 右对齐 |
| :--- | :----: | ---: |
| Left | Center | Right |
| Long Text | Long Text | Long Text |

### 混合内容表格
| 样式 | 示例 | 备注 |
|------|------|------|
| 代码 | \`code\` | 行内代码 |
| 链接 | [Link](#) | 内部链接 |
| 粗体 | **Bold** | 加粗 |
| Emoji | 🎨 | 图标 |

---

## 引用与警告

### 标准引用
> 这是一段引用文本。
>
> 这是一个新的段落。
> - 引用中包含列表
> - 列表项 2

### 嵌套引用
> 第一层
>> 第二层
>>> 第三层

### GitHub 风格警告 (Alerts)
> [!NOTE]
> 这是一个提示块 (Note)。

> [!TIP]
> 这是一个建议块 (Tip)。通常用于提供帮助信息。

> [!IMPORTANT]
> 这是一个重要块 (Important)。

> [!WARNING]
> 这是一个警告块 (Warning)。请注意潜在风险。

> [!CAUTION]
> 这是一个危险块 (Caution)。操作可能会导致严重后果。

---

## 媒体与链接

### 链接
- [普通链接](https://example.com)
- [带标题的链接](https://example.com "这是标题")
- 自动链接: https://www.google.com
- 邮箱链接: test@example.com
- 引用式链接: [Google][1]

[1]: https://google.com

### 图片
![示例图片](https://via.placeholder.com/300x150 "占位图")

**带链接的图片:**
[![点击图片跳转](https://via.placeholder.com/150 "点击跳转")](https://example.com)

---

## 数学公式

**行内公式:**
质能方程 $E = mc^2$ 是物理学中最著名的公式之一。

**块级公式:**
$$
f(x) = \\int_{-\\infty}^\\infty \\hat f(\\xi)\\,e^{2\\pi i \\xi x} \\,d\\xi
$$

**矩阵:**
$$
\\begin{pmatrix}
1 & 2 \\\\
3 & 4
\\end{pmatrix}
$$

---

## 图表 (Mermaid)

如果渲染器支持 Mermaid，下面应该显示图表：

\`\`\`mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B
\`\`\`

\`\`\`mermaid
sequenceDiagram
    Alice->>John: Hello John, how are you?
    John-->>Alice: Great!
    Alice-)John: See you later!
\`\`\`

---

## 特殊元素

### HTML 标签 (如果允许)
<div style="color: red; border: 1px solid red; padding: 10px;">
  这是一个带样式的 HTML div 块。
</div>
<br/>
<details>
  <summary>点击展开详情 (Details/Summary)</summary>
  <p>这里是隐藏的内容。</p>
  <ul>
    <li>支持 HTML 内部的 Markdown? (取决于解析器)</li>
  </ul>
</details>

### 脚注
这是一个带脚注的句子[^1]。这是另一个[^longnote]。

[^1]: 这是一个简单的脚注。
[^longnote]: 这是一个多行脚注。
    它可以包含多个段落。

### 分割线
***
---
___

### Emoji
:smile: :rocket: :tada: :warning: :heart:

---

## 边缘情况

### 转义字符
\\*这不是斜体\\*
\\[这不是链接\\]
\\ \`这不是代码\\ \`

### 连续元素
**粗体**_斜体_**粗体**

### 列表中的代码块
1. 第一步
2. 第二步编写代码：
   \`\`\`js
   console.log('indented code block');
   \`\`\`
3. 第三步

### URL 边界测试
- (https://example.com) 在括号中
- [https://example.com] 在方括号中
- 句尾的链接 https://example.com.

---

## LLM 输出模拟 (混合嵌套列表)

1.  **叙事线索**：
    *   **起点（2015）**：一个被嘲笑的“傻子”在贴吧提出“PCB代替线缆”的设想。
    *   **激励（2019）**：Apple Mac Pro证明了技术可行性，点燃了挑战行业标准的想法。
    *   **挑战**：面对保守、惰性的DIY行业（ATX标准30年未变），缺乏技术、资金、经验。
    *   **战略（三步走）**：
        1.  **1.0 联名学习**：与厂商合作，了解产品开发、制造流程，积累经验。
        2.  **2.0 渐进渗透**：推出“背插1.0/2.0”产品。通过申请专利后免费授权、利用影响力“连横合纵”、甚至自掏腰包补贴的方式，撬动保守的厂商，初步建立生态。
        3.  **3.0 终极形态**：提出“背插3.0”完整概念，目标是实现主板、显卡、电源间的无线连接，并大幅简化机箱线缆。
    *   **高潮**：展示与七彩虹、鑫谷合作完成的、可以点亮的概念样机。
    *   **结局**：不确定。可能是“背插盛世”，也可能无疾而终。但强调“全力以赴过”的过程价值。

2.  **技术核心（背插3.0）**：
    *   **主板**：
        *   **供电整合**：将CPU、24pin、PCIe等所有供电整合到一个基于服务器CRPS标准的金手指接口，置于主板背面。
        *   **I/O整合**：将机箱前面板的USB、音频、开关等接口统一布局，实现“一插全接好”。
    *   **显卡**：
        *   **兼容方案**：金手指供电+传统侧插供电口二合一。通过可拆卸转接板切换，兼顾新标准、兼容性和二手残值。
`,
};
