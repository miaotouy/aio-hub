# 插件系统开发下一步计划

本文档基于对当前插件系统实现进度的全面调查，旨在明确后续开发工作的重点和方向。

当前，**JavaScript 插件** 的核心基础设施（包括加载、执行、配置、UI管理）已全部完成且功能完善。后续工作应聚焦于以下两个核心领域：

## 1. 阶段一：实现 Sidecar 插件支持

这是优先级最高的任务，旨在解锁应用处理原生依赖和计算密集型任务的能力。

-   **任务状态**: `未开始`
-   **关联设计**: [`docs/plugin-system-design.md`](docs/plugin-system-design.md) (章节 3.2, 6.4)

### 实施要点：

1.  **后端支持 (Rust)**:
    -   在 `src-tauri/src/lib.rs` 或新建的模块中，创建一个 `execute_sidecar` 的 Tauri 指令。
    -   该指令需要能根据 `manifest.json` 中的平台信息 (`executable`) 启动对应的外部进程。
    -   实现通过标准输入输出 (`stdin/stdout`) 与子进程进行通信，并能实时地将子进程的输出（进度、结果、错误）通过事件 (`Event`) 发送回前端。

2.  **前端适配**:
    -   在 `src/services/` 目录下创建 `sidecar-plugin-adapter.ts`。
    -   该适配器需要实现 `PluginProxy` 接口，其方法在被调用时，应通过 `invoke` 调用后端的 `execute_sidecar` 指令。
    -   适配器需要监听从后端转发来的 Sidecar 进程事件，并将结果返回给调用方 (`Executor`)。
    -   修改 `plugin-loader.ts`，使其在遇到 `type: "sidecar"` 的插件时，使用 `SidecarPluginAdapter` 进行加载和实例化。

## 2. 阶段二：构建插件市场生态

完成插件的发现、分发和生命周期管理，形成完整的生态闭环。

-   **任务状态**: `UI 占位符阶段`
-   **关联设计**: [`docs/plugin-system-design.md`](docs/plugin-system-design.md) (章节 4.1, 4.2)

### 实施要点：

1.  **市场服务逻辑**:
    -   创建一个新的服务（例如 `plugin-market.service.ts`）。
    -   实现从远程 Git 仓库获取 `index.json` 插件索引的功能。
    -   根据客户端的操作系统和架构，对插件列表进行智能过滤和展示。

2.  **安装与更新流程**:
    -   实现插件包（`.zip`）的下载功能。
    -   在 Rust 后端创建一个 `install_plugin_from_zip` 指令，负责解压插件包到 `appDataDir/plugins/` 目录，并进行必要的校验。
    -   在 `PluginMarket.vue` 中实现一键安装、更新和卸载的交互逻辑。

3.  **完善 UI**:
    -   将 `PluginMarket.vue` 从静态占位符改造为能够动态展示、搜索和筛选插件的完整市场界面。