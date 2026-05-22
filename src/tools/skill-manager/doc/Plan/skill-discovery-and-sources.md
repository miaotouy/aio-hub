# Skill 发现与源管理

> **状态**: RFC
> **日期**: 2026-05-22
> **前置**: 取代 [builtin-skill-eject.md](./builtin-skill-eject.md) 中的"启动时自动释出"设计
> **关联**: [Bundle 支持](./skill-bundle-support-design.md)

## 1. 问题陈述

当前 `builtin-skill-eject.md` 方案设计了"应用启动时自动将内置 skill 释出到用户目录"的机制。这存在以下问题：

1. **用户无感知**：skill 在后台静默安装，用户不知道发生了什么
2. **无选择权**：所有内置 skill 一股脑释出，用户可能只需要其中一部分
3. **缺少"获取"界面**：用户看不到"有哪些可用的 skill"，只能看到"已安装的 skill"
4. **无法扩展**：没有为远端源（社区市场、官方仓库）留出入口
5. **语义不清**：skill 从哪来的？为什么突然出现在我的列表里？

### 类比

当前设计相当于：打开 VS Code 时自动安装所有推荐扩展。
正确的设计应该是：VS Code 有一个 Extensions 面板，用户浏览、搜索、主动安装。

## 2. 设计方案

### 2.1. 核心思路

**引入"Skill 源 (Source)"概念 + "获取"界面，将内置 skill 从"自动释出"改为"用户主动安装"。**

```
┌─────────────────────────────────────────────────────────┐
│  技能管理器                                               │
├──────────┬──────────────┬───────────────────────────────┤
│ 已安装    │  获取技能     │  扫描设置                      │
│ (现有)    │  (新增)       │  (现有)                        │
└──────────┴──────────────┴───────────────────────────────┘
```

### 2.2. "获取技能"标签页

新增一个标签页，展示所有**可安装但尚未安装**的 skill，按来源分组：

```
┌─────────────────────────────────────────────────────────┐
│ 🔍 搜索可用技能...                                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ 📦 内置技能                                              │
│ ┌──────────────────────────────────────────────────────┐│
│ │ 🔎 everything-search              v1.0.0   [安装]    ││
│ │    基于 Everything 的极速文件名搜索                    ││
│ │    平台: Windows | 需要: Everything + es.exe          ││
│ ├──────────────────────────────────────────────────────┤│
│ │ 🌐 web-scraper                    v1.0.0   [已安装]  ││
│ │    网页内容抓取与结构化提取                            ││
│ └──────────────────────────────────────────────────────┘│
│                                                          │
│ 🌍 远端源 (未来)                                         │
│ ┌──────────────────────────────────────────────────────┐│
│ │ 暂无可用的远端源                                      ││
│ │ [添加源...]                                           ││
│ └──────────────────────────────────────────────────────┘│
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 2.3. Skill 源 (SkillSource) 抽象

引入统一的"源"概念，为不同来源的 skill 提供一致的发现接口：

```typescript
/** Skill 源类型 */
type SkillSourceType = "builtin" | "remote-registry" | "git-repo";

/** Skill 源定义 */
interface SkillSource {
  id: string;
  type: SkillSourceType;
  name: string;
  description?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 远端源的 URL（builtin 无需） */
  url?: string;
}

/** 源中可用的 Skill 条目（尚未安装的） */
interface AvailableSkill {
  /** Skill 名称/ID */
  name: string;
  /** 描述 */
  description: string;
  /** 版本号 */
  version: string;
  /** 来自哪个源 */
  sourceId: string;
  /** 扩展元数据（平台要求、依赖等） */
  metadata?: Record<string, string>;
  /** 是否已安装 */
  installed: boolean;
  /** 已安装版本（如果已安装） */
  installedVersion?: string;
  /** 是否有更新可用 */
  updateAvailable?: boolean;
}
```

### 2.4. 内置源的实现

内置源是最简单的实现——从 `resource/skills/` 目录读取可用 skill 的元数据（不复制文件）：

```rust
/// 列出内置可用的 skill（仅读取元数据，不执行释出）
#[tauri::command]
pub async fn list_builtin_skills(
    app: AppHandle,
) -> Result<Vec<AvailableSkillInfo>, String> {
    // 1. 扫描 resource/skills/ 目录
    // 2. 解析每个 SKILL.md 的 frontmatter（name, description, version）
    // 3. 返回元数据列表（不复制任何文件）
}
```

### 2.5. 安装流程变更

**变更前**（自动释出）：

```
应用启动 → 自动释出所有内置 skill → 扫描用户目录
```

**变更后**（用户主动安装）：

```
用户打开"获取技能"页 → 浏览可用 skill → 点击"安装" → 从 resource 复制到 appData → 刷新列表
```

安装内置 skill 的命令复用现有的 `eject_builtin_skills`，但改为**按需单个安装**：

```rust
/// 安装指定的内置 skill（从 resource 复制到 appData）
#[tauri::command]
pub async fn install_builtin_skill(
    app: AppHandle,
    skill_id: String,
) -> Result<(), String> {
    // 1. 确认 resource/skills/{skill_id} 存在
    // 2. 确认 appData/skills/{skill_id} 不存在（防重复）
    // 3. 复制目录
}
```

### 2.6. 首次使用引导

对于全新安装的用户，"已安装"列表为空。需要一个引导机制：

**方案 A：空状态引导（推荐）**

当已安装列表为空时，显示引导卡片：

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  🎯 还没有安装任何技能                                    │
│                                                          │
│  技能可以扩展 AI 助手的能力，比如文件搜索、代码分析等。    │
│                                                          │
│  [浏览可用技能 →]                                         │
│                                                          │
│  ── 推荐技能 ──                                          │
│  🔎 everything-search  极速文件名搜索    [一键安装]       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**方案 B：首次启动弹窗**

首次打开技能管理器时弹出选择对话框，让用户勾选要安装的内置 skill。

→ 推荐方案 A，更轻量且不打断用户。

### 2.7. 对 builtin-skill-eject.md 的修订

| 原设计                               | 新设计                                 |
| ------------------------------------ | -------------------------------------- |
| 启动时自动释出所有内置 skill         | 不自动释出，用户主动安装               |
| `SkillLoader.scanAll()` 开头执行释出 | 移除自动释出逻辑                       |
| 只有"已安装"视图                     | 新增"获取技能"视图                     |
| 内置 skill 从 resource 直接扫描      | 内置 skill 仅在"获取"页展示元数据      |
| `eject_builtin_skills` 批量释出      | `install_builtin_skill` 单个按需安装   |
| 无法感知"有哪些可用但未安装的 skill" | `list_builtin_skills` 提供完整可用列表 |

**保留的设计**：

- `ejectedBuiltins` 记录（改名为 `builtinInstallRecords`，语义更清晰）
- 版本追踪与更新提示
- "重置为默认"功能
- `reset_skill_to_builtin` 命令

### 2.8. 远端源（未来扩展预留）

当前只实现内置源，但架构上为远端源留好位置：

```typescript
// Store 中的源配置
interface SkillManagerConfig {
  // ... 现有字段 ...

  /** 已配置的 Skill 源列表 */
  sources: SkillSource[];
}

// 默认配置中包含内置源
const defaultSources: SkillSource[] = [
  {
    id: "builtin",
    type: "builtin",
    name: "内置技能",
    enabled: true,
  },
];
```

远端源的可能形态（不在本期实现）：

- **官方 Registry**：类似 npm registry，提供 skill 索引和下载
- **Git 仓库源**：指向一个 Git 仓库，定期拉取其中的 skill 列表
- **社区分享**：用户可以将自己的 skill 发布到 registry

### 2.9. 标签页结构调整

```
变更前：[技能列表] [扫描设置]
变更后：[已安装] [获取技能] [扫描设置]
```

"安装技能"按钮保留在 header 中，用于从本地/Git/URL 手动安装（高级用户）。
"获取技能"标签页用于浏览和一键安装（普通用户）。

## 3. 实施细节

### 3.1. Rust 后端变更

#### 3.1.1. 新增命令：`list_builtin_skills`

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableSkillInfo {
    pub name: String,
    pub description: String,
    pub version: String,
    pub metadata: HashMap<String, String>,
}

/// 列出 resource/skills/ 中所有可用的内置 skill 元数据
#[tauri::command]
pub async fn list_builtin_skills(
    app: AppHandle,
) -> Result<Vec<AvailableSkillInfo>, String> {
    // 扫描 resource/skills/ 下的每个子目录
    // 解析 SKILL.md frontmatter
    // 返回 name + description + version + metadata
}
```

#### 3.1.2. 新增命令：`install_builtin_skill`

```rust
/// 将指定内置 skill 从 resource 安装到用户目录
#[tauri::command]
pub async fn install_builtin_skill(
    app: AppHandle,
    skill_id: String,
) -> Result<(), String> {
    // 1. 确认 resource/skills/{skill_id} 存在
    // 2. 确认 appData/skills/{skill_id} 不存在
    // 3. 递归复制目录
}
```

#### 3.1.3. 修改 `SkillLoader.scanAll()`

移除开头的自动释出调用：

```typescript
async scanAll(externalPaths?: ExternalScanPath[]): Promise<SkillManifest[]> {
  // ❌ 移除: const ejected = await SkillService.ejectBuiltinSkills();

  // 正常扫描（仅扫描 appData + external paths）
  const manifests = await invoke<SkillManifest[]>("get_all_skill_manifests", {
    externalPaths: externalPaths ?? [],
  });
  this.cachedManifests = manifests;
  return manifests;
}
```

#### 3.1.4. 保留命令

- `reset_skill_to_builtin` — 重置为内置版本
- `get_builtin_skill_version` — 获取内置版本号（用于更新提示）

#### 3.1.5. 废弃命令

- `eject_builtin_skills` — 批量释出不再需要，由 `install_builtin_skill` 替代

### 3.2. 前端变更

#### 3.2.1. 新增组件：`SkillDiscoveryPanel.vue`

"获取技能"标签页的主体组件：

- 调用 `list_builtin_skills` 获取可用列表
- 与已安装列表对比，标记已安装状态
- 提供"安装"按钮
- 提供搜索/过滤
- 远端源区域（当前显示占位）

#### 3.2.2. 新增类型

```typescript
// types/index.ts

/** 可用的 Skill 信息（来自源，尚未安装） */
export interface AvailableSkillInfo {
  name: string;
  description: string;
  version: string;
  metadata?: Record<string, string>;
}

/** Skill 源类型 */
export type SkillSourceType = "builtin" | "remote-registry" | "git-repo";

/** Skill 源定义 */
export interface SkillSource {
  id: string;
  type: SkillSourceType;
  name: string;
  description?: string;
  enabled: boolean;
  url?: string;
}
```

#### 3.2.3. SkillService 新增方法

```typescript
/** 列出内置可用的 skill */
async listBuiltinSkills(): Promise<AvailableSkillInfo[]>;

/** 安装指定的内置 skill */
async installBuiltinSkill(skillId: string): Promise<void>;
```

#### 3.2.4. Store 变更

```typescript
interface SkillManagerConfig {
  // ... 现有字段 ...

  /** Skill 源配置 */
  sources: SkillSource[];

  /** 内置 skill 安装记录（原 ejectedBuiltins，改名） */
  builtinInstallRecords: Record<string, BuiltinInstallInfo>;
}

interface BuiltinInstallInfo {
  /** 安装时的版本号 */
  version: string;
  /** 安装时间 */
  installedAt: string;
  /** 用户是否修改过 */
  userModified?: boolean;
}
```

#### 3.2.5. SkillManagerPage.vue 标签页调整

```vue
<el-tabs v-model="activeTab" class="skill-tabs">
  <el-tab-pane name="installed" label="已安装">
    <!-- 现有的 SkillListPanel + SkillDetailPanel -->
  </el-tab-pane>

  <el-tab-pane name="discover" label="获取技能">
    <SkillDiscoveryPanel />
  </el-tab-pane>

  <el-tab-pane name="scan-settings" label="扫描设置">
    <SkillScanSettings />
  </el-tab-pane>
</el-tabs>
```

### 3.3. 迁移策略

对于已有用户（从旧版升级）：

1. 如果 `ejectedBuiltins` 中有记录，自动迁移为 `builtinInstallRecords`
2. 已释出的 skill 保持不变（已在用户目录中）
3. 移除启动时的自动释出逻辑，不影响已安装的 skill
4. 新用户首次打开时看到空列表 + 引导

### 3.4. 与 Bundle 方案的关系

- "获取技能"页面未来可以展示来自远端源的 Bundle
- 内置源也可以包含 Bundle（如果未来内置多个相关 skill）
- 安装流程统一：无论来源是内置/远端/手动，最终都进入 `appData/skills/`

## 4. 文件变更清单

| 文件                                                         | 操作 | 说明                                                                             |
| ------------------------------------------------------------ | ---- | -------------------------------------------------------------------------------- |
| `src-tauri/src/commands/skill_manager.rs`                    | 修改 | 新增 `list_builtin_skills`、`install_builtin_skill`；废弃 `eject_builtin_skills` |
| `src-tauri/src/lib.rs`                                       | 修改 | 注册新命令                                                                       |
| `src/tools/skill-manager/types/index.ts`                     | 修改 | 新增 `AvailableSkillInfo`、`SkillSource` 等类型                                  |
| `src/tools/skill-manager/services/SkillService.ts`           | 修改 | 新增 `listBuiltinSkills`、`installBuiltinSkill`                                  |
| `src/tools/skill-manager/services/SkillLoader.ts`            | 修改 | 移除 `scanAll` 中的自动释出逻辑                                                  |
| `src/tools/skill-manager/stores/skillManagerStore.ts`        | 修改 | 新增 `sources` 配置、重命名 `ejectedBuiltins`                                    |
| `src/tools/skill-manager/components/SkillManagerPage.vue`    | 修改 | 新增"获取技能"标签页                                                             |
| `src/tools/skill-manager/components/SkillDiscoveryPanel.vue` | 新增 | "获取技能"主体组件                                                               |

## 5. 风险与缓解

| 风险                                                    | 缓解                                 |
| ------------------------------------------------------- | ------------------------------------ |
| 新用户不知道要去"获取"页安装 skill                      | 空状态引导 + 推荐卡片                |
| 内置 skill 列表为空（resource 目录问题）                | 错误提示 + 降级为手动安装            |
| 远端源不可用时的体验                                    | 超时处理 + 离线提示 + 内置源始终可用 |
| 迁移时 `ejectedBuiltins` → `builtinInstallRecords` 失败 | 兼容读取旧字段名                     |

## 6. 开放问题

1. **是否需要"推荐安装"弹窗？** 首次打开技能管理器时，是否弹窗推荐安装内置 skill？还是仅靠空状态引导？
   → 建议：仅空状态引导，不打断用户。

2. **远端源的认证机制？** 如果未来支持私有 registry，需要 token 认证。
   → 留到远端源实现时再设计。

3. **内置 skill 的"预装"选项？** 是否在应用设置中提供"自动安装所有内置技能"的开关，给不想手动操作的用户？
   → 可以作为设置项保留，默认关闭。

4. **"获取"页的刷新频率？** 内置源每次打开都重新扫描 resource 目录，还是缓存？
   → 内置源可以缓存（resource 目录在运行时不会变）；远端源需要手动/定时刷新。
