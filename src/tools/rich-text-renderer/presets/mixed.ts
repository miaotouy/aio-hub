import { RenderPreset } from '../types';

export const mixedPreset: RenderPreset = {
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
};
