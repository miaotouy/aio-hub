# AIO Hub 迁移 Electron 阶段一：工程脚手架与基础骨架施工待办方案

> 状态：施工待办 (Ready for Implementation)  
> 版本：v1.0.0  
> 提出日期：2026-10-02  
> 编制人：咕咕（架构师）  
> 上级规划：[`docs/Plan/electron-migration-master-plan.md`](./electron-migration-master-plan.md)  
> 关联调查：[`docs/design/地基迁移调查/webview2-migration-investigation.md`](../design/地基迁移调查/webview2-migration-investigation.md)

---

## 1. 阶段目标与准入/准出条件

### 1.1 阶段核心目标

基于 [`docs/Plan/electron-migration-master-plan.md`](./electron-migration-master-plan.md:100) 中设立的战略目标，阶段一聚焦于**“双轨并行、点亮首窗、无损适配”**：

1. **搭建独立于 Rust 的 Electron 主进程与预加载工程结构**，与现有 Tauri/Vite 前端共生，不破坏当前任何已有开发工作流。
2. **实现高安全、类型化的 IPC 与平台适配垫片（Platform Bridge）**，为标题栏拖拽、窗口控制、状态保存提供底层支撑。
3. **实现 `asset://` 自定义协议的原生平替**，确保本地大文件、图片及多媒体流式媒体在 Electron 内可无缝加载与 Seek。
4. **达成首个里程碑**：运行 `bun run electron:dev` 成功拉起 Electron 主窗口，完整渲染现有的 Vue 3 界面与自定义 TitleBar，完成基础窗口交互闭环。

### 1.2 准入条件 (Entry Criteria)

- [x] 主规划总纲 [`docs/Plan/electron-migration-master-plan.md`](./electron-migration-master-plan.md:1) 架构评审通过；
- [x] 当前工作区 `bun run check:frontend` 与 `bun run dev` 运行稳定，无阻断性构建错误；
- [x] 确定运行时技术选型：Node.js >= 20.x，Electron 33+ (基于 Chromium 130+，具备原生 Wayland/Windows 11 Mica 材质支持)，前端包管理器沿用 Bun。

### 1.3 准出验收准则 (Exit Criteria)

- [ ] 执行 `bun run electron:dev` 能在 3 秒内唤起 Electron 窗口，成功加载 Vite 开发服务器页面并热更新；
- [ ] 自定义无边框窗口生效，标题栏拖拽（Drag Region）、双击最大化/还原、最小化、关闭功能 100% 正常；
- [ ] 窗口尺寸、位置与最大化状态具备持久化恢复能力；
- [ ] `asset://` 协议能够正常解析本地绝对路径资源，支持 Range 请求播放音视频；
- [ ] 全局现有检查指令（`bun run check:frontend`、`bun run check`、`bun run tauri:dev`）零回归、零报警。

---

## 2. 工程组织与构建架构设计

### 2.1 双轨并行构建拓扑

为避免引入重型全家桶脚手架导致破坏现有复杂的 [`vite.config.ts`](../../vite.config.ts:1)（涵盖 Monaco 汉化拦截、Unplugin-icons、Tokenizer 插件及 Rolldown 分包），阶段一采用**“外部伴生、轻量打包、共用服务”**策略：

```mermaid
graph TD
    subgraph FrontendDev [前端开发服务器]
        ViteDev[Vite Dev Server (Port 1420)]
        VueApp[Vue 3 前端代码 (src/)]
        ViteDev --> VueApp
    end

    subgraph ElectronBuild [Electron 伴生构建流程]
        TSConfigElectron[tsconfig.electron.json]
        MainSrc[electron/main/**/*.ts]
        PreloadSrc[electron/preload/**/*.ts]
        Bundler[Bun Build / esbuild CLI]
        DistMain[dist-electron/main.js]
        DistPreload[dist-electron/preload.js]

        MainSrc --> Bundler
        PreloadSrc --> Bundler
        Bundler --> DistMain
        Bundler --> DistPreload
    end

    subgraph Runtime [Electron 运行时]
        ElectronBin[Electron 33 Executable]
        DistMain -.->|Node.js 执行| ElectronBin
        ElectronBin -->|载入| DistPreload
        ElectronBin -->|BrowserWindow.loadURL| ViteDev
    end
```

### 2.2 目录拓扑结构设计

在工程根目录下新增 `electron/` 目录，与 `src/`、`src-tauri/` 保持同级解耦：

```text
aiohub-dev/
├── electron/                         # [新增] Electron 主进程与预加载源码
│   ├── main/                         # 主进程核心源码
│   │   ├── index.ts                  # 主进程入口（生命周期管理、单例锁）
│   │   ├── window-manager.ts         # 窗口管理器（主窗口、分离窗口、状态持久化）
│   │   ├── config.ts                 # 运行时环境配置与常量
│   │   ├── protocols/                # 自定义协议注册
│   │   │   └── asset-protocol.ts     # asset:// 本地安全资产协议处理
│   │   └── ipc/                      # IPC 事件监听与分发层
│   │       ├── index.ts              # IPC 集中注册网关
│   │       └── window-ipc.ts         # 窗口控制相关 IPC Handler
│   ├── preload/                      # Preload 安全沙箱桥接
│   │   ├── index.ts                  # contextBridge 注入安全 API
│   │   └── apis/                     # 暴露给渲染进程的 API 子模块
│   │       └── window-api.ts         # 窗口操作通信通道
│   └── tsconfig.json                 # Electron 专用 TypeScript 编译配置
├── dist-electron/                    # [构建产物 - 忽略提交]
│   ├── main.js
│   └── preload.js
├── src/
│   ├── platform/                     # [新增] 前端抽象适配层 (Facade)
│   │   ├── types.ts                  # 平台通道核心类型契约
│   │   ├── env.ts                    # 运行环境探测 (Tauri vs Electron vs Browser)
│   │   ├── window.ts                 # 窗口控制门面
│   │   ├── bridge.ts                 # 通用 invoke / listen 网关
│   │   └── index.ts                  # 统一导出入口
│   └── components/
│       └── TitleBar.vue              # [改造] 将 @tauri-apps/api 替换为 @/platform/window
├── scripts/
│   └── electron-dev.ts               # [新增] Electron 并行启动与监视脚本
└── tsconfig.json                     # [修改] 引用 tsconfig.electron.json
```

---

## 3. 核心基础设施技术实现规范

### 3.1 进程模型划分、安全屏障与 IPC 契约

> **重要澄清**：Electron 采用**主进程 (Main Process) 与渲染进程 (Renderer Process) 架构分离**模式。
>
> - **Node.js 运行时完全保留且常驻**：Cordis 插件底座、长程 Agent 状态机、多线程 Worker、原生网络与文件系统，**原生泡在常驻的 Node.js 主进程/工具进程 (`utilityProcess`) 中**，窗口关闭或刷新绝不中断；
> - **“禁用 Node.js 集成 (`nodeIntegration: false`)”仅作用于 UI 渲染窗口**：为了杜绝 Markdown/网页蒸馏中的 XSS 脚本越权调用 `require('child_process')` 获得机器最高权限，渲染层采用 Chromium 标准沙箱，主进程的 Node 能力通过 `preload.ts` 强类型通道（`window.aiohub`）受控暴露给 Vue。

#### 3.1.1 主进程窗口安全配置（UI 渲染层）

```typescript
// BrowserWindow 安全初始化约束（仅针对负责绘制 Vue UI 的渲染窗口）
const mainWindow = new BrowserWindow({
  width: 1280,
  height: 800,
  minWidth: 900,
  minHeight: 600,
  frame: false, // 启用无边框窗口
  titleBarStyle: "hidden", // 适配 Windows 11 与 macOS 原生控件定位
  backgroundMaterial: "mica", // Windows 11 材质自适应
  backgroundColor: "#00000000", // 配合半透明毛玻璃透明底色
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    nodeIntegration: false, // 渲染窗口内禁止直接挂载裸全局 require/process，防 XSS 穿透
    contextIsolation: true, // 开启上下文隔离，保障 window.aiohub API 纯净不被页面篡改
    sandbox: true, // 开启 Chromium 进程级沙箱
    webSecurity: true,
    allowRunningInsecureContent: false,
  },
});
```

#### 3.1.2 Preload 契约与全局命名空间 (`window.aiohub`)

在 [`electron/preload/index.ts`](electron/preload/index.ts) 中暴露强类型对象，挂载至 `window.aiohub`，防止全局命名污染：

```typescript
// 类型声明：src/platform/types.ts
export interface ElectronWindowApi {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  hide: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  saveConfig: () => Promise<void>;
  onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
}

export interface ElectronAioHubBridge {
  platform: "electron";
  window: ElectronWindowApi;
  invoke: <T = unknown>(channel: string, payload?: unknown) => Promise<T>;
}
```

```typescript
// electron/preload/index.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("aiohub", {
  platform: "electron",
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    hide: () => ipcRenderer.invoke("window:hide"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    saveConfig: () => ipcRenderer.invoke("window:save-config"),
    onMaximizedChange: (callback: (isMax: boolean) => void) => {
      const handler = (_: unknown, isMax: boolean) => callback(isMax);
      ipcRenderer.on("window:event:maximize-change", handler);
      return () =>
        ipcRenderer.removeListener("window:event:maximize-change", handler);
    },
  },
  invoke: (channel: string, payload: unknown) =>
    ipcRenderer.invoke(channel, payload),
});
```

### 3.2 窗口管理器规范 (`WindowManager`)

1. **多窗口与分离组件支持**：
   - 追踪并管理 `main` 窗口以及用户拖拽分离出的 `detached-*` 窗口实例；
   - 支持根据窗口 label 派发独立事件与位置控制。
2. **窗口状态记忆与还原**：
   - 监听窗口 `resize`、`move` 事件（500ms 防抖）；
   - 在应用数据目录下的 `window-state.json` 中保存窗口 `x, y, width, height, isMaximized`；
   - 启动时校验恢复的坐标是否处于当前显示器视口范围内，防止因外接屏拔除导致窗口飘出屏幕。

### 3.3 `asset://` 协议平替机制

在 Tauri 中，图片、音视频文件均使用 `asset://localhost/path/to/file` 协议加载。Electron 中通过 `protocol.handle` 必须完全兼容该行为，并增加流媒体支持：

```typescript
// electron/main/protocols/asset-protocol.ts
import { protocol, net } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function registerAssetProtocol(): void {
  protocol.handle("asset", async (request) => {
    try {
      // 兼容 asset://localhost/D:/path... 或 asset://D:/path...
      const url = new URL(request.url);
      let decodedPath = decodeURIComponent(url.pathname);

      // Windows 驱动器盘符修正（如 /D:/path -> D:/path）
      if (
        process.platform === "win32" &&
        decodedPath.startsWith("/") &&
        decodedPath[2] === ":"
      ) {
        decodedPath = decodedPath.slice(1);
      } else if (
        process.platform === "win32" &&
        url.host &&
        url.host.length === 2 &&
        url.host.endsWith(":")
      ) {
        decodedPath = `${url.host}${decodedPath}`;
      }

      const fileUrl = pathToFileURL(path.resolve(decodedPath)).toString();
      // net.fetch 自动支持 HTTP Range 请求（对于视频 Seek 与音频流至关重要）
      return await net.fetch(fileUrl, { bypassCustomProtocolHandlers: true });
    } catch (error) {
      console.error("[AssetProtocol] 加载本地资源失败:", request.url, error);
      return new Response("File not found or access denied", { status: 404 });
    }
  });
}
```

### 3.4 前端门面层设计 (`src/platform/`)

为了让上层业务代码无需关心底层是 Tauri 还是 Electron，在前端建立 `@/platform` 门面：

```typescript
// src/platform/env.ts
export const isElectron =
  typeof window !== "undefined" &&
  Boolean(window.aiohub?.platform === "electron");
export const isTauri =
  typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
```

```typescript
// src/platform/window.ts
import { isElectron } from "./env";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export interface AppWindowFacade {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  hide: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  saveConfig: (label?: string) => Promise<void>;
  onResized: (cb: () => void) => Promise<() => void>;
  onMoved: (cb: () => void) => Promise<() => void>;
}

export const appWindow: AppWindowFacade = {
  async minimize() {
    if (isElectron) return window.aiohub.window.minimize();
    return getCurrentWindow().minimize();
  },
  async toggleMaximize() {
    if (isElectron) return window.aiohub.window.toggleMaximize();
    return getCurrentWindow().toggleMaximize();
  },
  async close() {
    if (isElectron) return window.aiohub.window.close();
    return getCurrentWindow().close();
  },
  async hide() {
    if (isElectron) return window.aiohub.window.hide();
    return getCurrentWindow().hide();
  },
  async isMaximized() {
    if (isElectron) return window.aiohub.window.isMaximized();
    return getCurrentWindow().isMaximized();
  },
  async saveConfig(label = "main") {
    if (isElectron) return window.aiohub.window.saveConfig();
    return tauriInvoke("save_window_config", { label });
  },
  async onResized(cb) {
    if (isElectron) {
      return window.aiohub.window.onMaximizedChange(() => cb());
    }
    return getCurrentWindow().onResized(cb);
  },
  async onMoved(cb) {
    if (isElectron) {
      return () => {}; // Electron 可由主进程窗口事件直接监听防抖落盘
    }
    return getCurrentWindow().onMoved(cb);
  },
};
```

---

## 4. 详细实施施工待办清单 (Step-by-Step Task Breakdown)

### 阶段 1.1：依赖与环境初始化

- [ ] **Task 1.1.1：安装 Electron 核心依赖**
  - 运行 `bun add -d electron@^33.2.0 @types/node`；
  - 检查并在 [`package.json`](../../package.json:1) 的 `devDependencies` 中锁定版本；
  - 确保安装后 `bunx electron --version` 正确输出版本号。
- [ ] **Task 1.1.2：创建主进程专属 TS 配置**
  - 新建 [`electron/tsconfig.json`](electron/tsconfig.json)，配置 `target: "ES2022"`、`module: "ESNext"`、`moduleResolution: "bundler"`、`lib: ["ES2023"]`；
  - 在根目录 [`tsconfig.json`](../../tsconfig.json:39) 中追加 `"references": [{ "path": "./electron/tsconfig.json" }]`。

### 阶段 1.2：主进程基础架构落地

- [ ] **Task 1.2.1：实现主进程配置与路径管理**
  - 新建 [`electron/main/config.ts`](electron/main/config.ts)；
  - 导出 `isDev`、`VITE_DEV_SERVER_URL`、`APP_CONFIG_DIR` 等常量；
  - 确保应用数据根目录对齐 Tauri 原生规范（`%APPDATA%/aiohub` 或 `.dev-data/`）。
- [ ] **Task 1.2.2：实现窗口管理器 (`WindowManager`)**
  - 新建 [`electron/main/window-manager.ts`](electron/main/window-manager.ts)；
  - 实现 `createMainWindow()` 方法，配置无边框与背景材质；
  - 实现状态存储逻辑：监听窗口 `resize`、`move`，使用防抖写回 `window-state.json`；
  - 处理窗口恢复：根据屏幕工作区尺寸防止窗口越界。
- [ ] **Task 1.2.3：实现自定义资产协议 (`asset://`)**
  - 新建 [`electron/main/protocols/asset-protocol.ts`](electron/main/protocols/asset-protocol.ts)；
  - 实现 `protocol.registerSchemesAsPrivileged`，将 `asset` 协议标记为安全、支持跨域与流式加载（`secure: true`, `supportFetchAPI: true`, `corsEnabled: true`, `stream: true`）；
  - 实现路径规整化与 Windows 驱动盘符转换，通过 `net.fetch` 返回带 Range 支持的响应。
- [ ] **Task 1.2.4：实现窗口控制 IPC 处理层**
  - 新建 [`electron/main/ipc/window-ipc.ts`](electron/main/ipc/window-ipc.ts)；
  - 注册 `window:minimize`、`window:toggle-maximize`、`window:close`、`window:hide`、`window:is-maximized`、`window:save-config`；
  - 监听 `mainWindow` 的 `maximize`、`unmaximize` 事件，主动向渲染进程发射 `window:event:maximize-change`。
- [ ] **Task 1.2.5：实现主进程主入口**
  - 新建 [`electron/main/index.ts`](electron/main/index.ts)；
  - 处理单实例锁（`app.requestSingleInstanceLock()`），避免重复拉起；
  - 组织应用就绪（`app.whenReady()`）生命周期：注册协议 -> 注册 IPC -> 创建主窗口；
  - 处理全窗口关闭事件，兼容托盘与 macOS `activate` 行为。

### 阶段 1.3：预加载脚本与前端桥接门面

- [ ] **Task 1.3.1：编写 Preload 注入脚本**
  - 新建 [`electron/preload/index.ts`](electron/preload/index.ts)；
  - 将窗口控制 API 与安全 IPC invoke 方法通过 `contextBridge.exposeInMainWorld('aiohub', ...)` 注入渲染环境；
  - 保持类型声明与实现强绑定。
- [ ] **Task 1.3.2：建立前端平台适配层 (`src/platform/`)**
  - 新建 [`src/platform/types.ts`](../../src/platform/types.ts)：定义平台无关的 Window 控制接口与全局声明扩充；
  - 新建 [`src/platform/env.ts`](../../src/platform/env.ts)：实现环境精准嗅探；
  - 新建 [`src/platform/window.ts`](../../src/platform/window.ts)：暴露抽象的 `appWindow`；
  - 新建 [`src/platform/index.ts`](../../src/platform/index.ts)：汇聚导出。
- [ ] **Task 1.3.3：重构标题栏组件 (`TitleBar.vue`)**
  - 改造 [`src/components/TitleBar.vue`](../../src/components/TitleBar.vue:27)；
  - 移除对 `@tauri-apps/api/window` 中 `getCurrentWindow` 的硬依赖，改用 `@/platform/window`；
  - 将 `save_window_config` 的调用平滑代理至 `appWindow.saveConfig()`；
  - 保留 CSS 原生属性 `-webkit-app-region: drag` 和 `no-drag`，移除对 Tauri 专用拖拽 hook 的强绑定。

### 阶段 1.4：开发与打包脚本管道打通

- [ ] **Task 1.4.1：配置主进程与 Preload 快速打包命令**
  - 使用 Bun 原生打包能力或 esbuild 创建轻量构建脚本 [`scripts/build-electron.ts`](../../scripts/build-electron.ts)；
  - 将 `electron/main/index.ts` 打包至 `dist-electron/main.js`（Node 目标环境，CJS/ESM 兼容）；
  - 将 `electron/preload/index.ts` 打包至 `dist-electron/preload.js`。
- [ ] **Task 1.4.2：编写双进程联调启动器 (`scripts/electron-dev.ts`)**
  - 脚本逻辑：
    1. 启动 Vite 开发服务器（直接复用项目现有的端口与环境变量规则，如 1420 端口）；
    2. 等待 Vite 端口可用；
    3. 构建 `electron/` 源码至 `dist-electron/`；
    4. 启动 Electron 子进程，注入 `VITE_DEV_SERVER_URL`；
    5. 监视 `electron/` 目录源码变动，变动时自动重新打包并重启 Electron。
- [ ] **Task 1.4.3：接入 package.json 脚本指令**
  - 在 [`package.json`](../../package.json:27) 中追加：
    - `"electron:dev": "bun scripts/electron-dev.ts"`
    - `"electron:build:main": "bun scripts/build-electron.ts"`
    - `"check:electron": "tsc --project electron/tsconfig.json --noEmit"`

---

## 5. 阶段一验证矩阵与测试用例

| 编号       | 测试场景                | 操作步骤                                             | 预期结果                                                                  |
| :--------- | :---------------------- | :--------------------------------------------------- | :------------------------------------------------------------------------ |
| **TC-101** | 开发服务冷启动          | 执行 `bun run electron:dev`                          | Vite 服务器就绪后，Electron 窗口在 3 秒内启动并加载主页，控制台无致命报错 |
| **TC-102** | 标题栏拖拽移动          | 鼠标在标题栏空白区域按住并移动                       | 窗口跟随鼠标平滑移动，无抖动或卡顿                                        |
| **TC-103** | 双击最大化与还原        | 双击标题栏空白区域                                   | 窗口在全屏最大化与原尺寸之间平滑切换，图标状态实时响应                    |
| **TC-104** | 窗口控制按钮            | 分别点击最小化、最大化/还原、关闭按钮                | 窗口即时执行对应动作；主窗口若配置最小化到托盘则隐藏                      |
| **TC-105** | 窗口状态记忆恢复        | 改变窗口尺寸位置后关闭，重新运行 `electron:dev`      | 窗口以关闭前的位置和尺寸重新呈现                                          |
| **TC-106** | 本地 `asset://` 加载    | 进入素材管理或图片查看，载入本地图片和视频           | 本地资源正常展示，视频支持进度条自由拖拽 Seek                             |
| **TC-107** | 原有 Tauri 流程无损回归 | 执行 `bun run check:frontend` 与 `bun run tauri:dev` | 前端类型检查 100% 通过，原 Tauri 应用依旧可以正常启动和交互               |

---

## 6. 避坑指南与高风险提示

1. **CSP 策略与 Electron 兼容**：
   - 检查 [`index.html`](../../index.html:7) 中的 Content-Security-Policy。当前配置中已包含 `asset:` 和 `http://localhost:*`，但需确保在 Electron 下允许 `default-src 'self' 'unsafe-inline' asset:`，避免因 CSP 阻断 Electron 本地协议加载。
2. **`protocol.registerSchemesAsPrivileged` 的注册时机**：
   - 该方法**必须**在 Electron 的 `app.whenReady()` 触发前执行，否则会导致 `asset://` 协议失去安全域特权，无法使用 `fetch` 或加载媒体流。
3. **`-webkit-app-region: drag` 的点击穿透问题**：
   - Chromium 内核对于标记了 `drag` 的元素，其子元素若未显式声明 `-webkit-app-region: no-drag`，所有鼠标交互（点击、下拉、输入）将被底层拦截。必须确保 [`src/components/TitleBar.vue`](../../src/components/TitleBar.vue:1066) 的 `.right-controls` 与所有按钮、弹出层均声明为 `no-drag`。
4. **macOS 红绿灯冲突**：
   - 在 macOS 下使用 `titleBarStyle: 'hidden'` 时，系统红绿灯按钮会悬浮在左上角，需要保留 [`TitleBar.vue`](../../src/components/TitleBar.vue:997) 中针对 macOS 的 `padding-left: 70px` 布局偏移。
