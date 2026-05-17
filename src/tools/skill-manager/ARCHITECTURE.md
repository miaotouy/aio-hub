# Skill Manager: 架构文档

> 本文档概述 `skill-manager` 工具的核心架构与设计决策。
> 更新日期：2026-5-17

## 1. 核心定位

`skill-manager` 是 AIO 的 **Agent Skills 运行时基础设施**。它负责从本地文件系统加载符合 [Agent Skills 规范](https://agentskills.io/llms.txt) 的 Skill 包，将其桥接到 AIO 的工具调用系统（`toolRegistryManager`），并提供可视化管理界面。

## 2. 分层架构

```
┌─────────────────────────────────────────────────────┐
│  UI 层 (View)                                       │
│  SkillManager.vue → SkillManagerPage → Panels       │
├─────────────────────────────────────────────────────┤
│  组合层 (Composable)                                │
│  useSkillManager — UI ↔ Store/Service 粘合剂        │
├─────────────────────────────────────────────────────┤
│  状态层 (Store)                                     │
│  skillManagerStore — 配置 + 清单缓存 + 运行时状态   │
├───────────────────────┬─────────────────────────────┤
│  服务层 (Service) — TS│  Rust 后端层 (Backend)      │
│                       │                             │
│  SkillService         │  skill_manager.rs           │
│  (薄封装, invoke)     │  ├─ 目录扫描 (rayon 并行)   │
│                       │  ├─ 文件遍历 (ignore crate) │
│  SkillLoader          │  ├─ YAML frontmatter 解析   │
│  (扫描+缓存+管理)     │  ├─ 脚本安全执行 (路径锁定) │
│                       │  ├─ 文件安全读写 (防穿越)   │
│  SkillBridgeFactory   │  ├─ Skill 安装 (复制+校验)  │
│  (ToolRegistryFactory)│  ├─ Skill 卸载/重命名       │
│                       │  └─ Well-known 路径探测     │
│  SkillManagerProxy    │                             │
│  (ToolRegistry, 单例) │                             │
│  (承载所有 Skill 方法)│                             │
├───────────────────────┴─────────────────────────────┤
│  外部集成                                           │
│  toolRegistryManager · tool-calling · configManager │
└─────────────────────────────────────────────────────┘
```

### 2.1. Backend-First 设计

核心逻辑（扫描、YAML 解析、脚本执行）全部下沉到 Rust 后端（`src-tauri/src/commands/skill_manager.rs`），原因：

- **安全性**：Rust 侧强制执行路径沙箱，防止 Skill 脚本通过 `../` 越权访问
- **性能**：利用 rayon 并行扫描 Skill 目录，`ignore` crate（ripgrep 引擎）高效遍历 Skill 内部文件
- **复用**：Rust 侧已有 `SidecarExecuteRequest`、`PluginManifest`、`read_text_file_force` 等成熟组件

### 2.2. 前端 TS 层职责

前端 TS 层仅负责：

- 通过 `invoke` 调用 Tauri 命令（薄封装）
- 协议适配（将 Rust 返回的 `SkillManifest` 映射为 TS 类型）
- UI 呈现与管理交互
- 工具注册与动态方法披露

## 3. 核心服务层

### 3.1. SkillService — Invoke 薄封装

封装所有与 Skill 相关的 Tauri 命令调用（`readResource`、`writeResource`、`listDirectory`、`runScript`、`getAllManifests`）。SkillManagerProxy 的方法实现全部委托给此服务。

### 3.2. SkillLoader — 扫描与缓存管理

负责 Skill 清单的扫描、缓存和生命周期管理。核心职责：

- 调用 Rust 命令 `get_all_skill_manifests` 获取已解析的 Skill 清单列表
- 本地缓存清单以减少 IPC 开销
- 提供 `uninstallSkill`、`renameSkill`、`getWellKnownPaths` 等管理操作

**搜索路径**（由 Rust 侧管理）：

| 优先级 | 路径                    | 说明             |
| ------ | ----------------------- | ---------------- |
| 1      | `{appDataDir}/skills/`  | 用户安装的 Skill |
| 2      | `{AIO资源目录}/skills/` | AIO 内置 Skill   |

### 3.3. SkillBridgeFactory — 桥接工厂

实现 `ToolRegistryFactory` 接口。在 `createRegistries()` 中：

1. 检查总开关 `config.enabled`，关闭时返回空数组
2. 调用 `SkillLoader.scanAll()` 预加载清单
3. 返回单例的 `[skillManagerProxy]`

支持热加载：`refresh()` → 重新扫描清单 → 注销工厂 → 重新注册。

### 3.4. SkillManagerProxy — 聚合代理

单例 `ToolRegistry`（ID: `skill:system`），是 Skill 能力向 Agent 披露的唯一入口。

**核心职责**：

- **动态方法披露**：在 `getMetadata()` 中根据已启用的 Skill 动态生成 `activate_<name>` 方法。
- **渐进式披露实现**：`activate_<name>` 方法的描述（Description）承载了 Skill 的摘要信息。调用该方法将返回 Skill 的完整指令。
- **通用资源操作**：提供 `skill_run_script`、`skill_read_file` 和 `skill_list_dir` 三个通用工具。

### 3.5. 工具定义概览

| 方法               | 类型 | 用途                                       |
| ------------------ | ---- | ------------------------------------------ |
| `activate_<name>`  | 动态 | 激活特定技能，返回其完整指令与宿主环境信息 |
| `skill_run_script` | 通用 | 执行 Skill 内部 scripts/ 下的脚本          |
| `skill_read_file`  | 通用 | 读取 Skill 目录内的文本文件                |
| `skill_list_dir`   | 通用 | 列出 Skill 目录结构                        |

## 4. 渐进式披露策略

遵循 Agent Skills 规范的 "Progressive Disclosure" 理念，通过方法调用实现：

```
Level 1 (Metadata)     → 启动时注入 SkillManagerProxy 的 activate_<name> 方法描述 (摘要)
Level 2 (Instructions) → LLM 调用 activate_<name>，方法返回完整 SKILL.md + 资源索引 + 宿主环境信息
Level 3 (Resources)    → LLM 按需调用 skill_read_file / skill_list_dir 获取具体文件内容
```

这种模式对 LLM 的 **前缀缓存 (Prefix Caching)** 极其友好，因为完整指令只有在真正需要时才会作为工具执行结果注入对话流，而不是每轮对话都重复出现在 System Prompt 中。

## 5. 脚本安全执行

所有脚本调用由 Rust 侧 `skill_manager.rs` 统一处理：

1. **路径校验**：确认脚本在 `scripts/` 目录下，拒绝 `../` 穿越
2. **运行时探测**：按优先级 `bun → node → python` 探测可用引擎
3. **进程隔离**：`current_dir` 锁定在 Skill 根目录
4. **超时控制**：默认 60 秒超时

## 6. 数据流

### 6.1. 启动流程

```
应用启动 → 加载配置 → toolRegistryManager.register(SkillBridgeFactory)
→ createRegistries() → SkillLoader.scanAll()
→ invoke("get_all_skill_manifests") → Rust 并行扫描 + YAML 解析
→ 注册 SkillManagerProxy → 注册完成
```

### 6.2. Skill 激活流

```
LLM 在工具列表中看到 activate_<name> 方法描述 (摘要)
→ LLM 调用 skill:system.activate_<name>()
→ SkillManagerProxy 实时构造并返回该技能的完整上下文 (SKILL.md + 资源索引 + 宿主环境)
→ LLM 获得操作该技能所需的全部知识
```

## 7. 关键设计决策

| 决策         | 选择                       | 理由                                   |
| ------------ | -------------------------- | -------------------------------------- |
| 架构模式     | Backend-First（Rust 驱动） | 安全性 + 性能 + 复用现有 Rust 基础设施 |
| 工具注册模式 | 单代理聚合披露             | 界面清爽，支持精细的方法级开关控制     |
| 注入策略     | 渐进式披露 (方法返回型)    | 遵循规范，且对 LLM 缓存更友好          |
| 脚本执行模式 | 封闭式（禁止通用 CLI）     | 安全优先，通用 CLI 由独立工具提供      |

## 8. 文件结构

```
src/tools/skill-manager/
├── types/index.ts                    # 类型定义（与 Rust 结构体对齐）
├── services/
│   ├── SkillService.ts               # Invoke 薄封装层（底层 Tauri 命令调用）
│   ├── SkillLoader.ts                # 扫描 + 缓存 + 生命周期管理
│   ├── SkillBridgeFactory.ts         # 桥接工厂（ToolRegistryFactory）
│   └── SkillManagerProxy.ts          # 聚合系统代理 (承载所有动态方法)
├── stores/skillManagerStore.ts       # 配置 + 清单缓存 + 运行时状态
├── composables/useSkillManager.ts    # UI ↔ Store/Service 粘合
├── components/
│   ├── SkillManagerPage.vue          # 主页面布局
│   ├── SkillListPanel.vue            # 技能列表面板
│   ├── SkillDetailPanel.vue          # 技能详情面板
│   ├── SkillInstallDialog.vue        # 安装对话框
│   └── SkillScanSettings.vue         # 扫描路径设置
├── skill-manager.registry.ts         # 工具 UI 注册
└── SkillManager.vue                  # 主容器
```

## 9. 与现有系统的集成点

- **toolRegistryManager**：SkillBridgeFactory 注册为工厂，SkillManagerProxy 作为单例 ToolRegistry 管理。
- **tool-calling**：所有 `agentCallable` 方法出现在 LLM 可用工具列表中。
- **configManager**：Skill 管理配置（总开关、禁用列表、外部扫描路径）持久化。
- **Rust Backend**：提供扫描、读写、执行、安装、卸载、重命名等 13 个 Tauri 命令。
