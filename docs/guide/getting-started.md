# 开发环境搭建

本篇用于快速搭好 AIO Hub 的本地开发环境。项目使用 Bun、Tauri v2、Vue 3、TypeScript 和 Rust；命令以当前仓库 `package.json` 中的 scripts 为准。

## 前置软件

| 软件                 | 用途                       |
| :------------------- | :------------------------- |
| Bun                  | 前端包管理与脚本运行       |
| Rust                 | Tauri 后端编译             |
| Tauri CLI            | 启动和打包桌面应用         |
| WebView2             | Windows 运行 Tauri WebView |
| Android / iOS 工具链 | 仅移动端开发需要           |

Windows 用户建议先安装 Visual Studio Build Tools，并勾选 C++ 桌面开发相关组件。

## 获取依赖

在仓库根目录执行：

```bash
bun install
```

不要改用 npm、yarn 或 pnpm。仓库锁文件和脚本均以 Bun 为准。

## 常用命令

```bash
bun run dev
```

启动桌面端开发环境。

```bash
bun run tauri:dev
```

直接通过 Tauri 启动真实桌面窗口。

```bash
bun run docs:dev
```

启动文档开发服务器。

```bash
bun run docs:build
```

构建并验证文档站点。

```bash
bun run check:frontend
```

运行前端类型检查。

```bash
bun run check:backend
```

运行 Rust 后端检查。

完整脚本请以根目录 `package.json` 为准。

## 桌面端调试

涉及 Tauri API、窗口、插件、文件系统或 IPC 的功能，必须使用 Tauri 窗口验证。普通浏览器只能用于纯前端外观检查，不能代表真实运行态。

推荐流程：

1. 执行 `bun run tauri:dev`。
2. 在 Tauri 窗口中复现功能。
3. 打开 WebView DevTools 查看控制台和 DOM。
4. 同时观察后端终端输出。

## 移动端开发

移动端代码在 `mobile/` 目录，使用独立的 Tauri 移动端配置。根目录提供快捷脚本：

```bash
bun run mtad
```

启动 Android 开发。

```bash
bun run mtab
```

构建 Android。

```bash
bun run mtid
```

启动 iOS 开发。

```bash
bun run mtib
```

构建 iOS。

移动端工具链依赖 Android Studio、Xcode 和对应平台 SDK。首次配置耗时较长，建议先确认桌面端能正常启动。

## 文档开发

用户教程位于 `docs/user-guide/`，开发指南位于 `docs/guide/`，架构文档位于 `docs/architecture/`。

新增文档后记得：

1. 更新 `docs/.vitepress/config.ts` 侧边栏。
2. 使用相对链接连接相关教程。
3. 运行 `bun run docs:build` 检查构建。

## 常见问题

### 为什么不能直接用浏览器打开 Vite 页面验证？

普通浏览器没有 Tauri 注入的 IPC、插件和窗口运行时。只看页面布局可以用浏览器；验证真实功能必须用 Tauri 窗口。

### Rust 编译失败怎么办？

先确认 Rust 工具链、系统构建工具和平台 SDK 已安装。Windows 下重点检查 Visual Studio Build Tools，macOS 下检查 Xcode Command Line Tools。

### 文档构建失败怎么办？

优先查看报错文件和行号。常见原因包括 Markdown 表格格式错误、未包裹 Vue 模板语法、链接路径错误或代码块 fence 没有闭合。

### 应该运行完整 `bun run check` 吗？

改动范围小时可以先运行对应检查。提交前建议运行完整检查；但后端、移动端检查耗时更长，需要根据当前改动范围选择。
