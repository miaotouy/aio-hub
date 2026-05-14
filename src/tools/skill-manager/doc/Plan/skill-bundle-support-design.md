# Skill Bundle 支持设计方案

> **状态**: RFC (Request for Comments)
> **日期**: 2025-05-14
> **触发**: 社区出现了如 [minecraft-agent-skills](https://github.com/Jahrome907/minecraft-agent-skills) 这样的集合型仓库（单仓库包含 13 个独立 Skill），当前架构无法优雅处理。

## 1. 问题陈述

### 1.1. 现有架构的限制

当前 Rust 侧扫描逻辑 (`scan_skills_in_dir_parallel`) 只检查指定目录的**直接子目录**是否包含 `SKILL.md`：

```rust
// skill_manager.rs:166-186
fn scan_skills_in_dir_parallel(dir: &Path, source: &str) -> Vec<SkillManifest> {
    let entries: Vec<PathBuf> = fs::read_dir(dir)  // 只读一层
        .map(|e| e.flatten().map(|entry| entry.path()).collect())
        .unwrap_or_default();
    entries.into_par_iter()
        .filter(|path| path.is_dir())
        .filter_map(|path| parse_skill_directory_sync(&path, source))
        .collect()
}
```

安装流程 (`install_skill_from_git`) 克隆仓库后只能安装**一个** skill：

```rust
// skill_manager.rs:743
let manifest = install_skill_internal(&app, &clone_dir, custom_name).await?;
```

`find_skill_directory` 只返回**第一个**匹配的目录（最多两层深度）。

### 1.2. 集合包的典型结构

以 `minecraft-agent-skills` 为例：

```
repo-root/
├── .agents/skills/          ← 规范路径
│   ├── minecraft-modding/SKILL.md
│   ├── minecraft-plugin-dev/SKILL.md
│   ├── minecraft-datapack/SKILL.md
│   └── ... (共 13 个)
├── package.json             ← 有版本号
├── README.md
└── LICENSE
```

### 1.3. 用户期望

| 操作          | 当前能力              | 期望能力                          |
| ------------- | --------------------- | --------------------------------- |
| 安装集合包    | ❌ 只能装第一个 skill | ✅ 一次安装全部/选中的 skill      |
| 整体启用/禁用 | ❌                    | ✅ 按 bundle 批量切换             |
| 整体卸载      | ❌ 需逐个删除         | ✅ 一键卸载整个 bundle            |
| 更新          | ❌ 无版本追踪         | ✅ 检测新版本并整体更新           |
| 来源追溯      | ⚠️ 只有 source 字段   | ✅ 知道每个 skill 属于哪个 bundle |
| UI 分组展示   | ❌ 扁平列表           | ✅ 按 bundle 分组                 |

## 2. 设计方案

### 2.1. 核心概念：Bundle Manifest

引入一个轻量的 **Bundle 清单文件** (`bundle.yaml`)，放在集合包根目录：

```yaml
# bundle.yaml
name: minecraft-agent-skills
version: 2.4.2
description: "13 AI agent skills covering every major area of Minecraft development"
author: Jahrome907
source_url: https://github.com/Jahrome907/minecraft-agent-skills
license: MIT

# 告诉扫描器去哪找 skill 目录
skills_path: .agents/skills/

# 可选：显式列出包含的 skill（用于校验和选择性安装）
skills:
  - minecraft-modding
  - minecraft-plugin-dev
  - minecraft-datapack
  - minecraft-commands-scripting
  - minecraft-multiloader
  - minecraft-testing
  - minecraft-ci-release
  - minecraft-world-generation
  - minecraft-resource-pack
  - minecraft-imagegen
  - minecraft-server-admin
  - minecraft-worldedit-ops
  - minecraft-essentials-ops
```

### 2.2. 自动探测策略（无 bundle.yaml 时）

并非所有集合包都会提供 `bundle.yaml`。系统需要一个**自动探测**机制：

```
探测优先级：
1. 根目录有 bundle.yaml → 按其 skills_path 定位
2. 根目录有 SKILL.md → 单 skill（现有逻辑）
3. 根目录下有 .agents/skills/ → 扫描该目录
4. 根目录下有 .codex/skills/ → 扫描该目录
5. 根目录下有 .claude/skills/ → 扫描该目录
6. 根目录下有 skills/ → 扫描该目录
7. 根目录的直接子目录中有多个包含 SKILL.md 的 → 视为集合包
8. 以上都不满足 → 安装失败
```

### 2.3. 存储结构

Bundle 安装后的物理存储：

```
{appDataDir}/skills/
├── _bundles/                          ← Bundle 元数据目录
│   └── minecraft-agent-skills.json    ← Bundle 清单 + 安装信息
├── minecraft-modding/SKILL.md         ← 实际 skill（扁平存放）
├── minecraft-plugin-dev/SKILL.md
├── minecraft-datapack/SKILL.md
└── ...
```

**设计决策**：Skill 仍然扁平存放在 `skills/` 下，而非嵌套在 bundle 子目录中。

**理由**：

- 向后兼容：现有扫描逻辑无需修改
- 简单性：skill_id 仍然是目录名，所有现有的脚本执行、文件读取逻辑不变
- Bundle 信息通过 `_bundles/` 目录的元数据文件追踪

### 2.4. Bundle 元数据文件

`_bundles/{bundle-name}.json` 结构：

```typescript
interface BundleMetadata {
  /** Bundle 名称 */
  name: string;
  /** 版本号 */
  version: string;
  /** 描述 */
  description?: string;
  /** 作者 */
  author?: string;
  /** 来源 URL（Git 仓库或下载链接） */
  sourceUrl?: string;
  /** 许可证 */
  license?: string;
  /** 包含的 skill ID 列表 */
  skillIds: string[];
  /** 安装时间 */
  installedAt: string; // ISO 8601
  /** 安装方式 */
  installMethod: "git" | "zip" | "dir" | "zip-url";
  /** 原始 skills_path（用于更新时定位） */
  skillsPath?: string;
}
```

### 2.5. 数据流变更

#### 2.5.1. 安装流程（新增 Bundle 分支）

```mermaid
flowchart TD
    A[用户触发安装] --> B{输入类型}
    B -->|Git URL| C[克隆到临时目录]
    B -->|ZIP 文件| D[解压到临时目录]
    B -->|本地目录| E[直接使用]

    C --> F[探测包结构]
    D --> F
    E --> F

    F --> G{是集合包?}
    G -->|否| H[现有单 skill 安装逻辑]
    G -->|是| I[解析 Bundle 信息]

    I --> J[展示 skill 列表给用户]
    J --> K[用户选择要安装的 skill]
    K --> L[逐个复制选中的 skill 到 skills/]
    L --> M[写入 _bundles/{name}.json]
    M --> N[刷新扫描]
```

#### 2.5.2. 卸载流程

```mermaid
flowchart TD
    A[用户点击卸载 Bundle] --> B[读取 _bundles/{name}.json]
    B --> C[获取 skillIds 列表]
    C --> D[逐个删除 skills/{id}/ 目录]
    D --> E[删除 _bundles/{name}.json]
    E --> F[刷新扫描]
```

#### 2.5.3. 更新流程

```mermaid
flowchart TD
    A[用户点击更新 Bundle] --> B[读取 sourceUrl]
    B --> C[克隆/下载新版本到临时目录]
    C --> D[探测并解析新版本]
    D --> E{对比差异}
    E --> F[展示变更: 新增/移除/更新的 skill]
    F --> G[用户确认]
    G --> H[删除旧 skill 目录]
    H --> I[复制新 skill 目录]
    I --> J[更新 _bundles/{name}.json]
```

## 3. 接口变更

### 3.1. Rust 新增命令

```rust
/// 探测目录/仓库的包结构
#[tauri::command]
pub async fn detect_skill_package(
    path: String,
) -> Result<SkillPackageInfo, String>;

/// 从集合包安装选中的 skill
#[tauri::command]
pub async fn install_bundle(
    app: AppHandle,
    source_path: String,
    bundle_info: BundleInstallRequest,
) -> Result<BundleMetadata, String>;

/// 卸载整个 Bundle
#[tauri::command]
pub async fn uninstall_bundle(
    app: AppHandle,
    bundle_name: String,
) -> Result<(), String>;

/// 获取所有已安装的 Bundle 元数据
#[tauri::command]
pub async fn get_installed_bundles(
    app: AppHandle,
) -> Result<Vec<BundleMetadata>, String>;
```

#### 3.1.1. 探测结果结构

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageInfo {
    /// 包类型
    pub package_type: PackageType,  // "single" | "bundle"
    /// Bundle 信息（仅 bundle 类型有值）
    pub bundle: Option<BundleInfo>,
    /// 包含的 skill 预览列表
    pub skills: Vec<SkillPreview>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleInfo {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub source_url: Option<String>,
    pub license: Option<String>,
    pub skills_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPreview {
    pub name: String,
    pub description: String,
    /// 是否与已安装的 skill 冲突（同名）
    pub conflict: bool,
}
```

#### 3.1.2. 安装请求结构

```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleInstallRequest {
    /// Bundle 名称
    pub name: String,
    /// 来源 URL
    pub source_url: Option<String>,
    /// 安装方式
    pub install_method: String,
    /// 选中要安装的 skill ID 列表
    pub selected_skills: Vec<String>,
    /// skills 在源目录中的相对路径
    pub skills_path: String,
}
```

### 3.2. 前端类型新增

```typescript
// types/index.ts 新增

export interface BundleMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  sourceUrl?: string;
  license?: string;
  skillIds: string[];
  installedAt: string;
  installMethod: "git" | "zip" | "dir" | "zip-url";
  skillsPath?: string;
}

export interface SkillPackageInfo {
  packageType: "single" | "bundle";
  bundle?: BundleInfo;
  skills: SkillPreview[];
}

export interface BundleInfo {
  name: string;
  version: string;
  description?: string;
  author?: string;
  sourceUrl?: string;
  license?: string;
  skillsPath: string;
}

export interface SkillPreview {
  name: string;
  description: string;
  conflict: boolean;
}
```

### 3.3. Store 变更

```typescript
// skillManagerStore.ts 新增

export interface SkillManagerConfig {
  // ... 现有字段 ...

  /** 禁用的 Bundle 列表（整体禁用时，其下所有 skill 都禁用） */
  disabledBundleIds: string[];
}

// Store 新增状态
const bundles = ref<BundleMetadata[]>([]);

// Store 新增方法
function getBundleForSkill(skillName: string): BundleMetadata | undefined;
function toggleBundle(bundleName: string): void;
function isBundleEnabled(bundleName: string): boolean;
```

### 3.4. SkillManifest.source 字段扩展

现有 source 字段值：`"user" | "builtin" | "external:{id}"`

新增：`"bundle:{bundleName}"` — 表示该 skill 来自某个 bundle。

这样在扫描时，Rust 侧可以通过检查 `_bundles/` 目录来为对应的 skill 设置正确的 source。

## 4. UI 变更

### 4.1. SkillListPanel 分组展示

```
┌─────────────────────────────────────┐
│ 🔍 搜索技能...                       │
├─────────────────────────────────────┤
│ 📦 minecraft-agent-skills  v2.4.2   │  ← Bundle 分组头，可折叠
│    ├ minecraft-modding       ✅     │
│    ├ minecraft-plugin-dev    ✅     │
│    ├ minecraft-datapack      ✅     │
│    └ ... (13 个技能)                 │
│    [整体禁用] [更新] [卸载]          │
├─────────────────────────────────────┤
│ 📄 独立技能                          │  ← 不属于任何 bundle 的
│    ├ my-custom-skill         ✅     │
│    └ another-skill           ✅     │
└─────────────────────────────────────┘
```

### 4.2. SkillInstallDialog 增强

安装对话框在检测到集合包时，展示额外的选择界面：

```
┌─────────────────────────────────────────────┐
│ 安装技能包                                    │
├─────────────────────────────────────────────┤
│ 📦 检测到集合包: minecraft-agent-skills      │
│    版本: 2.4.2 | 作者: Jahrome907            │
│    许可: MIT                                  │
│                                              │
│ 选择要安装的技能 (13/13):                     │
│ ☑ minecraft-modding                          │
│ ☑ minecraft-plugin-dev                       │
│ ☑ minecraft-datapack                         │
│ ☑ minecraft-commands-scripting               │
│ ☑ minecraft-multiloader                      │
│ ☑ minecraft-testing                          │
│ ☑ minecraft-ci-release                       │
│ ☑ minecraft-world-generation                 │
│ ☑ minecraft-resource-pack                    │
│ ⚠ minecraft-imagegen (需要宿主图像生成能力)   │
│ ☑ minecraft-server-admin                     │
│ ☑ minecraft-worldedit-ops                    │
│ ☑ minecraft-essentials-ops                   │
│                                              │
│ [全选] [全不选]                               │
│                                              │
│              [取消]  [安装选中 (13)]           │
└─────────────────────────────────────────────┘
```

## 5. 实施计划

### Phase 1: 基础 Bundle 安装（核心）

**Rust 侧**:

1. 实现 `detect_skill_package` 命令（探测逻辑）
2. 实现 `install_bundle` 命令（批量安装 + 写入元数据）
3. 实现 `get_installed_bundles` 命令
4. 修改 `scan_skills_in_dir_parallel`：扫描时读取 `_bundles/` 目录，为对应 skill 设置 `source: "bundle:{name}"`

**前端**:

1. 新增 `BundleMetadata` 等类型定义
2. `SkillLoader` 新增 `detectPackage()` 和 `installBundle()` 方法
3. `SkillInstallDialog` 增加集合包检测和选择界面
4. Store 新增 `bundles` 状态和相关方法

### Phase 2: Bundle 管理（增强）

1. 实现 `uninstall_bundle` 命令
2. UI: `SkillListPanel` 分组展示
3. UI: Bundle 级别的启用/禁用开关
4. Store: `disabledBundleIds` 配置持久化

### Phase 3: Bundle 更新（进阶）

1. 实现版本比对逻辑
2. UI: 更新提示和差异展示
3. 增量更新（只替换变更的 skill）

## 6. 向后兼容性

| 场景                   | 影响                                |
| ---------------------- | ----------------------------------- |
| 现有单 skill 安装      | ✅ 完全不变                         |
| 现有扫描逻辑           | ✅ 不变（skill 仍扁平存放）         |
| 现有 SkillManagerProxy | ✅ 不变（仍按 skill name 披露方法） |
| 现有配置文件           | ✅ 新增字段有默认值                 |
| `_bundles/` 目录       | 新增，不影响现有 skill 目录         |

## 7. 风险与缓解

| 风险                                    | 缓解措施                                      |
| --------------------------------------- | --------------------------------------------- |
| Bundle 内 skill 名称与已安装 skill 冲突 | 探测阶段标记 `conflict: true`，安装时提示用户 |
| Bundle 更新时用户已修改了某个 skill     | 更新前检测本地修改，提示用户选择覆盖或跳过    |
| `bundle.yaml` 格式不统一                | 自动探测作为 fallback，不强依赖 `bundle.yaml` |
| 大型 bundle 安装耗时                    | 进度回调 + 并行复制                           |

## 8. 开放问题

1. **是否需要 bundle.yaml 的社区标准？** 目前 Agent Skills 规范没有定义集合包格式。我们可以先实现自动探测，后续如果社区形成共识再对齐。

2. **外部路径中的 bundle 如何处理？** 外部路径（如 `~/.agents/skills/`）中的 skill 是否也需要 bundle 分组？初步建议：外部路径不做 bundle 管理，只做扁平扫描。

3. **Bundle 内 skill 的独立卸载？** 允许用户从 bundle 中移除单个 skill，还是只允许整体操作？建议：允许独立禁用，但卸载只能整体操作（保持一致性）。
