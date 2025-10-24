/**
 * 富文本渲染测试预设内容
 */

export interface RenderPreset {
  id: string;
  name: string;
  content: string;
  description?: string;
}

export const presets: RenderPreset[] = [
  {
    id: "basic",
    name: "基础元素",
    description: "测试基本的 Markdown 元素",
    content: `# 标题测试

## 二级标题

### 三级标题

这是一个段落，包含**粗体文本**和*斜体文本*，还有\`行内代码\`。

这是另一个段落，包含[链接](https://example.com)。

---

> 这是一个引用块
> 可以有多行内容

- 无序列表项 1
- 无序列表项 2
  - 嵌套项 2.1
  - 嵌套项 2.2
- 无序列表项 3

1. 有序列表项 1
2. 有序列表项 2
3. 有序列表项 3`,
  },
  {
    id: "code",
    name: "代码块测试",
    description: "测试各种代码块",
    content: `# 代码块示例

## JavaScript 代码

\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));
\`\`\`

## Python 代码

\`\`\`python
def quick_sort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quick_sort(left) + middle + quick_sort(right)

print(quick_sort([3, 6, 8, 10, 1, 2, 1]))
\`\`\`

## TypeScript 代码

\`\`\`typescript
interface User {
  id: number;
  name: string;
  email: string;
}

class UserManager {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  findUser(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }
}
\`\`\``,
  },
  {
    id: "table",
    name: "表格测试",
    description: "测试 Markdown 表格",
    content: `# 表格示例

## 简单表格

| 姓名 | 年龄 | 城市 |
|------|------|------|
| 张三 | 25 | 北京 |
| 李四 | 30 | 上海 |
| 王五 | 28 | 广州 |

## 对齐表格

| 左对齐 | 居中对齐 | 右对齐 |
|:-------|:--------:|-------:|
| 内容1  | 内容2    | 内容3  |
| 长一点的内容 | 测试 | 123 |
| A | B | C |

## 复杂表格

| 功能 | 状态 | 优先级 | 备注 |
|------|------|--------|------|
| 用户登录 | ✅ 完成 | 高 | 已上线 |
| 数据导出 | 🚧 进行中 | 中 | 开发中 |
| 报表生成 | 📅 计划中 | 低 | 下个版本 |`,
  },
  {
    id: "mixed",
    name: "综合测试",
    description: "混合各种元素的复杂文档",
    content: `# 项目文档

## 概述

这是一个**功能丰富**的项目，包含多个模块。

## 核心功能

### 1. 用户管理

支持以下操作：

- 用户注册和登录
- 个人信息管理
- 权限控制

\`\`\`typescript
interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
}
\`\`\`

### 2. 数据处理

> **重要提示**：数据处理模块需要特别关注性能优化

处理流程：

1. 数据采集
2. 数据清洗
3. 数据分析
4. 结果展示

### 3. API 接口

| 接口 | 方法 | 描述 |
|------|------|------|
| /api/users | GET | 获取用户列表 |
| /api/users/:id | GET | 获取用户详情 |
| /api/users | POST | 创建用户 |
| /api/users/:id | PUT | 更新用户 |
| /api/users/:id | DELETE | 删除用户 |

## 代码示例

\`\`\`javascript
// API 调用示例
async function fetchUsers() {
  try {
    const response = await fetch('/api/users');
    const users = await response.json();
    return users;
  } catch (error) {
    console.error('获取用户失败:', error);
    throw error;
  }
}
\`\`\`

## 注意事项

- 确保所有 API 调用都有错误处理
- 敏感数据必须加密传输
- 定期备份数据库

---

更多信息请访问 [官方文档](https://example.com/docs)`,
  },
  {
    id: "long",
    name: "长文本测试",
    description: "测试流式渲染性能",
    content: `# 长文本流式渲染测试

## 第一部分：介绍

这是一个用于测试流式渲染性能的长文本文档。在实际的 LLM 对话中，AI 会逐字逐句地生成内容，我们需要确保渲染引擎能够流畅地处理这种情况。

## 第二部分：技术细节

### 2.1 流式处理架构

流式处理的核心在于将连续的文本流转换为结构化的 AST（抽象语法树）。这个过程需要处理以下几个关键问题：

1. **增量解析**：每次只处理新增的文本片段
2. **状态维护**：保持解析器的内部状态
3. **错误恢复**：处理不完整的标记
4. **性能优化**：避免重复解析已处理的内容

\`\`\`typescript
class StreamProcessor {
  private buffer: string = '';
  private state: ParserState;

  process(chunk: string): void {
    this.buffer += chunk;
    // 解析并生成 patch 指令
    const patches = this.parse(this.buffer);
    this.emitPatches(patches);
  }

  private parse(content: string): Patch[] {
    // 实现增量解析逻辑
    // ...
  }
}
\`\`\`

### 2.2 性能优化策略

为了确保流式渲染的性能，我们采用了多种优化策略：

| 策略 | 描述 | 效果 |
|------|------|------|
| 批量更新 | 将多个小的 DOM 更新合并 | 减少重排次数 |
| 虚拟滚动 | 只渲染可见区域的内容 | 降低内存占用 |
| 增量解析 | 只解析新增的文本 | 提高解析速度 |
| 懒加载 | 延迟加载非关键内容 | 加快初始渲染 |

### 2.3 代码实现

以下是核心的渲染逻辑：

\`\`\`javascript
function renderStream(source) {
  const processor = new StreamProcessor({
    onPatch: (patches) => {
      // 应用 patch 到 AST
      patches.forEach(patch => {
        applyPatch(ast, patch);
      });
      
      // 触发重新渲染
      updateView();
    }
  });

  // 订阅流数据
  source.subscribe((chunk) => {
    processor.process(chunk);
  });
}
\`\`\`

## 第三部分：实践经验

### 3.1 常见问题

在实际使用中，我们遇到了一些常见问题：

> **问题 1**：代码块边界识别
> 
> 当代码块的闭合标记(\`\`\`)还未到达时，需要正确处理未闭合的状态。

解决方案：

1. 维护一个状态机跟踪当前的上下文
2. 使用临时节点标记未完成的块
3. 在闭合标记到达时替换为最终节点

> **问题 2**：表格渲染性能
> 
> 大型表格的流式渲染可能导致性能问题。

解决方案：

- 使用虚拟滚动技术
- 分批渲染表格行
- 优化 CSS 选择器

### 3.2 最佳实践

1. **保持简单**：不要过度优化，先让功能正确工作
2. **测量性能**：使用性能分析工具找出瓶颈
3. **渐进增强**：从基础功能开始，逐步添加优化
4. **用户体验**：优先考虑用户感知的性能

## 第四部分：未来展望

### 4.1 计划中的改进

- [ ] 支持更多 Markdown 扩展语法
- [ ] 添加语法高亮主题切换
- [ ] 实现协作编辑功能
- [ ] 优化移动端体验

### 4.2 技术路线图

\`\`\`mermaid
graph LR
    A[当前版本] --> B[性能优化]
    B --> C[功能增强]
    C --> D[生态建设]
    D --> E[企业级应用]
\`\`\`

## 结论

流式渲染是一个复杂但重要的功能，它能够为用户提供更好的交互体验。通过合理的架构设计和性能优化，我们可以构建出高效、流畅的渲染引擎。

---

**相关资源**：

- [Markdown 规范](https://commonmark.org/)
- [Vue 性能优化指南](https://vuejs.org/guide/best-practices/performance.html)
- [Web 性能优化](https://web.dev/performance/)

*最后更新：2025年1月*`,
  },
  {
    id: "emoji",
    name: "Emoji 和特殊字符",
    description: "测试 Emoji 和特殊字符渲染",
    content: `# Emoji 渲染测试 🎨

## 常用 Emoji

### 表情符号
😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘

### 手势
👍 👎 👌 ✌️ 🤞 🤘 🤙 👋 🤚 🖐️ ✋ 🖖 👏

### 符号
✅ ❌ ⚠️ 🚀 🎯 💡 🔥 ⭐ 🌟 💯 🎉 🎊

## 状态指示

| 状态 | 图标 | 说明 |
|------|------|------|
| 成功 | ✅ | 操作成功完成 |
| 失败 | ❌ | 操作失败 |
| 警告 | ⚠️ | 需要注意 |
| 进行中 | 🔄 | 正在处理 |
| 待处理 | ⏳ | 等待中 |

## 代码中的 Emoji

\`\`\`javascript
// 使用 Emoji 让代码更生动
const status = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️'
};

console.log(\`操作结果: \${status.success}\`);
\`\`\`

## 特殊字符

### 数学符号
∑ ∏ √ ∞ ≈ ≠ ≤ ≥ ± × ÷

### 箭头
← → ↑ ↓ ↔ ↕ ⇐ ⇒ ⇑ ⇓ ⇔

### 其他符号
© ® ™ § ¶ † ‡ • ◦ ‣ ⁃`,
  },
  {
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
  },
  {
    id: "xml",
    name: "XML/HTML 标签",
    description: "测试 XML/HTML 标签的渲染",
    content: `# XML/HTML 标签渲染测试

## 基本 HTML 标签

这是一个段落，包含 <b>粗体标签</b> 和 <i>斜体标签</i>。

还有 <u>下划线</u> 和 <s>删除线</s> 标签。

<div>这是一个 div 块级元素</div>

<span>这是一个 span 行内元素</span>

## 文本格式化标签

<p>这是段落标签 <strong>strong 强调</strong> 和 <em>em 强调</em></p>

<p>还有 <mark>高亮文本</mark>、<small>小号文本</small>、<del>删除文本</del>、<ins>插入文本</ins></p>

<p>上标：H<sub>2</sub>O，下标：X<sup>2</sup> + Y<sup>2</sup></p>

<p><abbr title="HyperText Markup Language">HTML</abbr> 是网页标记语言</p>

<p><kbd>Ctrl</kbd> + <kbd>C</kbd> 复制，<kbd>Ctrl</kbd> + <kbd>V</kbd> 粘贴</p>

<p>引用标签：<q>这是一句引用</q></p>

<blockquote cite="https://example.com">
  这是一个长引用块，用于引用大段文字内容。
  <footer>—— <cite>某位名人</cite></footer>
</blockquote>

## 语义化标签

<article>
  <header>
    <h2>文章标题</h2>
    <p><time datetime="2025-01-15">2025年1月15日</time></p>
  </header>
  <section>
    <p>这是文章的第一段内容。</p>
  </section>
  <footer>
    <p>作者：张三</p>
  </footer>
</article>

<aside style="border-left: 3px solid #ccc; padding-left: 10px;">
  <p>这是侧边栏内容或补充说明</p>
</aside>

<figure>
  <img src="/agent-icons/sakata-gintoki.jpg" alt="示例图片" width="200" />
  <figcaption>图1：这是图片说明</figcaption>
</figure>

## 表单元素

<form>
  <fieldset>
    <legend>用户信息</legend>
    <p>
      <label for="username">用户名：</label>
      <input type="text" id="username" name="username" placeholder="请输入用户名" />
    </p>
    <p>
      <label for="email">邮箱：</label>
      <input type="email" id="email" name="email" placeholder="example@email.com" />
    </p>
    <p>
      <label for="password">密码：</label>
      <input type="password" id="password" name="password" />
    </p>
    <p>
      <label for="birthday">生日：</label>
      <input type="date" id="birthday" name="birthday" />
    </p>
    <p>
      <label for="age">年龄：</label>
      <input type="number" id="age" name="age" min="1" max="120" />
    </p>
    <p>
      <label for="website">网站：</label>
      <input type="url" id="website" name="website" placeholder="https://example.com" />
    </p>
  </fieldset>

  <fieldset>
    <legend>选项</legend>
    <p>
      <label><input type="radio" name="gender" value="male" /> 男</label>
      <label><input type="radio" name="gender" value="female" /> 女</label>
    </p>
    <p>
      <label><input type="checkbox" name="terms" /> 同意服务条款</label>
    </p>
    <p>
      <label for="country">国家：</label>
      <select id="country" name="country">
        <option value="">请选择</option>
        <option value="cn">中国</option>
        <option value="us">美国</option>
        <option value="jp">日本</option>
      </select>
    </p>
    <p>
      <label for="bio">个人简介：</label><br />
      <textarea id="bio" name="bio" rows="4" cols="50">请输入个人简介...</textarea>
    </p>
  </fieldset>

  <p>
    <button type="submit">提交</button>
    <button type="reset">重置</button>
    <button type="button">普通按钮</button>
  </p>
</form>

## 列表和导航

<nav>
  <ul>
    <li><a href="#home">首页</a></li>
    <li><a href="#about">关于</a></li>
    <li><a href="#contact">联系</a></li>
  </ul>
</nav>

<h3>定义列表</h3>
<dl>
  <dt>HTML</dt>
  <dd>超文本标记语言</dd>
  <dt>CSS</dt>
  <dd>层叠样式表</dd>
  <dt>JavaScript</dt>
  <dd>网页编程语言</dd>
</dl>

## 内联样式

<p style="color: red; font-weight: bold;">红色粗体文本</p>

<p style="background-color: yellow; padding: 10px;">黄色背景段落</p>

<p style="font-size: 20px; font-family: Arial, sans-serif;">大号字体</p>

<div style="border: 2px solid blue; padding: 15px; margin: 10px 0; border-radius: 5px;">
  <p style="margin: 0;">带边框和圆角的容器</p>
</div>

<p style="text-align: center; font-style: italic;">居中斜体文本</p>

<p>
  <span style="color: #ff6b6b;">红色</span> |
  <span style="color: #4ecdc4;">青色</span> |
  <span style="color: #45b7d1;">蓝色</span> |
  <span style="color: #f9ca24;">黄色</span> |
  <span style="color: #6ab04c;">绿色</span>
</p>

## 多媒体和嵌入

<audio controls>
  <source src="audio.mp3" type="audio/mpeg">
  您的浏览器不支持音频标签。
</audio>

<video width="400" height="300" controls>
  <source src="video.mp4" type="video/mp4">
  您的浏览器不支持视频标签。
</video>

<iframe
  width="560"
  height="315"
  src="https://www.youtube.com/embed/dQw4w9WgXcQ"
  title="YouTube video player"
  frameborder="0"
  allowfullscreen>
</iframe>

## 进度和计量

<p>下载进度：<progress value="70" max="100">70%</progress></p>

<p>磁盘使用：<meter value="0.6" min="0" max="1">60%</meter></p>

<p>评分：<meter value="4" min="0" max="5" low="2" high="4" optimum="5">4/5</meter></p>

## 详情和摘要

<details>
  <summary>点击查看详情</summary>
  <p>这是隐藏的详细内容，点击摘要后才会显示。</p>
  <ul>
    <li>列表项 1</li>
    <li>列表项 2</li>
    <li>列表项 3</li>
  </ul>
</details>

<details open>
  <summary>默认展开的详情</summary>
  <p>这个详情块默认是展开状态。</p>
</details>

## 带属性的标签

<a href="https://example.com" title="示例链接" target="_blank">外部链接（新窗口）</a>

<img src="/agent-icons/sakata-gintoki.jpg" alt="图片描述" width="300" height="200" loading="lazy" />

<button onclick="alert('clicked')" class="btn" disabled>禁用按钮</button>

## 数据属性

<div data-user-id="12345" data-role="admin" data-status="active">
  带有自定义数据属性的元素
</div>

## 嵌套标签

<div class="container" style="border: 1px solid #ddd; padding: 20px;">
  <h3>容器标题</h3>
  <p>这是段落文本</p>
  <ul>
    <li>列表项 1</li>
    <li>列表项 2
      <ul>
        <li>嵌套列表项 2.1</li>
        <li>嵌套列表项 2.2</li>
      </ul>
    </li>
  </ul>
  <p>更多内容...</p>
</div>

## 自闭合标签

<br />
<hr />
<hr style="border: 2px dashed #ccc;" />
<input type="text" placeholder="输入文本" />
<img src="/agent-icons/sakata-gintoki.jpg" alt="自闭合图片标签" width="100" />

## XML 风格标签

<user>
  <name>张三</name>
  <age>25</age>
  <email>zhangsan@example.com</email>
</user>

<config>
  <setting name="timeout" value="30" />
  <setting name="retry" value="3" />
</config>

## 代码块中的标签

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<bookstore>
  <book category="cooking">
    <title lang="en">Everyday Italian</title>
    <author>Giada De Laurentiis</author>
    <year>2005</year>
    <price>30.00</price>
  </book>
  <book category="children">
    <title lang="en">Harry Potter</title>
    <author>J K. Rowling</author>
    <year>2005</year>
    <price>29.99</price>
  </book>
</bookstore>
\`\`\`

\`\`\`html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>示例页面</title>
  <style>
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    .button {
      padding: 10px 20px;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .button:hover {
      background-color: #0056b3;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>欢迎</h1>
    <p>这是示例内容</p>
    <button class="button">点击</button>
  </div>
  <script>
    console.log('Hello, World!');
    document.querySelector('.button').addEventListener('click', () => {
      alert('按钮被点击了！');
    });
  </script>
</body>
</html>
\`\`\`

## 混合内容

这是一段包含 **Markdown 粗体** 和 <b>HTML 粗体</b> 的文本。

> 引用块中也可以包含 <em>HTML 标签</em> 和 <strong>强调文本</strong>

- 列表项中的 <code>code 标签</code>
- 另一个 <mark>高亮项目</mark>
- 带 <del>删除线</del> 和 <ins>下划线</ins> 的项目

## 表格中的 HTML

| 标签类型 | 示例 | 说明 |
|---------|------|------|
| <b>粗体</b> | <i>斜体</i> | <code>代码</code> |
| <a href="#">链接</a> | <mark>高亮</mark> | <span style="color: red">红色</span> |
| <small>小字</small> | <kbd>Ctrl</kbd> | <del>删除</del> |

## 注释标签

<!-- 这是 HTML 注释，不会显示在页面上 -->

<![CDATA[这是 CDATA 内容]]>

## 特殊字符实体

&lt;div&gt;这是转义的标签&lt;/div&gt;

&amp; &quot; &apos; &nbsp; &copy; &reg; &trade;

特殊符号：&hearts; &spades; &clubs; &diams;

箭头：&larr; &rarr; &uarr; &darr; &harr;

数学：&times; &divide; &plusmn; &ne; &le; &ge;

## 响应式和可访问性

<img
  src="/agent-icons/sakata-gintoki.jpg"
  alt="银时图片"
  width="300"
  height="200"
  loading="lazy"
  decoding="async"
/>

<a href="https://example.com" aria-label="访问示例网站" title="点击访问">
  链接文字
</a>

<button aria-pressed="false" aria-label="切换菜单">
  菜单
</button>`,
  },
];
