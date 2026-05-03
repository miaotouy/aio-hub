# Skill 外部兼容路径扫描 — 实施计划

> **状态**: Draft  
> **日期**: 2026-05-03  
> **作者**: 咕咕 (Kilo)  
> **参考**: [`skill-manager-design.md`](../skill-manager-design.md), [Agent Skills Spec](https://agentskills.io/llms.txt)

---

## 1. 背景与动机

### 1.1. 现状

当前 [`skill_manager.rs`](../../../src-tauri/src/commands/skill_manager.rs:76-96) 的 `get_all_skill_manifests` 只扫描 **2 个硬编码路径**：

| 优先级 | 路径                           | `source` 值 |
| ------ | ------------------------------ | ----------- |
| 1      | `{appDataDir}/skills/`         | `"user"`    |
| 2      | `{appDataDir}/builtin_skills/` | `"builtin"` |

**缺失的能力**：

- 无法加载其他 AI 工具（Claude Code、Cursor、GitHub Copilot 等）安装的 Skill
- `source` 字段只有 2 个值，无法区分外部来源
- 前端 Store 虽有 `customSkillDirs` 字段，但**没有对应的设置 UI**
- 没有外部路径扫描的开关和配置界面

### 1.2. 目标

1. **跨工具兼容扫描**：自动发现和加载 `~/.agents/skills/`、`~/.claude/skills/` 等通用路径中的 Skill
2. **独立开关控制**：每个已知工具路径可单独启用/禁用
3. **自定义路径支持**：用户可添加任意自定义路径
4. **非侵入式**：外部路径不存在时静默跳过，**不自动创建**目录
5. **AIO 自身优先**：appData 内的 Skill 始终被扫描，外部是兼容增强

---

## 2. 设计

### 2.1. 扫描路径策略

```
优先级（同名 Skill 先到先得）：
  1. {appDataDir}/skills/           → source: "user"        （始终扫描）
  2. {appDataDir}/builtin_skills/    → source: "builtin"     （始终扫描）
  3. 启用中的外部路径               → source: "external:{id}"（受配置控制）
```

### 2.2. 已知工具路径预设

每个路径在 Rust 侧通过 `dirs_next::home_dir()` 解析为绝对路径：

| ID        | 工具           | 路径模板                  | 默认状态 |
| --------- | -------------- | ------------------------- | -------- |
| `agents`  | 通用跨平台标准 | `{HOME}/.agents/skills/`  | 关闭     |
| `claude`  | Claude Code    | `{HOME}/.claude/skills/`  | 关闭     |
| `cursor`  | Cursor         | `{HOME}/.cursor/skills/`  | 关闭     |
| `gemini`  | Gemini CLI     | `{HOME}/.gemini/skills/`  | 关闭     |
| `copilot` | GitHub Copilot | `{HOME}/.copilot/skills/` | 关闭     |

全部默认关闭，用户按需手动开启。

> **项目级路径**（如 `.agents/skills/`、`.claude/skills/`）不在本阶段范围内。AIO 目前没有工作区/项目概念，后续有了再扩展。

#### 跨平台全局路径对照表

| 工具 / 约定                          | **macOS**                                                              | **Linux**                          | **Windows** (推荐)                       | 备注                              |
| ------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------- | --------------------------------- |
| **通用跨平台** (`~/.agents/skills/`) | `/Users/你的用户名/.agents/skills/`                                    | `/home/你的用户名/.agents/skills/` | `C:\Users\你的用户名\.agents\skills\`    | **最推荐**，兼容性最佳            |
| **Claude Code / .claude**            | `/Users/你的用户名/.claude/skills/`                                    | `/home/你的用户名/.claude/skills/` | `C:\Users\你的用户名\.claude\skills\`    | 原始标准，许多工具兼容            |
| **Gemini CLI / Antigravity**         | `/Users/你的用户名/.gemini/skills/` 或 `~/.gemini/antigravity/skills/` | 同左                               | `C:\Users\你的用户名\.gemini\skills\`    | Antigravity 可能用 `.agent/` 变体 |
| **Cursor**                           | `/Users/你的用户名/.cursor/skills/`                                    | `/home/你的用户名/.cursor/skills/` | `C:\Users\你的用户名\.cursor\skills\`    | 高度兼容                          |
| **GitHub Copilot**                   | `/Users/你的用户名/.copilot/skills/` 或 `~/.agents/skills/`            | 同左                               | `C:\Users\你的用户名\.copilot\skills\`   | 支持多个路径                      |
| **其他（如 OpenCode 等）**           | `~/.config/opencode/skills/` 等                                        | 同左                               | `%USERPROFILE%\.config\opencode\skills\` | 常额外支持 `.agents/`             |

### 2.3. Rust 后端设计

#### 2.3.1. 新增数据结构

```rust
/// 外部扫描路径配置（前端通过参数传入）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalScanPath {
    pub id: String,
    pub path: String,     // 已解析的绝对路径
    pub enabled: bool,
}

/// 已知工具预设路径（跨平台）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WellKnownPath {
    pub id: String,
    pub label: String,
    pub default_path: String,
}
```

#### 2.3.2. 修改 `get_all_skill_manifests`

```rust
#[tauri::command]
pub async fn get_all_skill_manifests(
    app: AppHandle,
    external_paths: Option<Vec<ExternalScanPath>>, // 新增参数
) -> Result<Vec<SkillManifest>, String> {
    let mut manifests = Vec::new();
    let app_data_dir = crate::get_app_data_dir(app.config());

    // 1. AIO 自身路径（始终扫描）
    let user_skills_dir = app_data_dir.join("skills");
    if user_skills_dir.exists() {
        scan_skills_in_dir(&user_skills_dir, "user", &mut manifests).await;
    }
    let builtin_skills_dir = app_data_dir.join("builtin_skills");
    if builtin_skills_dir.exists() {
        scan_skills_in_dir(&builtin_skills_dir, "builtin", &mut manifests).await;
    }

    // 2. 外部路径（仅 enabled 且目录存在）
    if let Some(paths) = external_paths {
        for ep in paths {
            if !ep.enabled { continue; }
            let path = std::path::PathBuf::from(&ep.path);
            if path.exists() {
                let source = format!("external:{}", ep.id);
                scan_skills_in_dir(&path, &source, &mut manifests).await;
            }
        }
    }

    Ok(manifests)
}
```

#### 2.3.3. 新增命令

```rust
/// 获取已知工具的默认全局路径列表（跨平台解析后）
#[tauri::command]
fn get_well_known_skill_paths() -> Vec<WellKnownPath>;

/// 将 Skill 复制/移动到外部路径
#[tauri::command]
async fn export_skill_to_path(
    app: AppHandle,
    skill_name: String,
    target_path: String,
    copy_mode: bool,
) -> Result<SkillManifest, String>;
```

### 2.4. 前端类型扩展

#### 2.4.1. `types/index.ts`

```typescript
// 扩展 SkillManifest.source 类型
source: "user" | "builtin" | `external:${string}`;

// 新增
export interface ExternalScanPath {
  id: string;
  path: string;
  enabled: boolean;
  label?: string;
}

export interface WellKnownPath {
  id: string;
  label: string;
  defaultPath: string;
}
```

#### 2.4.2. `SkillLoader.ts` 修改

```typescript
class SkillLoader {
  async scanAll(externalPaths?: ExternalScanPath[]): Promise<SkillManifest[]> {
    const manifests = await invoke<SkillManifest[]>("get_all_skill_manifests", {
      externalPaths: externalPaths ?? [],
    });
    this.cachedManifests = manifests;
    return manifests;
  }
}
```

### 2.5. 前端 Store 改造

修改 `SkillManagerConfig`：

```typescript
interface SkillManagerConfig {
  enabled: boolean;
  disabledSkillIds: string[];
  autoActivate: boolean;

  // === 外部扫描配置（替代原 customSkillDirs） ===
  /** 外部扫描总开关 */
  externalScanEnabled: boolean;
  /** 外部扫描路径列表（每个带 id/path/enabled） */
  externalScanPaths: ExternalScanPath[];
}
```

**默认值**：

```typescript
const defaultConfig: SkillManagerConfig = {
  enabled: true,
  disabledSkillIds: [],
  autoActivate: false,
  externalScanEnabled: false,
  externalScanPaths: [],
};
```

预设路径在应用首次启动时从 Rust 获取并写入 `externalScanPaths`。

### 2.6. UI 设计

在 `SkillManagerPage.vue` 中新增 **标签页切换**（`el-tabs`）：

```
┌────────────────────────────────────────┐
│  [技能列表]  [扫描设置]               │
├────────────────────────────────────────┤
│                                        │
│   (当前 Tab 的内容)                    │
│                                        │
└────────────────────────────────────────┘
```

#### Tab: 技能列表 — 现有内容不变

#### Tab: 扫描设置 — 新增 `SkillScanSettings.vue`

```
┌─ 外部兼容扫描 ────────────────────────────┐
│                                            │
│  [总开关] 启用跨工具技能扫描               │
│                                            │
│  已知工具路径：                             │
│  ┌─ 通用跨平台标准 (agents) ────────────┐  │
│  │  ~/.agents/skills/     [开关]        │  │
│  └──────────────────────────────────────┘  │
│  ┌─ Claude Code ────────────────────────┐  │
│  │  ~/.claude/skills/     [开关]        │  │
│  └──────────────────────────────────────┘  │
│  ┌─ Cursor ─────────────────────────────┐  │
│  │  ~/.cursor/skills/     [开关]        │  │
│  └──────────────────────────────────────┘  │
│  ┌─ Gemini CLI ─────────────────────────┐  │
│  │  ~/.gemini/skills/     [开关]        │  │
│  └──────────────────────────────────────┘  │
│  ┌─ GitHub Copilot ─────────────────────┐  │
│  │  ~/.copilot/skills/    [开关]        │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  [+ 添加自定义路径]                        │
│  ┌─ 自定义路径 ─────────────────────────┐  │
│  │  C:\my-skills\    [开关]  [✕ 删除]  │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

- 总开关关闭时，所有外部扫描停止，但各路径的独立开关状态**保留**
- 自定义路径通过文件夹选择对话框添加
- 路径列表以可滚动列表呈现

---

## 3. 数据流

```
skillManagerStore.config.externalScanPaths
    │
    │ (前端编辑 → saveConfig 持久化到 config.json)
    │
    ▼
useSkillManager.refresh()
    │
    ▼
SkillLoader.scanAll(externalPaths)
    │
    │ invoke("get_all_skill_manifests", { externalPaths })
    │
    ▼
Rust get_all_skill_manifests()
    │
    ├── 扫描 {appData}/skills/         → source: "user"
    ├── 扫描 {appData}/builtin_skills/  → source: "builtin"
    └── 遍历 externalPaths:
        └── 目录存在 && enabled:
            scan_skills_in_dir(path, "external:{id}")
    │
    ▼
SkillBridgeFactory.refreshManifests()
    │
    ▼
toolRegistryManager 重新注册 SkillProxy 实例
```

---

## 4. 实施步骤

| 序号 | 步骤                 | 文件                                                                                                       | 工作量 |
| ---- | -------------------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| 1    | Rust 数据结构        | `skill_manager.rs` — 新增 `ExternalScanPath` / `WellKnownPath`                                             | 小     |
| 2    | Rust 命令改造        | `skill_manager.rs` — `get_all_skill_manifests` 支持 external_paths 参数；新增 `get_well_known_skill_paths` | 中     |
| 3    | Rust 命令注册        | `lib.rs` — 注册新命令                                                                                      | 小     |
| 4    | 前端类型扩展         | `types/index.ts` — 新增接口 + 扩展 source 类型                                                             | 小     |
| 5    | Store 改造           | `skillManagerStore.ts` — 移除 `customSkillDirs`，新增 `externalScanEnabled` + `externalScanPaths`          | 中     |
| 6    | SkillLoader 改造     | `SkillLoader.ts` — `scanAll()` 传递 externalPaths                                                          | 小     |
| 7    | useSkillManager 改造 | `useSkillManager.ts` — refresh 时从 store 读取路径并传入 loader                                            | 小     |
| 8    | 新增设置面板         | 新建 `SkillScanSettings.vue`                                                                               | 中     |
| 9    | 主页面改造           | `SkillManagerPage.vue` — 新增 Tab 切换                                                                     | 中     |

**建议顺序**：1→2→3（后端先行）→ 4→5→6→7（前端适配）→ 8→9（UI）

---

## 5. 风险

| 风险                                   | 级别  | 缓解                                                       |
| -------------------------------------- | ----- | ---------------------------------------------------------- |
| 同名 Skill 冲突                        | 🟡 中 | AIO 路径优先于外部路径；同名时跳过外部                     |
| 外部 Skill 安全性                      | 🟡 中 | 仍受 Rust 侧路径沙箱保护；source 标记 `external:` 便于审计 |
| 性能                                   | 🟢 低 | 仅扫描存在的路径；每个 Skill 目录只读 SKILL.md             |
| 预设路径默认全部关闭，对现有用户无影响 | 🟢 低 | 用户手动开启后才生效                                       |

---

> 📁 位置: `src/tools/skill-manager/docs/Plan/skill-external-scan-design.md`  
> 📌 状态: **Draft** — 待姐姐审批后进入实施阶段
