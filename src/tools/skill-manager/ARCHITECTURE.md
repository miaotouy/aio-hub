# Skill Manager: 架构文档

> 本文档概述 `skill-manager` 工具的核心架构与设计决策。
> 更新日期：2026-11-04

## 1. 核心定位

`skill-manager` 是 AIO 的 **Agent Skills 运行时基础设施**。它负责从本地文件系统加载符合 [Agent Skills 规范](https://agentskills.io/llms.txt) 的 Skill 包，将其桥接到 AIO 的工具调用系统（`toolRegistryManager`），并提供可视化管理界面。

## 2. 分层架构与 UI 设计

下图展示共享前端与 Tauri 后端的关系；Electron 的同职责模块见文末实现说明。

```
┌─────────────────────────────────────────────────────┐
│  UI 层 (View)                                       │
│  SkillManager.vue → SkillManagerPage                │
│  ├─ SkillListPanel (左侧技能索引列表)               │
│  └─ SkillDetailPanel (右侧自说明详情与脚本/权限面板)│
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

### 2.0. 双栏自说明展示 (UI 交互改进 F-01)

管理界面采用左右双栏结构，彻底解决此前技能概览空洞、说明淹没在指令中的问题：

- **左栏（`SkillListPanel`）**：高效浏览已安装技能，提供启用状态切换与快速状态指示。
- **右栏（`SkillDetailPanel`）**：自说明信息展示中心，将技能元数据、详细描述、SKILL.md 核心说明结构化分块呈现；同时**突出展示技能暴露的可用脚本与所需执行权限**，使安全审计一目了然；优化滚动流并解决嵌套滚动冲突。

### 2.1. Backend-First 设计

核心逻辑（扫描、YAML 解析、脚本执行）由宿主后端处理：Tauri 使用 `src-tauri/src/commands/skill_manager.rs`，Electron 使用 `electron/skill-manager.ts` 及其文件、包准备和运行时模块。前端保持同一命令与数据契约，原因：

- **安全性**：宿主后端校验资源和脚本入口路径；Electron 同时核对真实路径，拒绝越界片段和目录内重定向链接
- **性能**：Tauri 利用 rayon 和 `ignore` crate 扫描；Electron 使用异步文件系统与 gitignore 匹配器，遍历保持文件数量和层级上限
- **复用**：沿用宿主的路径、文件操作与执行基础设施；Electron 的文档转换和技能执行共用捕获进程及进程树回收

### 2.2. 前端 TS 层职责

前端 TS 层仅负责：

- 通过 `invoke` 调用统一宿主命令（薄封装）
- 协议适配（沿用 `SkillManifest` 的 camelCase 数据契约）
- UI 呈现与管理交互
- 工具注册与动态方法披露

## 3. 核心服务层

### 3.1. SkillService — Invoke 薄封装

封装所有与 Skill 相关的宿主命令调用（`readResource`、`writeResource`、`listDirectory`、`runScript`、`getAllManifests`）。SkillManagerProxy 的方法实现全部委托给此服务。

### 3.2. SkillLoader — 扫描与缓存管理

负责 Skill 清单的扫描、缓存和生命周期管理。核心职责：

- 调用宿主命令 `get_all_skill_manifests` 获取已解析的 Skill 清单列表
- 本地缓存清单以减少 IPC 开销
- 提供 `uninstallSkill`、`renameSkill`、`getWellKnownPaths` 等管理操作

**搜索路径**（由宿主侧管理）：

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

所有脚本调用由对应宿主的技能后端统一处理：

1. **路径校验**：确认脚本在 `scripts/` 目录下，拒绝 `../` 穿越
2. **运行时探测**：按优先级 `bun → node → python` 探测可用引擎
3. **工作目录**：以 Skill 根目录启动脚本。该设置用于相对路径解析；脚本使用宿主账户权限，安装和运行前需确认来源可信
4. **超时控制**：默认 60 秒超时

## 6. 数据流

### 6.1. 启动流程

```
应用启动 → 加载配置 → toolRegistryManager.register(SkillBridgeFactory)
→ createRegistries() → SkillLoader.scanAll()
→ invoke("get_all_skill_manifests") → 宿主扫描 + YAML 解析
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
| 架构模式     | Backend-First（宿主驱动） | 安全性 + 性能 + 复用现有宿主基础设施 |
| 工具注册模式 | 单代理聚合披露             | 界面清爽，支持精细的方法级开关控制     |
| 注入策略     | 渐进式披露 (方法返回型)    | 遵循规范，且对 LLM 缓存更友好          |
| 脚本执行模式 | 封闭式（禁止通用 CLI）     | 安全优先，通用 CLI 由独立工具提供      |

## 8. 文件结构

```
src/tools/skill-manager/
├── types/index.ts                    # 类型定义（与 Rust 结构体对齐）
├── services/
│   ├── SkillService.ts               # Invoke 薄封装层（底层宿主命令调用）
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
- **宿主 Backend**：提供扫描、读写、执行、安装、卸载、重命名和集合包管理等 23 个宿主命令；Electron 沿用同一接口。
- **错误处理**: `SkillInstallDialog` 的识别失败和安装失败统一通过 `createModuleErrorHandler("skill-manager/install-dialog")` 处理，不在组件内直接拼接异常文本调用全局提示；保持模块日志、错误上下文和用户提示的一致性。
- **测试约束**: Agent 接口的核心暴露路径必须由测试保护；扩展 Skill 包解析或安装流程时，应同时覆盖解析失败、安装失败和 Agent 调用边界。

## 宿主终端与运行时

`auto-detect` 终端偏好按宿主平台解析为 Windows PowerShell、Linux Bash、macOS Zsh，显式终端和命令串联偏好优先。上下文中的运行时命令表示配置与探测候选，实际脚本启动由宿主后端解析：Python 在 Unix 优先 `python3`，Windows 优先 `python`；PowerShell 在 Unix 优先 `pwsh`，Windows 优先 `powershell`。空配置按候选的可用性选择；显式可执行文件路径保持优先。

## Electron 宿主实现

- `electron/skill-files.ts` 负责 YAML 元数据、脚本/资源索引及 gitignore。用户技能位于应用数据目录的 `skills/`；外部技能仅按显式启用的扫描路径加载。外部目录链接可作为技能根目录，目录内资源访问仍检查真实路径。
- 内置模板在构建时复制到 Electron 运行目录，打包后读取 `resources/skills`；安装后形成可编辑的用户副本，并写入 `metadata.installedFrom: builtin`。重置使用随包模板。
- `electron/skill-packages.ts` 处理本地目录、ZIP、HTTP(S) 链接和 Git 克隆，支持常见 ZIP 外层目录及标准技能集合目录。下载和 Git 操作有超时；ZIP 校验原始条目名、重名、链接、路径冲突、展开大小与 CRC。
- 安装先复制到独立暂存目录，校验后按目录切换。自定义名称只修改安装副本；后续切换失败时回滚先前替换。集合包覆盖技能时转移归属，旧包卸载仅删除其当前拥有的技能。恢复失败时保留恢复目录并返回处理提示。
- `electron/skill-runtime.ts` 按配置或可用候选选择运行时，以独立参数启动脚本，保留标准输出、标准错误与退出码。脚本限时为 1–1800 秒，默认 60 秒，总输出上限 4 MiB；超时、输出溢出和应用退出会回收本次进程树，退出同时等待进行中的安装和资源写入完成。通用捕获执行器与文档转换共用。
- 资源读写仅限已发现的技能目录，兼容环境变量文件的显式访问；扫描索引跳过隐藏文件和依赖/构建目录。外部技能资源访问随扫描总开关即时生效。脚本入口限定在技能的 `scripts/` 下。
- 单个文本资源上限 8 MiB，技能说明上限 2 MiB；ZIP 上限 256 MiB、单文件 256 MiB、总展开 1 GiB、20,000 个文件条目。

安装对话框直接安装已完成识别的目录，ZIP、下载和 Git 单技能安装复用同一份准备结果；临时源在安装成功、返回、切换来源或关闭后清理，本地源保持原样。异步识别完成时核对当前来源代次，关闭或切换后返回的结果只执行临时清理。
