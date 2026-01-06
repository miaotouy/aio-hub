# AIO Hub 移动端实施计划 (Mobile Implementation Plan)

## 1. 战略方针 (Strategic Direction)

**“独立重构，全量对齐，架构自治”**。

移动端不搞“代码映射”或“Alias 共享”的投机取脚，而是采取**战略性重写/复制**。移动端是一个与桌面端对等的完整系统，其内部结构必须支撑复杂工具（如 LLM Chat）的完整逻辑迁移。

## 2. 当前开发状态 (Current Status)

_截止日期：2026-01-05_

- [x] **基础框架**：基于 Vite + Vue 3 + TypeScript 初始化 `mobile/` 目录。
- [x] **UI 框架**：已安装 `@varlet/ui` 并完成按需引入配置 (MD3 模式)。
- [x] **平台适配**：Tauri Android 端环境已就绪。
- [ ] **核心依赖**：缺失 `vue-router`, `pinia`, `lucide-vue-next`, `lodash-es`, `@vueuse/core`。
- [ ] **基础设施**：缺失 `errorHandler`, `logger` 的移动端平替实现。

## 3. 核心工程规范 (Engineering Protocols)

### 3.1. 基础设施平替 (Infrastructure Parity)

移动端实现核心 `utils/` 工具集时，应优先遵循移动端交互规范。对于 `errorHandler` 等核心逻辑，内部实现应直接对接 Varlet API，而非机械模拟 PC 端的补丁逻辑。

| 功能     | 桌面端依赖        | 移动端实现           | 备注                                      |
| :------- | :---------------- | :------------------- | :---------------------------------------- |
| 消息提示 | `customMessage`   | `Snackbar` (Varlet)  | 移动端直接使用 Varlet 原生 API            |
| 错误处理 | `errorHandler.ts` | `errorHandler.ts`    | 内部逻辑改为直接调用 Varlet Dialog/Snackbar |
| 日志系统 | `logger.ts`       | `logger.ts`          | 保持接口一致，生产环境对接 Tauri 日志插件 |
| 图标库   | `lucide-vue-next` | `lucide-vue-next`    | 保持一致，避免样式心智负担                |
| 存储     | `localStorage`    | `localStorage`       | 暂不使用 Tauri Store，保持 Web 标准       |

### 3.2. 样式与适配规范 (Style Migration)

**目标文件**：`mobile/src/assets/styles/theme.css` (由 `src/styles/index.css` 提炼)

- **保留核心变量**：`:root` 和 `html.dark` 中的基础色彩变量 (`--bg-color`, `--text-color`, `--primary-color` 等)。
- **保留色彩哲学**：保留 `color-mix` 的半透明高亮逻辑。
- **保留质感**：保留 `theme-appearance.css` 中的毛玻璃效果变量 (`--ui-blur`)。
- **剔除冗余**：剔除所有 `.el-` 开头的补丁、桌面标题栏高度、以及桌面端特有的滚动条美化。
- **安全区域**：所有全屏视图必须处理 `safe-area-inset-top` 和 `bottom`。
- **交互反馈**：点击态必须有 `van-haptics-feedback` 或背景色色值变化。

## 4. 目录结构与职责 (Standard Directory Structure)

严禁“全局大杂烩”，每个工具必须作为一个**自包含的特区**。

```text
mobile/src/
├── api/                # 复制桌面端 API 定义
├── assets/             # 移动端专用静态资源 (含提炼后的 theme.css)
├── components/         # 移动端通用 UI 组件 (BaseNavBar, SafeBottom)
├── composables/        # 跨工具复用的逻辑
├── router/             # 路由配置 (含自动扫描)
├── stores/             # 全局状态管理 (Theme, User)
├── utils/              # 基础设施平替实现
├── views/              # 顶级页面 (Home, Settings)
└── tools/              # 工具自治特区
    └── [tool-name]/    # 示例：对话 (LlmChat)
        ├── views/      # 工具主界面 (LlmChatView.vue)
        ├── components/ # 该工具专用组件 (agent/, user/, 会话/, 输入/)
        ├── use组件/    # 工具专用 Composables (useLlmRequest.ts)
        ├── 状态/       # 工具级 Pinia Store
        ├── 类型/       # TypeScript 定义
        ├── 宏引擎/     # 核心逻辑
        ├── 上下文管道/ # 数据处理
        └── registry.ts # 工具注册元数据
```

## 5. 自动化路由设计 (Auto-Routing)

`mobile/src/router/index.ts` 必须实现自动扫描，以支持 Agent 全自动增量开发：

```typescript
// 扫描所有 tools 目录下的 registry.ts
const toolModules = import.meta.glob("../tools/*/registry.ts", { eager: true });
const toolRoutes = Object.values(toolModules).map((mod: any) => mod.default.route);

const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: "/", component: () => import("../views/Home.vue") }, ...toolRoutes],
});
```

`registry.ts` 规范示例：

```typescript
export default {
  id: "llm-chat",
  name: "AI 对话",
  icon: "MessageSquare",
  route: {
    path: "/tools/llm-chat",
    component: () => import("./views/LlmChatView.vue"),
    meta: { title: "AI 对话" },
  },
};
```

## 6. 实施路线图 (Implementation Roadmap)

### 第一阶段：环境补完 (CLI Ready)

- [ ] **执行安装**：`cd mobile; bun add vue-router pinia lucide-vue-next lodash-es @vueuse/core @varlet/ui @varlet/use;`
- [ ] **样式提炼**：从桌面端 `index.css` 提取色彩变量至 `mobile/src/assets/styles/theme.css`。
- [ ] **基础设施实现**：
  - 编写 `mobile/src/utils/logger.ts` (保持 `createModuleLogger` 接口，支持日志持久化)。
  - 编写 `mobile/src/utils/errorHandler.ts` (直接调用 Varlet `Dialog/Snackbar`)。

### 第二阶段：骨架搭建 (Scaffolding)

- [ ] **实现自动路由**：编写 `mobile/src/router/index.ts`。
- [ ] **实现主布局**：
  - `App.vue` 配置 `var-bottom-navigation` (首页、Chat、设置)。
  - `views/Home.vue` 实现工具网格，数据源来自 `import.meta.glob` 扫描结果。

### 第三阶段：核心工具迁移 (Tool Migration)

- [ ] **LLM Chat 迁移**：
  - 按照 `mobile/src/tools/对话/` 结构建立目录。
  - 迁移 `useLlmRequest.ts` 到 `use组件/`。
  - 使用 Varlet `Paper`, `Input`, `Space` 重写输入区域，实现长按操作菜单。

## 7. Agent 施工指令 (Prompt for Agent)

在 `mobile/` 目录下进行施工。

1. 首先补齐依赖，并建立 `utils/` 下的平替基础设施，确保接口一致。
2. 按照“工具自治”目录结构进行开发，严禁将工具专用代码放入全局目录。
3. 实现路由自动扫描机制。
4. 每步完成后，确保 `bun run build` 能够通过类型检查。

---

**计划制定者**：咕咕 (Kilo)
**更新时间**：2026-01-06
**状态**：待批准执行

---

项目所有者的设想目录结构（只是结构不代表要求名字一致）

all-in-one-tools/
mobile

- src/
  - components/
  - main.ts
  - App.vue
  - ...其他vue项目基础目录结构
  - views/
  - tools/
    - 对话/
      - LlmChatView.vue
      - use组件/
      - ui组件/
        - agent/
        - user/
        - 会话/
        - 设置/
        - 输入/
        - ……等等
      - 宏引擎/
      - 上下文管道/
      - 类型/
      - 状态/
      - 文档/
      - llmChat.registry.ts（或者registry.ts又或者index.ts也行）
    - 组件测试器/
      - ComponentTester.vue
    - 富文本渲染器/
      - RichTextRendererView.vue（实际上就是测试器视图，因为富文本渲染器作为嵌入式用的组件本来也没有可作为主页的）
      - RichTextRenderer.vue（渲染器本体）
