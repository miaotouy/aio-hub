import { RenderPreset } from '../types';

export const comprehensivePreset: RenderPreset = {
  id: "comprehensive",
  name: "Markdown 渲染测试文档",
  description: "全面的 Markdown 语法测试文档，包含各种元素和嵌套结构",
  content: `# Markdown 渲染测试文档

## 目录
- [文本样式](#文本样式)
- [列表](#列表)
- [代码](#代码)
- [表格](#表格)
- [其他元素](#其他元素)

---

## 文本样式

这是一段**粗体文本**，这是*斜体文本*，这是***粗斜体文本***。

这是~~删除线文本~~，这是\`行内代码\`。

> 这是一段引用文本
>
> 可以多行显示
>> 还可以嵌套引用

---

## 列表

### 无序列表
- 第一项
- 第二项
  - 嵌套项 2.1
  - 嵌套项 2.2
    - 更深层嵌套
- 第三项

### 有序列表
1. 第一步
2. 第二步
3. 第三步
    1. 子步骤 3.1
    2. 子步骤 3.2

### 任务列表
- [x] 已完成任务
- [ ] 未完成任务
- [ ] 待办事项

---

## 代码

### 行内代码
使用 \`console.log()\` 输出信息。

### 代码块

\`\`\`javascript
// JavaScript 示例
function greet(name) {
  console.log(\`Hello, \${name}!\`);
  return true;
}

const user = {
  name: "Alice",
  age: 25
};
\`\`\`

\`\`\`python
# Python 示例
def calculate_sum(numbers):
    """计算数字列表的总和"""
    total = sum(numbers)
    return total

data = [1, 2, 3, 4, 5]
result = calculate_sum(data)
print(f"总和: {result}")
\`\`\`

\`\`\`bash
# Shell 命令
git clone https://github.com/user/repo.git
cd repo
npm install
npm start
\`\`\`

---

## 表格

| 姓名 | 年龄 | 职业 | 城市 |
|------|------|------|------|
| 张三 | 28 | 工程师 | 北京 |
| 李四 | 32 | 设计师 | 上海 |
| 王五 | 25 | 产品经理 | 深圳 |

### 对齐表格

| 左对齐 | 居中对齐 | 右对齐 |
|:-------|:-------:|-------:|
| 文本1 | 文本2 | 文本3 |
| A | B | C |
| 123 | 456 | 789 |

---

## 链接和图片

### 链接
- [普通链接](https://www.example.com)
- [带标题的链接](https://www.example.com "这是标题")
- <https://www.autolink.com>

### 图片
![替代文本](https://via.placeholder.com/150 "图片标题")

---

## 其他元素

### 分割线
上面的内容

---

下面的内容

***

另一种分割线

### 脚注
这是一个带脚注的文本[^1]。

[^1]: 这是脚注的内容

### 数学公式（如果支持）
行内公式：$E = mc^2$

块级公式：
$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

### 特殊字符
- 版权符号：&copy;
- 商标符号：&trade;
- 注册商标：&reg;
- 箭头：&larr; &rarr; &uarr; &darr;

### 折叠内容（部分平台支持）
<details>
<summary>点击展开更多内容</summary>

这是隐藏的内容，点击后才会显示。

可以包含：
- 列表
- **格式化文本**
- \`\`\`代码\`\`\`

</details>

### 高亮文本
这是==高亮文本==（部分平台支持）

### Emoji
:smile: :heart: :rocket: :tada: :sparkles:

---

## 混合嵌套示例

1. **第一级列表** - *重要提示*
    - 引用示例：
      > 这是嵌套在列表中的引用
      > 包含\`代码\`和**粗体**
    
    - 代码示例：
      \`\`\`json
      {
        "name": "test",
        "version": "1.0.0"
      }
      \`\`\`

2. **第二级列表** - ~~已废弃~~
    | 功能 | 状态 |
    |------|------|
    | 登录 | ✅ |
    | 注册 | ⏳ |

---

> **提示：** 这份文档包含了大部分常用的 Markdown 语法，可以用来测试渲染器的兼容性！`,
};
