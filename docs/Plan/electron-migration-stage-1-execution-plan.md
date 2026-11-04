# AIO Hub 迁移 Electron 阶段一：工程脚手架与基础骨架施工待办方案

> 状态：基础宿主与本地分发已落地，生命周期继续实施  
> 版本：v1.0.1\
> 更新日期：2026-11-04\
> 提出日期：2026-10-02  
> 编制人：咕咕（架构师）  
> 上级规划：[`docs/Plan/electron-migration-master-plan.md`](./electron-migration-master-plan.md)  
> 关联调查：[`docs/design/地基迁移调查/webview2-migration-investigation.md`](../design/地基迁移调查/webview2-migration-investigation.md)

---

## 当前实施快照（2026-11-04）

正式工程当前固定 Electron 45.2.1；第 2/3 节保留早期目录与接口设计；第 4 节待办已按当前落点更新。实际实现采用扁平主进程模块与现有平台隔离层，逐项状态如下：

| 原任务        | 当前状态与落点                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 / 1.1.2 | 已完成：根依赖、锁文件、`electron/tsconfig.json` 与 `check:electron`；独立类型检查，保持前端工程引用稳定            |
| 1.2.1         | 已完成：`electron/data-path.ts` 与 `main.ts`；开发、便携与安装版数据目录分离                                        |
| 1.2.2         | 基础完成：`main.ts` 多窗口、工作区恢复与 `electron-windows.json`；窗口状态由现有业务保存，系统退出持久化继续接续    |
| 1.2.3         | 已完成：应用生产协议与逐窗口授权的本地资源协议；真实读取和拒绝非法令牌已有验证，音视频 Range/Seek 继续专项验证      |
| 1.2.4         | 已完成：固定操作分派、所属窗口/来源校验、类型化错误包络                                                             |
| 1.2.5         | 基础完成：启动、主窗口与托盘；开发图标、单实例和协议唤醒已接入，安装后的系统关联待验证                              |
| 1.3.1 / 1.3.2 | 已完成基础桥接：`preload.ts`、`shared.ts`、`src/platform/electron/` 与 `native/` 兼容入口；Channel 等能力按总纲接续 |
| 1.3.3         | 已完成基础窗口控制：标题栏与 Chromium 拖动区域；物理交互和跨平台材质继续验证                                        |
| 1.4.1–1.4.3   | 已完成：`scripts/electron.ts`、根脚本、双击入口与 electron-builder 本地分发                                         |

本轮新增施工项与待迁移能力统一列在[总纲的代码盘点](./electron-migration-master-plan.md#2026-11-04-代码盘点与本轮接续)，运行方法和实测结果回填[Electron 开发指南](../guide/electron-development.md)。

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
- [x] 确定当前运行时基准：Electron **45.0.0**（本地 PoC 实测 Chromium 156.0.8078.48），前端包管理器沿用 Bun。Electron 包声明的安装工具 Node 要求为 >= 22.12.0，与应用内嵌 Node 运行时分开管理。

> 本地 PoC 已完成 Electron 45 的富文本复测；本计划中的正式 `electron/` 工程、桥接和窗口能力仍按任务进度推进。实测摘要与验证范围见[总纲第 1.2 节](./electron-migration-master-plan.md#12-当前-poc-与实测更新2026-10-27)及[调查附录第 11 节](../design/地基迁移调查/appendix-electron-poc-followup.md#11-electron-45-升级与富文本对照2026-10-27)。

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
        ElectronBin[Electron 45.0.0 Executable]
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

## 4. 实施施工清单（2026-11-04 更新）

### 阶段 1.1：依赖与环境初始化

- [x] **Task 1.1.1：安装并锁定 Electron 核心依赖**
  - 根 `package.json` 与锁文件固定 Electron 45.2.1，使用现有 Node 类型。
- [x] **Task 1.1.2：创建主进程专属 TS 配置**
  - `electron/tsconfig.json` 与 `check:electron` 独立检查主进程、preload 和启动脚本。

### 阶段 1.2：主进程基础架构

- [x] **Task 1.2.1：配置与路径管理**
  - `electron/data-path.ts` 处理显式数据目录、平台默认目录与便携版目录；开发入口使用独立数据目录。
- [x] **Task 1.2.2：基础窗口管理与配置恢复**
  - `electron/main.ts` 管理主/工具窗口，提供窗口事件、控制、工作区恢复和 `electron-windows.json` 读写；现有业务负责显式保存。
- [x] **Task 1.2.3：应用与本地资产协议**
  - `aiohub://app/` 承载生产前端，`asset://local/` 按窗口令牌、精确路径与真实路径授权。
- [x] **Task 1.2.4：窗口控制 IPC**
  - 固定操作分派、来源与所属窗口校验、定向事件、二进制参数和结构化错误已接入。
- [x] **Task 1.2.5：启动、托盘与实例生命周期**
  - 开发图标、显示/隐藏/重启前端/清除配置/退出菜单、最小化恢复、同数据目录单实例与协议转交已接入。
  - 安装包声明 `aiohub` 协议；开发和预览保留当前系统关联。

### 阶段 1.3：预加载与前端门面

- [x] **Task 1.3.1：沙箱 Preload**
  - `electron/preload.ts` 只向顶层文档公开固定类型桥，隔离原生事件对象。
- [x] **Task 1.3.2：平台适配基础链路**
  - `src/platform/electron/` 和 `native/` 兼容现有业务入口；窗口、事件、基础文件/路径、对话框、文本剪贴板、外部打开与基础原生 HTTP 已接入。
  - Channel、文件监听、Shell/Sidecar 与更新对象按总纲阶段二继续。
- [x] **Task 1.3.3：标题栏基础控制**
  - 复用现有 TitleBar 和 Chromium 拖动区域，窗口控制已在真实 Electron 验证。

### 阶段 1.4：启动、构建与分发

- [x] **Task 1.4.1：主进程/Preload 构建**
  - `scripts/electron.ts` 使用 Bun 生成 CommonJS 主进程与沙箱 preload。
- [x] **Task 1.4.2：双进程开发启动器**
  - 同一脚本管理 Vite 与 Electron、端口检查及退出清理；前端热更新，主进程修改后重启。
- [x] **Task 1.4.3：正式脚本与本地分发入口**
  - 根 `electron:*` 与双击脚本覆盖开发、构建、预览、安装器、目录版和便携版。

### 阶段 1.5：剩余收口

- [ ] 窗口移动、缩放与系统退出时的自动持久化，梳理与业务显式保存的责任边界。
- [ ] 音视频资源 Range/Seek 的真实运行专项验证。
- [ ] 物理标题栏拖动、外部文件拖放精确落点、原生文件对话框完整交互。
- [ ] 安装后系统协议关联，以及 macOS/Linux 的窗口、托盘与协议运行验证。
- [x] Dev Control 的 Electron 发现/握手接入：支持开发态与生产资源预览、隔离数据、CDP 多窗口、刷新重连、尺寸调整及启动期诊断；2026-11-04 已在真实 Windows Electron 验证。
- [ ] 独立 WebView、窗口吸附、拖拽预览和跨平台材质的完整契约。

详细验证记录见[Electron 开发指南](../guide/electron-development.md)。

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
