# 升级引导与平台安装架构 (Upgrade & Platform Architecture)

本文档详细阐述 AIO Hub 在应用生命周期管理、版本升级与数据平滑迁移引导体系，以及 Windows NSIS 原生安装包定制的设计与实现。

---

## 1. 升级与迁移引导体系 (Upgrade & Migration Flow)

在 v0.7.0 中，AIO Hub 重构并提取了通用的分步引导框架，彻底规范了“跨版本启动检测 → 迁移步骤编排 → 版本说明展示 → 引导式完成”的闭环流程。

### 1.1 架构分层

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Presentation / View 层                                                  │
│  src/components/common/GuidedFlow/                                      │
│  ├── GuidedFlowHost.vue (全局浮动引导宿主)                               │
│  ├── GuidedFlowShell.vue (弹窗外壳与布局边界)                           │
│  ├── GuidedFlowProgress.vue (点式进度指示器 Dot Stepper)                │
│  ├── GuidedFlowStepper.vue (步骤条控制)                                 │
│  └── GuidedFlowFooter.vue (统一前进/后退/跳过/完成操作按钮)             │
├─────────────────────────────────────────────────────────────────────────┤
│  Flow Implementation (业务流程装配)                                     │
│  src/flows/upgrade/                                                     │
│  ├── upgradeFlowComposer.ts (升级步骤动态编排器)                        │
│  ├── releaseNotesRegistry.ts (版本说明运行时注册表)                     │
│  ├── releaseNotesViewerStore.ts (版本归档与浏览状态管理)                │
│  ├── appLifecycleService.ts (生命周期状态与版本探测)                    │
│  └── 步骤组件:                                                          │
│      ├── UpgradeOverviewStep.vue (升级概览)                             │
│      ├── UpgradeReleaseNotesStep.vue (本版特性速递)                     │
│      ├── UpgradeActionsStep.vue (数据迁移/配置升级执行)                 │
│      ├── UpgradeSummaryStep.vue (迁移结果摘要)                          │
│      └── UpgradeCompleteStep.vue (完成并开启使用)                       │
├─────────────────────────────────────────────────────────────────────────┤
│  Core Service (引导流引擎)                                              │
│  src/services/guided-flow/                                              │
│  ├── guidedFlowManager.ts (状态机、当前步骤推进、事务持久化)             │
│  ├── guidedFlowRegistry.ts (流定义注册中心)                             │
│  └── stepControls.ts (步骤级验证与跳转拦截控制器)                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 通用分步引导容器 (`GuidedFlow`)

`GuidedFlow` 是一个与具体业务解耦的通用引导式工作流组件集（位于 `src/components/common/GuidedFlow/`）：

- **点式进度指示 (Dot Stepper)**：
  - 采用极简优雅的点式指示器（`GuidedFlowProgress.vue`），直观反馈当前所在步骤、已完成步骤及剩余步数，避免传统数字标签或沉重步骤条对内容的视觉喧宾夺主。
- **步骤边界隔离 (Step Boundary Isolation)**：
  - 各步骤通过 `step.component` 动态注入，享有独立的 Props 与局部作用域，组件间通过统一的上下文对象（`UpgradeFlowContext`）进行受控数据流动。
- **状态机与持久化防护**：
  - 核心由 `guidedFlowManager.ts` 管理，包含 `pending`、`in-progress`、`deferred`、`completed`、`failed` 状态机。
  - 用户中途意外关闭、崩溃或推迟引导时，引擎能够安全记录执行位点并在适当时机发起可恢复补偿，杜绝配置迁移流程半途而废导致的数据不一致。

### 1.3 升级面板与版本档案重构 (`src/flows/upgrade/`)

- **运行时动态读取 (Dynamic Release Notes)**：
  - 弃用以往硬编码或编译期模板化的展示方式，将版本说明与发版日志抽象为独立的 Manifest 档案（`src/flows/upgrade/releases/`）。
  - 应用启动时由 `releaseNotesRegistry.ts` 动态加载、解析并建立索引，支持精准比对当前版本与历史版本。
- **历史版本档案检索 (`ReleaseNotesPanel.vue`)**：
  - 提供内建的版本档案检索与浏览面板，用户无需依赖外部网页即可随时在端内回顾历史版本的重大改进、破坏性变动与修复项。
- **五步平滑收敛设计**：
  - 为防止复杂数据迁移（如多模型配置拆分、密钥混淆迁移、知识库索引重构等）让用户产生认知负担，`upgradeFlowComposer.ts` 实施严格的步骤收敛策略：**不论底层迁移任务多寡，对外的交互式流程最多收敛为 5 个核心步骤**（概览 → 特性速递 → 自动执行 → 结果摘要 → 完成），提供流畅且安心的跨版本升级体验。

---

## 2. Windows NSIS 安装程序定制 (`src-tauri/nsis/`)

为了在 Windows 平台上提供原生、现代且企业级的桌面软件交付体验，AIO Hub 替换了 Tauri 默认的简易安装模板，定制了深度增强的 NSIS 安装向导（`src-tauri/nsis/installer.nsi`）。

### 2.1 核心特性与定制设计

1. **自定义安装路径与数据存储路径**：
   - 突破常规打包工具仅能修改主程序安装路径的限制，定制向导不仅允许用户自由选择应用安装目录，还支持指定用户数据与模型配置的默认存储根目录。
   - 注册表中自动维护 `AIOHUB_DATA_REGISTRY_KEY`，实现主程序运行时与安装向导的数据路径无缝对接。
2. **覆盖安装与重新安装版本精准回显**：
   - 安装向导在初始化阶段自动读取注册表中的历史安装元数据（`UNINSTKEY` 与 `MANUPRODUCTKEY`）。
   - 当检测到系统中已存在历史安装时，自动激活覆盖安装（Update Mode）模式：
     - 精准提取已安装版本号（`ExistingVersion`）；
     - 在欢迎与确认界面明确展示：**“检测到已安装版本: X.Y.Z，即将升级为: A.B.C”**；
     - 自动记忆并继承原先的安装路径与数据目录，无需用户再次手动选择，防止重复安装导致的配置撕裂。
3. **视觉一致性与高清 DPI 适配**：
   - 配置专属 Sidebar 侧边栏位图（`sidebar.bmp`）与顶部 Header 图标（`header.bmp`）。
   - 声明 `ManifestDPIAwareness PerMonitorV2`，在 2K/4K 高分屏缩放下始终保持锐利字迹与清晰图标，杜绝模糊发虚。
4. **清理与卸载保护**：
   - 在卸载流程中，严格区分应用二进制文件与用户数据目录；默认仅移除主程序，保护用户本地数据与会话记录不被误清空，同时提供可选的数据彻底清除复选框。
