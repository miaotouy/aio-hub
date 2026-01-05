# AIO Hub 移动端适配蓝图 (Mobile Adaptation Blueprint)

本蓝图旨在通过 **“物理隔离”** 与 **“构建分流”** 的策略，将 AIO Hub 核心功能（LLM Chat）适配至移动端，同时彻底剥离桌面端重度特性。

## 1. 核心架构：独立项目 (Side-by-Side Monorepo)

由于移动端与桌面端在文件系统权限、交互习惯、性能瓶颈及 API 行为上存在巨大差异，决定采取 **“接口兼容，逻辑重写”** 的彻底隔离方案。

### 1.1. 项目目录结构

```text
all-in-one-tools/
├── mobile/                    # 移动端独立项目 (全新 Tauri v2 Mobile 项目)
│   ├── src/                   # 移动端前端源码 (Vue 3 + Vant)
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── router/
│   │   ├── logic/             # 重写的移动端逻辑 (Storage, Executor, Assets)
│   │   ├── components/        # 移动端 UI 组件库 (针对触摸优化)
│   │   └── tools/             # 移动端重写的工具视图 (如 Chat, OCR)
│   ├── src-tauri/             # 移动端后端 (极简 Rust，仅保留移动端必要命令)
│   ├── package.json           # 移动端独立依赖 (Vant, Tauri Mobile)
│   ├── vite.config.ts         # 移动端构建配置
│   └── index.html             # 移动端入口模板
├── src/                       # 桌面端前端源码 (保持现状，严禁污染)
├── src-tauri/                 # 桌面端后端 (不和移动端直接共享)
├── package.json               # 根目录 Workspace 配置 (管理 desktop + mobile)
└── ...
```

### 1.2. 构建流隔离

- **桌面端**: `vite.config.ts` → `index.html` → `src/main.ts`
- **移动端**: `mobile/vite.config.ts` → `mobile/index.html` → `mobile/src/main.ts`
- **优势**: 移动端编译时，Monaco Editor、Git 分析器、桌面端视图等代码会被完全排除，不会进入产物。

### 1.3. 代码搬运策略

- **可搬运部分 (约 30%)**: LLM API 封装 (`src/llm-apis/`)、宏引擎 (`src/tools/llm-chat/core/`)、类型定义 (`src/types/`)、预设配置 (`src/config/`)。
- **重写部分 (约 70%)**: 存储层、资产管理器、UI 组件、交互逻辑。

## 2. 功能剥离清单

### 2.1. 后端 (Rust) 剥离

通过 **Cargo features** 进行硬隔离：

| 特性              | 桌面端 (Desktop) | 移动端 (Mobile) | 备注                     |
| :---------------- | :--------------- | :-------------- | :----------------------- |
| `git2`            | ✅ 启用          | ❌ 禁用         | 移动端不需要 Git 分析    |
| `rdev`            | ✅ 启用          | ❌ 禁用         | 移动端不支持全局监听     |
| `trash`           | ✅ 启用          | ❌ 禁用         | 移动端改为直接删除       |
| `window-vibrancy` | ✅ 启用          | ❌ 禁用         | 移动端不支持窗口特效     |
| `native_ocr`      | ✅ 启用 (Win)    | ❌ 禁用         | 移动端可考虑调用原生 API |
| `single_instance` | ✅ 启用          | ❌ 禁用         | 移动端通常不需要         |

### 2.2. 前端 (Vue) 屏蔽

在 `shared/stores/tools.ts` 中增加平台元数据：

```typescript
{
  id: 'llm-chat',
  platforms: ['desktop', 'mobile'],
  // ...
},
{
  id: 'git-analyzer',
  platforms: ['desktop'], // 移动端自动过滤
  // ...
}
```

## 3. 关键适配点

### 3.1. 窗口与导航

- **移除**: `useDetachable` (分离窗口)、`TitleBar` (自定义标题栏)。
- **新增**: 移动端手势导航、抽屉式工具切换。

### 3.2. 输入交互

- **编辑器**: 移动端放弃 `Monaco Editor`，统一使用 `CodeMirror` 或原生 `TextArea` 以获得更好的软键盘支持。
- **拖拽**: 移除所有基于鼠标的拖拽逻辑，改为长按或滑动。

### 3.3. 逻辑重写清单 (Mobile Logic Rewrite)

- **存储层**: 重写 `useChatStorage`。移动端减少碎片文件读取，考虑合并索引。
- **执行层**: 重写 `useChatExecutor`。优化移动端网络波动处理，精简预处理流程。
- **资产层**: 重写 `useAssetManager`。彻底移除 Windows 路径别名（反斜杠），适配 Android/iOS 沙盒协议。
- **交互层**: 消息操作由 `hover` 全面转向 `长按/点击`。

## 4. 实施路线图

### 第一阶段：环境搭建 (Current)

1.  修改根目录 `package.json`，启用 **Bun Workspaces**。
2.  创建 `mobile/` 目录结构，初始化 `mobile/package.json` 和 `mobile/vite.config.ts`。
3.  创建 `mobile/src-tauri/` 基础配置（极简版 Tauri Mobile）。
4.  在根目录 `package.json` 中添加 `tauri:android` 和 `tauri:ios` 脚本。

### 第二阶段：后端重构

1.  在 `src-tauri/Cargo.toml` 中定义 `desktop` feature，将桌面专属依赖归类。
2.  使用 `#[cfg(feature = "desktop")]` 包裹非核心命令。
3.  （可选）创建 `mobile/src-tauri/Cargo.toml`，仅包含移动端必要的命令。

### 第三阶段：核心 UI 迁移

1.  在 `mobile/src/tools/llm-chat/` 中实现移动端版 Chat，复用 `useLlmChatStore`。
2.  实现移动端专用的 `MessageInput` 和 `SidebarDrawer`。

### 第四阶段：代码搬运与 CI/CD 集成

1.  将可复用的核心逻辑（LLM API、宏引擎）从 `src/` 复制到 `mobile/src/shared/`。
2.  配置 GitHub Actions，实现桌面端与移动端的并行构建与发布。

---

_注：此蓝图实施过程中将根据 Tauri v2 移动端的实际表现进行调整。_
