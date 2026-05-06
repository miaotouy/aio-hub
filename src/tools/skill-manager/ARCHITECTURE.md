# Skill Manager: 架构文档

> 本文档概述 `skill-manager` 工具的核心架构与设计决策。完整的实施细节请参阅 [设计报告](docs/skill-manager-design.md)。

## 1. 核心定位

`skill-manager` 是 AIO 的 **Agent Skills 运行时基础设施**。它负责从本地文件系统加载符合 [Agent Skills 规范](https://agentskills.io/llms.txt) 的 Skill 包，将其桥接到 AIO 的工具调用系统（`toolRegistryManager`），并提供可视化管理界面。

## 2. 分层架构

```
┌─────────────────────────────────────────────────────┐
│  UI 层 (View)                                       │
│  SkillManager.vue → SkillManagerPage → Panels       │
├─────────────────────────────────────────────────────┤
│  组合层 (Composable)                                 │
│  useSkillManager — UI ↔ Store/Service 粘合剂          │
├─────────────────────────────────────────────────────┤
│  状态层 (Store)                                      │
│  skillManagerStore — 配置 + 清单缓存 + 激活状态       │
├──────────────────────┬──────────────────────────────┤
│  服务层 (Service) — TS│  Rust 后端层 (Backend)       │
│                      │                              │
│  SkillLoader         │  skill_manager.rs            │
│  (薄封装, invoke)     │  ├─ 目录扫描 (ignore crate)    │
│                      │  ├─ YAML frontmatter 解析     │
│  SkillBridgeFactory  │  ├─ 脚本安全执行 (路径锁定)    │
│  (ToolRegistryFactory)│  ├─ 文件安全读取 (防穿越)     │
│                      │  └─ Skill 安装 (复制+校验)    │
│  SkillProxy          │                              │
│  (ToolRegistry, 每Skill一个)                         │
│                      │                              │
│  SkillManagerProxy   │                              │
│  (ToolRegistry, 系统级单例)                          │
├──────────────────────┴──────────────────────────────┤
│  外部集成                                           │
│  toolRegistryManager · tool-calling · configManager │
└─────────────────────────────────────────────────────┘
```

### 2.1. Backend-First 设计

核心逻辑（扫描、YAML 解析、脚本执行）全部下沉到 Rust 后端（`src-tauri/src/commands/skill_manager.rs`），原因：

- **安全性**：Rust 侧强制执行路径沙箱，防止 Skill 脚本通过 `../` 越权访问
- **性能**：利用 `ignore` crate（ripgrep 引擎）并行扫描大量 Skill 目录
- **复用**：Rust 侧已有 `SidecarExecuteRequest`、`PluginManifest`、`read_text_file_force` 等成熟组件

### 2.2. 前端 TS 层职责

前端 TS 层仅负责：

- 通过 `invoke` 调用 Tauri 命令（薄封装）
- 协议适配（将 Rust 返回的 `SkillManifest` 映射为 TS 类型）
- UI 呈现与管理交互

## 3. 核心服务层

### 3.1. SkillLoader — 前端薄封装

调用 Rust 命令 `get_all_skill_manifests` 获取已解析的 Skill 清单列表，本地缓存以减少 IPC 开销。

**搜索路径**（由 Rust 侧管理）：

| 优先级 | 路径                    | 说明             |
| ------ | ----------------------- | ---------------- |
| 1      | `{appDataDir}/skills/`  | 用户安装的 Skill |
| 2      | `{AIO资源目录}/skills/` | AIO 内置 Skill   |

### 3.2. SkillBridgeFactory — 桥接工厂

实现 `ToolRegistryFactory` 接口，参考 `VcpBridgeFactory` 的工厂模式。在 `createRegistries()` 中：

1. 检查总开关 `config.enabled`，关闭时返回空数组
2. 调用 `SkillLoader.scanAll()` 获取清单
3. 为每个未禁用的 Skill 创建 `SkillProxy`
4. 返回 `[skillManagerProxy, ...skillProxies]`

支持热加载：`refreshManifests()` → 清缓存 → 注销工厂 → 重新注册。

### 3.3. SkillProxy — 技能代理

实现 `ToolRegistry` 接口，每个 Skill 一个实例（ID: `skill:{name}`）。

**核心职责**：

- **`getMetadata()`**：暴露 `activate` 方法（agentCallable）
- **`getExtraPromptContext()`**：渐进式披露
  - 未激活：摘要（~100 tokens）
  - 已激活：完整 SKILL.md + scripts/references 索引 + 通用工具调用指引
- **`activate()`**：切换激活状态，更新 Store

**设计原则**：SkillProxy **不注册脚本方法**。脚本执行和文件读取由系统级 `SkillManagerProxy` 提供。

### 3.4. SkillManagerProxy — 系统级通用工具

**单例** `ToolRegistry`（ID: `skill:system`），暴露三个 `agentCallable` 方法：

| 方法               | 用途                              | 安全机制               |
| ------------------ | --------------------------------- | ---------------------- |
| `skill_run_script` | 执行 Skill 内部 scripts/ 下的脚本 | Rust 侧路径锁定 + 超时 |
| `skill_read_file`  | 读取 Skill 目录内的文本文件       | Rust 侧路径沙箱        |
| `skill_list_dir`   | 列出 Skill 目录结构               | Rust 侧路径沙箱        |

所有方法直接委托给 Rust 命令，前端不做任何安全判断。

## 4. 渐进式披露策略

遵循 Agent Skills 规范的 "Progressive Disclosure" 理念：

```
Level 1 (Metadata)     → 启动时注入所有 Skill 的 name + description (~100 tokens/skill)
Level 2 (Instructions) → 激活后注入完整 SKILL.md + 资源索引
Level 3 (Resources)    → LLM 按需调用 skill_read_file / skill_list_dir 获取
```

## 5. 脚本安全执行

所有脚本调用由 Rust 侧 `skill_manager.rs` 统一处理：

1. **路径校验**：确认脚本在 `scripts/` 目录下，拒绝 `../` 穿越
2. **运行时探测**：按优先级 `bun → node → python` 探测可用引擎
3. **进程隔离**：`current_dir` 锁定在 Skill 根目录
4. **超时控制**：默认 60 秒超时
5. **输出捕获**：同时捕获 stdout/stderr，通过事件通道推送

## 6. 数据流

### 6.1. 启动流程

```
应用启动 → 加载配置 → toolRegistryManager.register(SkillBridgeFactory)
→ createRegistries() → SkillLoader.scanAll()
→ invoke("get_all_skill_manifests") → Rust 并行扫描 + YAML 解析
→ 创建 SkillManagerProxy + N×SkillProxy → 注册完成
```

### 6.2. Skill 激活流

```
LLM 看到 Skill 摘要 → 调用 skill:{name}.activate()
→ SkillProxy._activated = true → Store 更新 activeSkillNames
→ 下一轮对话 → getExtraPromptContext() 返回完整指令
```

### 6.3. 脚本执行流

```
LLM 调用 skill:system.skill_run_script(skillId, scriptName, args)
→ SkillManagerProxy → invoke("run_skill_script", ...)
→ Rust 校验路径 → 探测运行时 → tokio::process::Command（cwd 锁定）
→ stdout/stderr/exitCode → 返回 LLM
```

## 7. 关键设计决策

| 决策            | 选择                            | 理由                                     |
| --------------- | ------------------------------- | ---------------------------------------- |
| 架构模式        | Backend-First（Rust 驱动）      | 安全性 + 性能 + 复用现有 Rust 基础设施   |
| 工具注册模式    | 工厂模式（ToolRegistryFactory） | 与 VcpBridgeFactory 一致，支持热加载     |
| ID 前缀         | `skill:`                        | 防止与 VCP（`vcp:`）及其他工具 ID 冲突   |
| 脚本执行模式    | 封闭式（禁止通用 CLI）          | 安全优先，通用 CLI 由独立工具提供        |
| Prompt 注入策略 | 渐进式披露                      | 遵循 Agent Skills 规范，避免 Prompt 膨胀 |
| 配置持久化      | configManager + store           | 配置存 config.json，激活状态仅内存       |

## 8. 文件结构

```
src/tools/skill-manager/
├── types/index.ts                    # 类型定义（与 Rust 结构体对齐）
├── services/
│   ├── SkillLoader.ts                # 薄封装层（调用 Rust 命令）
│   ├── SkillBridgeFactory.ts         # 桥接工厂（ToolRegistryFactory）
│   ├── SkillProxy.ts                 # 技能代理（ToolRegistry）
│   └── SkillManagerProxy.ts          # 系统级代理（ToolRegistry）
├── stores/skillManagerStore.ts       # 配置 + 清单 + 激活状态
├── composables/useSkillManager.ts    # UI ↔ Store/Service 粘合
├── components/
│   ├── SkillManagerPage.vue          # 主页面
│   ├── SkillListPanel.vue            # 列表（搜索/过滤/状态标签）
│   ├── SkillDetailPanel.vue          # 详情（Markdown 渲染 + 开关）
│   ├── SkillInstallDialog.vue        # 安装（本地/Git/URL）
│   └── SkillScanSettings.vue         # 外部扫描路径设置
├── skill-manager.registry.ts         # 工具 UI 注册 + SkillBridgeFactory 导出
└── SkillManager.vue                  # 主容器

src-tauri/src/commands/
└── skill_manager.rs                  # Rust 引擎（扫描 + 解析 + 安全执行）
```

## 9. 与现有系统的集成点

- **toolRegistryManager**：SkillBridgeFactory 注册为工厂，SkillProxy/SkillManagerProxy 作为 ToolRegistry 管理
- **tool-calling**：所有 `agentCallable` 方法出现在 LLM 可用工具列表中；`getExtraPromptContext()` 由 `getToolContexts()` 聚合
- **configManager**：Skill 管理配置（总开关、禁用列表、外部扫描路径）持久化
- **Rust Backend**：5 个 Tauri 命令（`get_all_skill_manifests`, `run_skill_script`, `read_skill_resource`, `list_skill_directory`, `install_skill_from_dir`）

## 10. 亮点

- **Backend-First 安全架构**：Rust 侧路径沙箱 + 运行时探测 + 超时控制
- **渐进式披露**：最小化 Prompt 占用，按需激活完整指令
- **工厂桥接模式**：无缝接入 AIO 工具调用系统，支持热加载
- **双代理设计**：SkillProxy（激活+上下文）与 SkillManagerProxy（脚本/文件操作）职责分离
- **外部扫描**：支持从任意本地目录扫描 Skill，满足开发调试场景
