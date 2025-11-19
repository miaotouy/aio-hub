import { RenderPreset } from '../types';

export const mermaidDiagramsPreset: RenderPreset = {
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

> **提示**：以上所有图表都应该正确渲染。如果某个图表显示错误，请检查 Mermaid 语法或渲染器配置。`,
};
