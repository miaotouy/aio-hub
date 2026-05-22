# 内置 Skill 释出机制

> **状态**: ~~Implementing~~ → **Superseded**
> **日期**: 2025-05-22
> **取代方案**: [Skill 发现与源管理](./skill-discovery-and-sources.md)
> **前置**: 无
> **后续**: [.env.example 支持](./env-example-support.md)
>
> ⚠️ **本方案中的"启动时自动释出"设计已被取代。** 新方案改为用户主动安装，保留了版本追踪、重置等机制。详见取代方案文档。

## 1. 问题陈述

当前内置 skill 存放在打包后的 resource 目录中，标记为 `source: "builtin"`，在 UI 中完全只读。这导致：

1. 用户无法修改内置 skill 的任何文件（包括配置）
2. 无法在 skill 目录中写入 `.env` 文件
3. 不符合 Agent Skills 规范中"skill 应可被用户定制"的理念
4. 环境变量只能存在管理器配置文件中，而非标准的 `.env` 文件

## 2. 设计方案

### 2.1. 核心思路

**内置 skill 作为"种子模板"，首次使用时自动释出到用户目录。**

```
resource/skills/          ← 只读模板（打包时嵌入）
    └── everything-search/
        ├── SKILL.md
        └── scripts/search.ts

appData/skills/           ← 用户可写目录（释出目标）
    └── everything-search/
        ├── SKILL.md      ← 从 resource 复制而来，可编辑
        ├── scripts/search.ts
        └── .env          ← 用户可以创建/修改
```

### 2.2. 释出时机

- **应用启动时**：`SkillLoader.scanAll()` 之前，执行释出检查
- **逻辑**：遍历 resource/skills/ 中的每个 skill，如果 appData/skills/ 中不存在同名目录，则复制过去
- **不覆盖**：如果用户目录已有同名 skill（无论来源），不执行释出

### 2.3. 版本追踪

在 Store 配置中新增字段，记录释出信息：

```typescript
interface SkillManagerConfig {
  // ... 现有字段 ...

  /** 从内置模板释出的 skill 记录 */
  ejectedBuiltins: Record<string, EjectedBuiltinInfo>;
}

interface EjectedBuiltinInfo {
  /** 释出时的版本号（来自 metadata.version） */
  version: string;
  /** 释出时间 */
  ejectedAt: string; // ISO 8601
  /** 用户是否修改过（可选，用于更新提示） */
  userModified?: boolean;
}
```

### 2.4. 扫描逻辑变更

**变更前**：

```
扫描 appData/skills/ → source: "user"
扫描 resource/skills/ → source: "builtin"
合并两个列表
```

**变更后**：

```
执行释出检查（resource → appData，仅补充缺失的）
扫描 appData/skills/ → source: "user"
（不再扫描 resource/skills/ 作为独立源）
扫描 external paths → source: "external:{id}"
```

### 2.5. UI 变化

| 变更点   | 变更前               | 变更后                                           |
| -------- | -------------------- | ------------------------------------------------ |
| 来源徽章 | "内置"（蓝色，只读） | "内置"（蓝色，可编辑）+ tooltip "从内置模板释出" |
| 文件编辑 | 内置 skill 只读      | 所有 skill 可编辑                                |
| 卸载按钮 | 内置 skill 无卸载    | 内置释出的 skill 显示"重置"而非"卸载"            |
| 新增按钮 | 无                   | "重置为默认"按钮（仅对从内置释出的 skill）       |

### 2.6. "重置为默认"功能

- 仅对 `ejectedBuiltins` 中记录的 skill 可用
- 操作：删除用户目录中的 skill → 从 resource 重新复制
- 需要确认对话框："重置将覆盖你对此技能的所有修改，确定继续？"
- 重置后更新 `ejectedBuiltins` 中的时间戳

### 2.7. 应用更新时的行为

当应用版本更新，resource 中的内置 skill 可能有新版本：

1. 启动时比较 resource 中 skill 的 `metadata.version` 与 `ejectedBuiltins` 中记录的版本
2. 如果 resource 版本更新，在 UI 中显示"有新版本可用"提示
3. 用户可选择"更新"（等同于重置）或"忽略"
4. 不自动覆盖用户修改

## 3. 实施细节

### 3.1. Rust 后端变更

#### 3.1.1. 新增命令：`eject_builtin_skills`

```rust
/// 将内置 skill 释出到用户目录（仅补充缺失的）
#[tauri::command]
pub async fn eject_builtin_skills(
    app: AppHandle,
) -> Result<Vec<String>, String> {
    // 返回本次释出的 skill 名称列表
}
```

逻辑：

1. 获取 resource/skills/ 目录路径
2. 获取 appData/skills/ 目录路径
3. 遍历 resource/skills/ 下的每个子目录
4. 如果 appData/skills/ 中不存在同名目录，执行复制
5. 返回本次新释出的 skill 名称列表

#### 3.1.2. 新增命令：`reset_skill_to_builtin`

```rust
/// 将指定 skill 重置为内置模板版本
#[tauri::command]
pub async fn reset_skill_to_builtin(
    app: AppHandle,
    skill_id: String,
) -> Result<(), String> {
    // 1. 确认 resource/skills/{skill_id} 存在
    // 2. 删除 appData/skills/{skill_id}
    // 3. 从 resource 复制到 appData
}
```

#### 3.1.3. 新增命令：`get_builtin_skill_version`

```rust
/// 获取内置模板中指定 skill 的版本号
#[tauri::command]
pub async fn get_builtin_skill_version(
    app: AppHandle,
    skill_id: String,
) -> Result<Option<String>, String> {
    // 读取 resource/skills/{skill_id}/SKILL.md 的 metadata.version
}
```

#### 3.1.4. 修改 `get_all_skill_manifests`

移除对 resource/skills/ 的直接扫描（不再作为 "builtin" 源）。释出逻辑在扫描之前执行，确保所有内置 skill 已在用户目录中。

### 3.2. 前端变更

#### 3.2.1. SkillLoader 变更

在 `scanAll()` 方法开头增加释出调用：

```typescript
async scanAll() {
  // 1. 先执行释出检查
  const ejected = await SkillService.ejectBuiltinSkills();
  if (ejected.length > 0) {
    // 更新 store 中的 ejectedBuiltins 记录
    await this.updateEjectedRecords(ejected);
  }

  // 2. 正常扫描（现有逻辑）
  const manifests = await SkillService.getAllManifests(externalPaths);
  // ...
}
```

#### 3.2.2. Store 变更

```typescript
interface SkillManagerConfig {
  // ... 现有字段 ...
  ejectedBuiltins: Record<string, EjectedBuiltinInfo>;
}
```

新增方法：

- `isEjectedBuiltin(skillName: string): boolean`
- `getEjectedInfo(skillName: string): EjectedBuiltinInfo | undefined`
- `updateEjectedRecord(skillName: string, info: EjectedBuiltinInfo): void`

#### 3.2.3. SkillDetailPanel 变更

- 移除 `isBuiltin` 的只读限制
- 对 `isEjectedBuiltin` 的 skill 显示"重置为默认"按钮
- 来源徽章改为"内置"但不再限制编辑

#### 3.2.4. SkillService 新增方法

```typescript
async ejectBuiltinSkills(): Promise<string[]>;
async resetSkillToBuiltin(skillId: string): Promise<void>;
async getBuiltinSkillVersion(skillId: string): Promise<string | null>;
```

### 3.3. 迁移策略

对于已有用户（升级场景）：

- 首次启动新版本时，释出逻辑会自动将内置 skill 复制到用户目录
- 如果用户之前已通过 config 配置了环境变量，这些配置不受影响（仍从 config 读取并注入）
- 后续 `.env.example` 功能上线后，可以提供迁移提示

## 4. 文件变更清单

| 文件                                                      | 操作 | 说明                                          |
| --------------------------------------------------------- | ---- | --------------------------------------------- |
| `src-tauri/src/commands/skill_manager.rs`                 | 修改 | 新增 3 个命令，修改 `get_all_skill_manifests` |
| `src-tauri/src/lib.rs`                                    | 修改 | 注册新命令到 `invoke_handler`                 |
| `src/tools/skill-manager/types/index.ts`                  | 修改 | 新增 `EjectedBuiltinInfo` 类型                |
| `src/tools/skill-manager/services/SkillService.ts`        | 修改 | 新增 3 个方法                                 |
| `src/tools/skill-manager/services/SkillLoader.ts`         | 修改 | `scanAll` 开头增加释出调用                    |
| `src/tools/skill-manager/stores/skillManagerStore.ts`     | 修改 | 新增 `ejectedBuiltins` 配置和相关方法         |
| `src/tools/skill-manager/components/SkillDetailPanel.vue` | 修改 | 移除只读限制，增加重置按钮                    |

## 5. 风险与缓解

| 风险                          | 缓解                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| 释出时磁盘空间不足            | 释出前检查可用空间，失败时优雅降级（仍从 resource 只读加载） |
| 用户误删释出的 skill          | 下次启动时自动重新释出                                       |
| resource 目录在某些平台不可读 | 添加错误处理，降级为不释出                                   |
| 升级时内置 skill 有破坏性变更 | 不自动覆盖，仅提示用户                                       |

## 6. 与 Bundle 方案的关系

本方案与 [Bundle 支持设计](./skill-bundle-support-design.md) 互不冲突：

- 释出机制处理的是"内置 → 用户"的单向复制
- Bundle 处理的是"外部集合包 → 用户"的安装流程
- 两者共享同一个用户目录 `appData/skills/`
- 释出后的内置 skill 不会被标记为 bundle 成员
