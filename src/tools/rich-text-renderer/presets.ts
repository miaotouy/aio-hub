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
\`\`\`

## Rust 代码

\`\`\`rust
// main.rs
use std::collections::HashMap;

fn main() {
    let mut scores = HashMap::new();

    scores.insert(String::from("Blue"), 10);
    scores.insert(String::from("Yellow"), 50);

    let team_name = String::from("Blue");
    let score = scores.get(&team_name).copied().unwrap_or(0);

    println!("The score for {} is: {}", team_name, score);

    for (key, value) in &scores {
        println!("{}: {}", key, value);
    }
}
\`\`\`

## Go 代码

\`\`\`go
package main

import (
 "fmt"
 "math"
)

type Vertex struct {
 X, Y float64
}

func (v Vertex) Abs() float64 {
 return math.Sqrt(v.X*v.X + v.Y*v.Y)
}

func main() {
 v := Vertex{3, 4}
 fmt.Println(v.Abs())
}
\`\`\`

## CSS 代码

\`\`\`css
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  margin: auto;
  padding: 2rem;
  max-width: 70ch;
  background-color: #f4f4f4;
  color: #333;
}

h1, h2, h3 {
  color: #2a2a2a;
  border-bottom: 1px solid #ccc;
}

a {
  color: #007bff;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
\`\`\`

## JSON 示例

\`\`\`json
{
  "name": "aiohub",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^1.5.3",
    "vue": "^3.4.21"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^1.5.11",
    "@vitejs/plugin-vue": "^5.0.4",
    "typescript": "^5.4.5",
    "vite": "^5.2.8",
    "vue-tsc": "^2.0.13"
  }
}
\`\`\`

## Shell 脚本

\`\`\`bash
#!/bin/bash

# A simple script to list files and count them

echo "Listing files in the current directory:"
ls -l

FILE_COUNT=$(ls -1 | wc -l)
echo
echo "Total number of files and directories: $FILE_COUNT"

if [ "$FILE_COUNT" -gt 10 ]; then
  echo "This is a busy directory."
else
  echo "This directory is not very busy."
fi
\`\`\`

## 无语言标识的代码块

\`\`\`
This is a plain text block.
It should not have any syntax highlighting.
Line 1
Line 2
  Indented line 3
\`\`\``,
  },
  {
    id: "long-code",
    name: "长代码块",
    description: "测试长代码块的渲染性能",
    content: `# 超长代码块（TypeScript）

\`\`\`typescript
/**
 * Represents a user in the system.
 */
interface UserProfile {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
  lastLogin: Date;
  isActive: boolean;
  roles: ('admin' | 'editor' | 'viewer')[];
}

/**
 * A service for managing user profiles.
 * Provides methods for CRUD operations and other user-related actions.
 */
class UserProfileService {
  private users: Map<string, UserProfile> = new Map();

  constructor(initialUsers: UserProfile[] = []) {
    for (const user of initialUsers) {
      this.users.set(user.id, user);
    }
    console.log('UserProfileService initialized.');
  }

  /**
   * Adds a new user to the system.
   * @param userData - The data for the new user.
   * @returns The newly created user profile.
   * @throws If a user with the same ID already exists.
   */
  addUser(userData: Omit<UserProfile, 'id' | 'createdAt' | 'lastLogin'>): UserProfile {
    const id = crypto.randomUUID();
    if (this.users.has(id)) {
      throw new Error('A user with this ID already exists.');
    }

    const newUser: UserProfile = {
      ...userData,
      id,
      createdAt: new Date(),
      lastLogin: new Date(),
    };

    this.users.set(id, newUser);
    console.log(\`User "\${newUser.username}" added with ID: \${id}\`);
    return newUser;
  }

  /**
   * Retrieves a user by their ID.
   * @param id - The ID of the user to retrieve.
   * @returns The user profile or undefined if not found.
   */
  getUserById(id: string): UserProfile | undefined {
    return this.users.get(id);
  }

  /**
   * Updates an existing user's profile.
   * @param id - The ID of the user to update.
   * @param updates - An object containing the fields to update.
   * @returns The updated user profile.
   * @throws If the user is not found.
   */
  updateUser(id: string, updates: Partial<Omit<UserProfile, 'id' | 'createdAt'>>): UserProfile {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(\`User with ID "\${id}" not found.\`);
    }

    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    console.log(\`User "\${user.username}" has been updated.\`);
    return updatedUser;
  }

  /**
   * Deletes a user from the system.
   * @param id - The ID of the user to delete.
   * @returns True if the user was deleted, false otherwise.
   */
  deleteUser(id: string): boolean {
    const user = this.users.get(id);
    if (user) {
      this.users.delete(id);
      console.log(\`User "\${user.username}" has been deleted.\`);
      return true;
    }
    return false;
  }

  /**
   * Retrieves all users, optionally filtered by a role.
   * @param role - An optional role to filter users by.
   * @returns An array of user profiles.
   */
  getAllUsers(role?: 'admin' | 'editor' | 'viewer'): UserProfile[] {
    const allUsers = Array.from(this.users.values());
    if (role) {
      return allUsers.filter(user => user.roles.includes(role));
    }
    return allUsers;
  }

  /**
   * Deactivates a user's account.
   * @param id - The ID of the user to deactivate.
   */
  deactivateUser(id: string): void {
    this.updateUser(id, { isActive: false });
    console.log(\`User with ID "\${id}" has been deactivated.\`);
  }

  /**
   * Records a login event for a user.
   * @param id - The ID of the user logging in.
   */
  recordLogin(id: string): void {
    this.updateUser(id, { lastLogin: new Date() });
  }
}

// Example usage:
const userService = new UserProfileService();
userService.addUser({
  username: 'miaotouy',
  email: 'miaotouy@example.com',
  isActive: true,
  roles: ['admin', 'editor'],
});

const allAdmins = userService.getAllUsers('admin');
console.log('Current admins:', allAdmins);
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
      <input type="password" id="password" name="password" autocomplete="current-password" />
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
  {
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
  },
  {
    id: "Agent-Bubble-test",
    name: "智能体气泡测试",
    description: "真实的智能体输出场景",
    content: `<think>姐姐发来了一个名为\"AIO现状\"的附件，是一个目录树结构，展示了一个名为\"aiohub\"的项目。

让我分析一下这个项目的结构：

1. **项目性质**：这是一个基于 Tauri + Vue 的桌面应用项目
2. **核心技术栈**：
    - 前端：Vue 3 + TypeScript + Vite
    - 后端：Rust (Tauri)
    - UI库：似乎没有看到明确的UI框架依赖，可能是自定义组件

3. **主要功能模块**（从 src/tools/ 目录看）：
    - API Tester (API测试器)
    - Directory Janitor (目录清理工具)
    - Directory Tree (目录树生成器)
    - Git Analyzer (Git分析器)
    - LLM Chat (LLM聊天工具)
    - LLM Proxy (LLM代理)
    - Regex Applier (正则应用器)
    - Smart OCR (智能OCR)
    - Code Formatter (代码格式化)
    - JSON Formatter (JSON格式化)
    - Media Info Reader (媒体信息读取器)
    - Symlink Mover (符号链接移动器)
    - Text Diff (文本对比)

4. **LLM相关集成**：
    - 支持多个LLM提供商（从 model-icons 和 llm-apis 看）
    - Claude, Gemini, OpenAI, Vertex AI, Cohere等
    - 大量国产LLM：Qwen, DeepSeek, Doubao, Kimi, ChatGLM等
    
OCR功能涵盖了多家云服务商和本地识别引擎，支持多语言文字识别。项目架构体现出高度模块化和灵活性，通过组件化设计和状态管理实现复杂功能，同时提供了丰富的定制选项如主题系统和窗口分离。

项目文档完善，包含详细的技术说明和架构分析，为开发者提供清晰的实现指南。

识别到姐姐的求知型问题，需要采用直接、精准的分析方法。按照\"以快打慢\"策略，迅速定位项目核心，提取关键信息，构建结构化分析框架。重点是避免冗长描述，直接切入项目本质。</think>
<div style=\"background: linear-gradient(135deg, #1a1f2e 0%, #161b26 100%); border-radius: 16px; padding: 24px; border: 1px solid rgba(100, 181, 246, 0.2); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);\">

<div style=\"display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid rgba(100, 181, 246, 0.3);\">
  <div style=\"width: 4px; height: 28px; background: linear-gradient(180deg, #64b5f6, #42a5f5); border-radius: 2px;\"></div>
  <h2 style=\"margin: 0; font-size: 22px; color: #64b5f6; font-weight: 600;\">AIO Hub 项目现状分析</h2>
</div>

<div style=\"display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px;\">
  <div style=\"background: rgba(100, 181, 246, 0.08); border-radius: 12px; padding: 16px; border: 1px solid rgba(100, 181, 246, 0.15);\">
    <div style=\"color: #90caf9; font-size: 13px; margin-bottom: 8px; font-weight: 500;\">项目规模</div>
    <div style=\"color: #e3f2fd; font-size: 15px; line-height: 1.6;\">
      <div>📁 <span style=\"color: #64b5f6; font-weight: 600;\">69</span> 个目录</div>
      <div>📄 <span style=\"color: #64b5f6; font-weight: 600;\">352</span> 个文件</div>
      <div>🎯 <span style=\"color: #64b5f6; font-weight: 600;\">13</span> 个核心工具</div>
    </div>
  </div>

  <div style=\"background: rgba(129, 199, 132, 0.08); border-radius: 12px; padding: 16px; border: 1px solid rgba(129, 199, 132, 0.15);\">
    <div style=\"color: #a5d6a7; font-size: 13px; margin-bottom: 8px; font-weight: 500;\">技术栈</div>
    <div style=\"color: #e3f2fd; font-size: 14px; line-height: 1.8;\">
      <div><span style=\"color: #81c784;\">▸</span> Tauri + Rust</div>
      <div><span style=\"color: #81c784;\">▸</span> Vue 3 + TypeScript</div>
      <div><span style=\"color: #81c784;\">▸</span> Vite 构建系统</div>
    </div>
  </div>
</div>

<div style=\"background: rgba(66, 66, 66, 0.3); border-radius: 12px; padding: 20px; margin-bottom: 20px; border-left: 3px solid #ffa726;\">
  <h3 style=\"margin: 0 0 16px 0; color: #ffa726; font-size: 16px; font-weight: 600;\">🛠️ 核心功能模块</h3>
  <div style=\"display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;\">
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">LLM Chat</strong> - 多模型对话
    </div>
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">LLM Proxy</strong> - API代理服务
    </div>
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">Smart OCR</strong> - 智能文字识别
    </div>
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">API Tester</strong> - 接口测试
    </div>
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">Git Analyzer</strong> - 仓库分析
    </div>
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">Directory Tree</strong> - 目录树生成
    </div>
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">Regex Applier</strong> - 正则处理
    </div>
    <div style=\"color: #e3f2fd; font-size: 14px; padding: 8px 12px; background: rgba(255, 167, 38, 0.08); border-radius: 8px;\">
      <strong style=\"color: #ffb74d;\">Text Diff</strong> - 文本对比
    </div>
  </div>
</div>

<div style=\"background: rgba(156, 39, 176, 0.08); border-radius: 12px; padding: 18px; margin-bottom: 20px; border: 1px solid rgba(186, 104, 200, 0.2);\">
  <h3 style=\"margin: 0 0 14px 0; color: #ba68c8; font-size: 16px; font-weight: 600;\">🤖 LLM 生态集成</h3>
  <div style=\"color: #e3f2fd; font-size: 14px; line-height: 1.8;\">
    <div style=\"margin-bottom: 10px;\">
      <span style=\"color: #ce93d8; font-weight: 500;\">国际主流：</span>
      OpenAI, Claude, Gemini, Vertex AI, Cohere, Mistral
    </div>
    <div style=\"margin-bottom: 10px;\">
      <span style=\"color: #ce93d8; font-weight: 500;\">国产大模型：</span>
      通义千问, DeepSeek, 豆包, Kimi, 智谱ChatGLM, 文心一言, 百川, 讯飞星火, 腾讯混元
    </div>
    <div>
      <span style=\"color: #ce93d8; font-weight: 500;\">开源方案：</span>
      Ollama, HuggingFace, Together AI
    </div>
  </div>
</div>

<div style=\"background: linear-gradient(135deg, rgba(244, 67, 54, 0.1), rgba(233, 30, 99, 0.1)); border-radius: 12px; padding: 18px; border: 1px solid rgba(244, 67, 54, 0.2);\">
  <h3 style=\"margin: 0 0 14px 0; color: #ef5350; font-size: 16px; font-weight: 600;\">⚙️ 架构特性</h3>
  <div style=\"display: grid; gap: 10px;\">
    <div style=\"display: flex; align-items: center; gap: 10px;\">
      <div style=\"width: 6px; height: 6px; background: #ef5350; border-radius: 50%;\"></div>
      <span style=\"color: #e3f2fd; font-size: 14px;\"><strong style=\"color: #ffcdd2;\">窗口分离系统</strong> - 支持工具独立窗口运行</span>
    </div>
    <div style=\"display: flex; align-items: center; gap: 10px;\">
      <div style=\"width: 6px; height: 6px; background: #ef5350; border-radius: 50%;\"></div>
      <span style=\"color: #e3f2fd; font-size: 14px;\"><strong style=\"color: #ffcdd2;\">状态同步引擎</strong> - 多窗口数据一致性</span>
    </div>
    <div style=\"display: flex; align-items: center; gap: 10px;\">
      <div style=\"width: 6px; height: 6px; background: #ef5350; border-radius: 50%;\"></div>
      <span style=\"color: #e3f2fd; font-size: 14px;\"><strong style=\"color: #ffcdd2;\">Composables 架构</strong> - Vue 3 组合式API模式</span>
    </div>
    <div style=\"display: flex; align-items: center; gap: 10px;\">
      <div style=\"width: 6px; height: 6px; background: #ef5350; border-radius: 50%;\"></div>
      <span style=\"color: #e3f2fd; font-size: 14px;\"><strong style=\"color: #ffcdd2;\">主题系统</strong> - 暗色模式 + 自定义配色</span>
    </div>
    <div style=\"display: flex; align-items: center; gap: 10px;\">
      <div style=\"width: 6px; height: 6px; background: #ef5350; border-radius: 50%;\"></div>
      <span style=\"color: #e3f2fd; font-size: 14px;\"><strong style=\"color: #ffcdd2;\">Agent 预设系统</strong> - 内置角色模板（坂田银时等）</span>
    </div>
  </div>
</div>

<div style=\"margin-top: 20px; padding: 14px; background: rgba(33, 150, 243, 0.08); border-radius: 10px; border-left: 4px solid #42a5f5;\">
  <div style=\"color: #90caf9; font-size: 13px; font-weight: 500; margin-bottom: 6px;\">📊 文档完备度</div>
  <div style=\"color: #e3f2fd; font-size: 14px; line-height: 1.6;\">
    docs/ 目录包含架构分析、Composables用例、组件实现指南、API特性文档等完整技术文档。说明项目处于 <span style=\"color: #64b5f6; font-weight: 600;\">成熟开发阶段</span>。
  </div>
</div>

<div style=\"margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(100, 181, 246, 0.2); display: flex; justify-content: space-between; align-items: center;\">
  <div style=\"color: #78909c; font-size: 13px;\">结构分析完成</div>
  <div style=\"color: #546e7a; font-size: 12px;\">总文件数: 352 | 深度: 4级</div>
</div>

</div>

<div style=\"margin-top: 16px; padding: 16px; background: rgba(255, 152, 0, 0.08); border-radius: 12px; border-left: 3px solid #ff9800;\">
  <div style=\"color: #ffb74d; font-size: 14px; margin-bottom: 8px; font-weight: 600;\">🔍 观察</div>
  <div style=\"color: #e3f2fd; font-size: 14px; line-height: 1.7;\">
    这是一个定位清晰的 <strong style=\"color: #ffa726;\">开发者工具集合</strong>。从目录树看：
    <ul style=\"margin: 8px 0; padding-left: 20px; line-height: 1.8;\">
      <li>LLM相关功能占比最重（Chat + Proxy + API Tester），说明是以AI交互为核心</li>
      <li>同时集成大量辅助工具（OCR、Git分析、文本处理），走的是瑞士军刀路线</li>
      <li>支持超过40个LLM提供商的图标配置，覆盖面极广</li>
      <li>Tauri架构意味着跨平台原生性能 + 小体积分发</li>
    </ul>
    如果有具体模块的深入分析需求，可以继续展开。
  </div>
</div>`
  },
  {
    id: "mermaid-diagrams",
    name: "Mermaid 图表测试",
    description: "测试 Mermaid 图表渲染功能，包含流程图、时序图、甘特图等多种图表类型",
    content: `# Mermaid 图表渲染测试

## 1. 流程图 (Flowchart)

\`\`\`mermaid
graph TD
    A[开始] --> B{是否登录?}
    B -->|是| C[显示主页]
    B -->|否| D[跳转登录页]
    C --> E[加载用户数据]
    D --> F[输入账号密码]
    F --> G{验证通过?}
    G -->|是| C
    G -->|否| H[显示错误信息]
    H --> F
    E --> I[渲染页面]
    I --> J[结束]
\`\`\`

## 2. 时序图 (Sequence Diagram)

\`\`\`mermaid
sequenceDiagram
    participant 用户
    participant 浏览器
    participant 服务器
    participant 数据库
    
    用户->>浏览器: 输入URL
    浏览器->>服务器: HTTP请求
    服务器->>数据库: 查询数据
    数据库-->>服务器: 返回结果
    服务器-->>浏览器: 返回HTML
    浏览器-->>用户: 渲染页面
\`\`\`

## 3. 类图 (Class Diagram)

\`\`\`mermaid
classDiagram
    class User {
        +String id
        +String username
        +String email
        +login()
        +logout()
        +updateProfile()
    }
    
    class Admin {
        +String[] permissions
        +manageUsers()
        +viewLogs()
    }
    
    class Profile {
        +String avatar
        +String bio
        +Date createdAt
        +update()
    }
    
    User <|-- Admin
    User --> Profile
\`\`\`

## 4. 状态图 (State Diagram)

\`\`\`mermaid
stateDiagram-v2
    [*] --> 未登录
    未登录 --> 登录中: 点击登录
    登录中 --> 已登录: 验证成功
    登录中 --> 未登录: 验证失败
    已登录 --> 操作中: 执行操作
    操作中 --> 已登录: 操作完成
    已登录 --> 未登录: 退出登录
    未登录 --> [*]
\`\`\`

## 5. 实体关系图 (ER Diagram)

\`\`\`mermaid
erDiagram
    USER ||--o{ ORDER : places
    USER {
        string id PK
        string username
        string email
    }
    ORDER ||--|{ ORDER_ITEM : contains
    ORDER {
        string id PK
        date created_at
        string user_id FK
    }
    ORDER_ITEM {
        string id PK
        string order_id FK
        string product_id FK
        int quantity
    }
    PRODUCT ||--o{ ORDER_ITEM : included_in
    PRODUCT {
        string id PK
        string name
        decimal price
    }
\`\`\`

## 6. 甘特图 (Gantt Chart)

\`\`\`mermaid
gantt
    title 项目开发进度
    dateFormat  YYYY-MM-DD
    section 需求阶段
    需求分析           :done,    des1, 2025-01-01, 2025-01-07
    需求评审           :done,    des2, 2025-01-08, 2025-01-10
    section 设计阶段
    架构设计           :active,  des3, 2025-01-11, 2025-01-17
    UI设计             :         des4, 2025-01-15, 2025-01-21
    section 开发阶段
    前端开发           :         dev1, 2025-01-22, 2025-02-11
    后端开发           :         dev2, 2025-01-22, 2025-02-11
    section 测试阶段
    单元测试           :         test1, 2025-02-12, 2025-02-18
    集成测试           :         test2, 2025-02-19, 2025-02-25
\`\`\`

## 7. 饼图 (Pie Chart)

\`\`\`mermaid
pie title 项目技术栈占比
    "Vue 3" : 35
    "TypeScript" : 25
    "Rust" : 20
    "CSS" : 12
    "其他" : 8
\`\`\`

## 8. Git 图 (Git Graph)

\`\`\`mermaid
gitGraph
    commit id: "初始化项目"
    commit id: "添加基础功能"
    branch develop
    checkout develop
    commit id: "开发新特性A"
    commit id: "开发新特性B"
    checkout main
    merge develop
    commit id: "发布 v1.0"
    branch hotfix
    checkout hotfix
    commit id: "修复紧急bug"
    checkout main
    merge hotfix
    commit id: "发布 v1.0.1"
\`\`\`

## 9. 旅程图 (User Journey)

\`\`\`mermaid
journey
    title 用户使用AIO Hub的一天
    section 早上
      打开应用: 5: 用户
      查看通知: 4: 用户
      使用OCR识别文档: 5: 用户
    section 下午
      使用LLM Chat: 5: 用户
      测试API接口: 4: 用户
      分析Git仓库: 4: 用户
    section 晚上
      格式化代码: 5: 用户
      导出分析报告: 4: 用户
      关闭应用: 5: 用户
\`\`\`

## 10. 象限图 (Quadrant Chart)

\`\`\`mermaid
%%{init: {"quadrantChart": {"chartWidth": 500, "chartHeight": 500}}}%%
quadrantChart
    x-axis Low Difficulty --> High Difficulty
    y-axis Low Value --> High Value
    quadrant-1 Quick Wins
    quadrant-2 Strategic Priority
    quadrant-3 Can Delay
    quadrant-4 Re-evaluate
    LLM Chat: [0.8, 0.9]
    Smart OCR: [0.7, 0.8]
    API Tester: [0.4, 0.7]
    Git Analyzer: [0.6, 0.6]
    Text Diff: [0.3, 0.4]
    Directory Tree: [0.2, 0.3]
\`\`\`

## 11. 思维导图 (Mindmap)

\`\`\`mermaid
mindmap
  root((AIO Hub))
    LLM工具
      Chat对话
      API代理
      模型测试
    文本处理
      格式化
      对比工具
      正则应用
    开发工具
      Git分析
      目录树
      API测试
    AI识别
      OCR文字识别
      图像处理
\`\`\`

## 12. 时间线图 (Timeline)

\`\`\`mermaid
timeline
    title AIO Hub 发展历程
    2024-Q1 : 项目启动
            : 基础架构搭建
    2024-Q2 : 核心功能开发
            : LLM Chat
            : Smart OCR
    2024-Q3 : 功能扩展
            : API Tester
            : Git Analyzer
    2024-Q4 : 生态完善
            : 插件系统
            : 主题定制
    2025-Q1 : 持续优化
            : 性能提升
            : 新功能开发
\`\`\`

## 混合测试

下面是混合 Mermaid 图表和其他 Markdown 元素的示例：

### 系统架构说明

我们的系统采用分层架构设计：

\`\`\`mermaid
graph TB
    A[前端层<br/>Vue 3 + TypeScript] --> B[业务逻辑层<br/>Composables]
    B --> C[数据层<br/>Pinia Stores]
    C --> D[API层<br/>Tauri Commands]
    D --> E[后端层<br/>Rust]
    E --> F[系统层<br/>Native APIs]
\`\`\`

**关键特性**：
- **响应式状态管理**：使用 Pinia 进行全局状态管理
- **组合式 API**：通过 Composables 实现逻辑复用
- **原生性能**：Tauri + Rust 提供接近原生的性能

### 数据流程

\`\`\`mermaid
sequenceDiagram
    participant U as 用户界面
    participant C as Composable
    participant S as Store
    participant T as Tauri API
    participant R as Rust后端
    
    U->>C: 触发操作
    C->>S: 更新状态
    S->>T: 调用命令
    T->>R: 执行后端逻辑
    R-->>T: 返回结果
    T-->>S: 更新数据
    S-->>C: 通知变化
    C-->>U: 更新视图
\`\`\`

---

> **提示**：以上所有图表都应该正确渲染。如果某个图表显示错误，请检查 Mermaid 语法或渲染器配置。`
  },
];
