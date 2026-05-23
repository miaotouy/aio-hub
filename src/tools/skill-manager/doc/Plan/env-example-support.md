# .env.example 支持

> **状态**: Implementing
> **日期**: 2025-05-22
> **前置**: [内置 Skill 释出机制](./builtin-skill-eject.md)
> **关联**: 释出机制完成后，所有 skill 都在用户可写目录中，`.env` 文件可以直接写入 skill 目录

## 1. 问题陈述

当前环境变量管理存在以下问题：

1. 用户必须手动查阅 SKILL.md 才知道需要配哪些变量
2. 没有变量描述/注释展示，纯 key-value 输入框
3. 没有默认值参考
4. 变量存储在管理器 config.json 中，而非标准的 `.env` 文件
5. 没有"还原默认值"的能力

## 2. 设计方案

### 2.1. 核心思路

skill 目录中放置 `.env.example` 作为变量声明模板。系统从中解析出变量名、默认值和注释描述，在 UI 中引导用户填写，最终写入 skill 目录下的 `.env` 文件。

### 2.2. 存储方式变更

**变更前**：环境变量存在 `config.skillEnvVars[skillName]` 中，通过 `cmd.env()` 注入进程。

**变更后**：环境变量写入 skill 目录下的 `.env` 文件，同时保留 `cmd.env()` 注入机制（从 `.env` 文件读取后注入）。

```
appData/skills/everything-search/
├── SKILL.md
├── .env.example    ← 变量声明模板（随 skill 分发，只读参考）
├── .env            ← 用户实际配置（由 UI 写入，gitignore）
└── scripts/
    └── search.ts
```

**为什么改为写 `.env` 文件**：

- 释出机制完成后，所有 skill 都在用户可写目录中，不存在"只读"限制
- `.env.example` → `.env` 是业界标准工作流，开发者熟悉
- skill 脚本如果使用 dotenv 库也能直接读取（双保险）
- 变量和 skill 物理聚合，更直观

**兼容性**：

- `cmd.env()` 注入机制保留——脚本执行前从 `.env` 文件读取变量并注入进程环境
- 旧的 `config.skillEnvVars` 数据作为迁移源，首次检测到时自动写入 `.env` 并清理 config 中的旧数据

### 2.3. `.env.example` 格式

```bash
# =================================================================
# Everything Search 环境配置
# =================================================================

# --- HTTP Server 模式 ---

# Everything HTTP Server 端口（配置此项优先使用 HTTP 模式）
ES_HTTP_PORT=

# Everything HTTP Server 绑定地址
ES_HTTP_HOST=127.0.0.1

# Everything HTTP Server 用户名（如设置了认证）
ES_HTTP_USER=

# Everything HTTP Server 密码（如设置了认证）
ES_HTTP_PASSWORD=

# --- CLI 模式 ---

# es.exe 的完整路径（配置此项优先使用 CLI 模式）
ES_PATH=
```

### 2.4. 解析规则

1. `# 注释行`：紧接在变量行上方的注释作为该变量的描述（多行注释合并）
2. `# === 分隔线 ===` 或 `# --- 分组 ---`：作为分组标题
3. `KEY=VALUE`：变量声明，VALUE 为默认值（空则无默认值）
4. `KEY="quoted value"`：支持引号包裹的值
5. 空行：重置待定注释（注释和变量之间不能有空行）

### 2.5. 解析结果类型

```typescript
/** 单个环境变量定义 */
interface EnvVarDefinition {
  /** 变量名 */
  key: string;
  /** 默认值（来自 .env.example，空字符串表示无默认值） */
  defaultValue: string;
  /** 描述（来自变量上方的 # 注释） */
  description: string;
  /** 所属分组（来自 # --- 分组名 --- 格式的注释） */
  group?: string;
}

/** .env.example 解析结果 */
interface EnvExampleParseResult {
  /** 解析出的变量定义列表 */
  definitions: EnvVarDefinition[];
  /** 是否存在 .env.example 文件 */
  exists: boolean;
}
```

## 3. 数据流

### 3.1. 读取流程

```
用户打开环境变量 tab
  → 读取 .env.example（通过 SkillService.readResource）
  → 解析为 EnvVarDefinition[]（前端纯逻辑）
  → 读取 .env（通过 SkillService.readResource）
  → 合并：definition 提供 key/description/default，.env 提供实际值
  → 渲染 UI
```

### 3.2. 保存流程

```
用户点击保存
  → 将 UI 中的 key=value 对序列化为 .env 格式
  → 写入 skill 目录下的 .env（通过 SkillService.writeResource）
  → 更新内存缓存
```

### 3.3. 脚本执行时的变量加载

```
SkillManagerProxy.skill_run_script()
  → 读取 skill 目录下的 .env 文件
  → 解析为 Record<string, string>
  → 传给 Rust 后端的 env_vars 参数
  → Rust 通过 cmd.env() 注入子进程
```

### 3.4. 迁移流程（旧数据兼容）

```
首次打开环境变量 tab
  → 检测 config.skillEnvVars[skillName] 是否有数据
  → 如果有且 .env 文件不存在：
    → 将 config 中的数据写入 .env
    → 清理 config 中的旧数据
    → 提示用户"已迁移环境变量到 .env 文件"
```

## 4. UI 设计

### 4.1. 环境变量标签页（有 .env.example 时）

```
┌─────────────────────────────────────────────────────────┐
│  环境变量                                                │
├─────────────────────────────────────────────────────────┤
│  [同步变量项]  [还原默认值]                              │
│                                                         │
│  ── HTTP Server 模式 ──────────────────────────────      │
│                                                         │
│  ES_HTTP_PORT                                           │
│  Everything HTTP Server 端口（配置此项优先使用 HTTP 模式）│
│  [________8025________]           默认: (空)             │
│                                                         │
│  ES_HTTP_HOST                                           │
│  Everything HTTP Server 绑定地址                         │
│  [_____127.0.0.1______]           默认: 127.0.0.1       │
│                                                         │
│  ES_HTTP_USER                                           │
│  Everything HTTP Server 用户名（如设置了认证）            │
│  [________________________]       默认: (空)             │
│                                                         │
│  ES_HTTP_PASSWORD                                       │
│  Everything HTTP Server 密码（如设置了认证）              │
│  [••••••••••••••••••••]           默认: (空)             │
│                                                         │
│  ── CLI 模式 ──────────────────────────────────────      │
│                                                         │
│  ES_PATH                                                │
│  es.exe 的完整路径（配置此项优先使用 CLI 模式）           │
│  [________________________]       默认: (空)             │
│                                                         │
│  ─────────────────────────────────────────────────       │
│  [+ 添加自定义变量]                                      │
│                                                         │
│  [保存]                                                  │
└─────────────────────────────────────────────────────────┘
```

### 4.2. 按钮行为

| 按钮               | 行为                                                                    |
| ------------------ | ----------------------------------------------------------------------- |
| **同步变量项**     | 重新读取 `.env.example`，补充 `.env` 中缺失的 key（不覆盖已有值）       |
| **还原默认值**     | 弹出确认框，确认后将所有变量值重置为 `.env.example` 中的默认值          |
| **添加自定义变量** | 在列表末尾添加空的 key-value 行（不在 `.env.example` 中定义的额外变量） |
| **保存**           | 将当前所有变量写入 `.env` 文件                                          |

### 4.3. 无 .env.example 时

退化为当前的纯手动模式（手动添加 key-value 对），但仍然写入 `.env` 文件而非 config。

### 4.4. 敏感变量处理

- 变量名包含 `PASSWORD`、`SECRET`、`TOKEN`、`KEY` 的，输入框默认使用 `show-password` 模式（密码遮罩）
- 其他变量使用普通文本输入

## 5. 实施细节

### 5.1. 新增文件

| 文件                                                   | 说明                            |
| ------------------------------------------------------ | ------------------------------- |
| `src/tools/skill-manager/services/envExampleParser.ts` | `.env.example` 解析器（纯函数） |
| `src/tools/skill-manager/services/envFileManager.ts`   | `.env` 文件读写管理             |
| `public/skills/everything-search/.env.example`         | 为内置 skill 添加示例           |

### 5.2. 修改文件

| 文件                                                      | 说明                                                      |
| --------------------------------------------------------- | --------------------------------------------------------- |
| `src/tools/skill-manager/types/index.ts`                  | 新增 `EnvVarDefinition`、`EnvExampleParseResult` 类型     |
| `src/tools/skill-manager/components/SkillDetailPanel.vue` | 重构环境变量 tab UI                                       |
| `src/tools/skill-manager/services/SkillManagerProxy.ts`   | `skill_run_script` 改为从 `.env` 文件读取变量             |
| `src/tools/skill-manager/stores/skillManagerStore.ts`     | 迁移逻辑 + 可能移除 `skillEnvVars`（或保留作为 fallback） |

### 5.3. 解析器实现

```typescript
// services/envExampleParser.ts

export interface EnvVarDefinition {
  key: string;
  defaultValue: string;
  description: string;
  group?: string;
}

export interface EnvExampleParseResult {
  definitions: EnvVarDefinition[];
  exists: boolean;
}

/**
 * 解析 .env.example 文件内容
 */
export function parseEnvExample(content: string): EnvVarDefinition[] {
  const lines = content.split("\n");
  const definitions: EnvVarDefinition[] = [];
  let pendingComments: string[] = [];
  let currentGroup: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    // 空行：重置待定注释
    if (trimmed === "") {
      pendingComments = [];
      continue;
    }

    // 分组标题：# --- 分组名 --- 或 # === 分组名 ===
    const groupMatch = trimmed.match(/^#\s*[-=]{3,}\s*(.+?)\s*[-=]{3,}\s*$/);
    if (groupMatch) {
      currentGroup = groupMatch[1].trim();
      pendingComments = [];
      continue;
    }

    // 纯分隔线：# ========= 或 # ---------
    if (/^#\s*[-=]{3,}\s*$/.test(trimmed)) {
      pendingComments = [];
      continue;
    }

    // 普通注释行
    if (trimmed.startsWith("#")) {
      pendingComments.push(trimmed.replace(/^#\s*/, ""));
      continue;
    }

    // 变量行：KEY=VALUE
    const varMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (varMatch) {
      const [, key, rawValue] = varMatch;
      // 去除引号
      const value = rawValue.replace(/^["']|["']$/g, "").trim();

      definitions.push({
        key,
        defaultValue: value,
        description: pendingComments.join(" "),
        group: currentGroup,
      });
      pendingComments = [];
    }
  }

  return definitions;
}

/**
 * 将变量对象序列化为 .env 文件内容
 */
export function serializeEnvFile(vars: Record<string, string>, definitions?: EnvVarDefinition[]): string {
  const lines: string[] = [];

  // 如果有 definitions，按其顺序输出（带注释）
  if (definitions && definitions.length > 0) {
    let lastGroup: string | undefined;

    for (const def of definitions) {
      // 分组标题
      if (def.group && def.group !== lastGroup) {
        if (lines.length > 0) lines.push("");
        lines.push(`# --- ${def.group} ---`);
        lastGroup = def.group;
      }

      // 注释
      if (def.description) {
        if (lines.length > 0 && !lines[lines.length - 1].startsWith("#")) {
          lines.push("");
        }
        lines.push(`# ${def.description}`);
      }

      // 变量值
      const value = vars[def.key] ?? def.defaultValue;
      lines.push(`${def.key}=${value}`);
    }

    // 追加不在 definitions 中的自定义变量
    const definedKeys = new Set(definitions.map((d) => d.key));
    const customVars = Object.entries(vars).filter(([k]) => !definedKeys.has(k));
    if (customVars.length > 0) {
      lines.push("");
      lines.push("# --- 自定义变量 ---");
      for (const [key, value] of customVars) {
        lines.push(`${key}=${value}`);
      }
    }
  } else {
    // 无 definitions，简单输出
    for (const [key, value] of Object.entries(vars)) {
      lines.push(`${key}=${value}`);
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * 解析 .env 文件内容为 key-value 对
 */
export function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      const [, key, rawValue] = match;
      vars[key] = rawValue.replace(/^["']|["']$/g, "").trim();
    }
  }
  return vars;
}
```

### 5.4. SkillManagerProxy 变更

```typescript
// skill_run_script 方法中，改为从 .env 文件读取
async skill_run_script(args: Record<string, string>): Promise<string> {
  const { skill_id, script_name, args: scriptArgs } = args;

  // 从 .env 文件读取环境变量
  const envContent = await SkillService.readResource(skill_id, '.env');
  const envVars = envContent ? parseEnvFile(envContent) : {};

  // fallback: 如果 .env 为空，尝试从旧的 config 读取
  const store = useSkillManagerStore();
  const configEnvVars = store.getSkillEnvVars(skill_id);
  const mergedEnvVars = { ...configEnvVars, ...envVars }; // .env 优先

  const result = await SkillService.runScript(
    skill_id, script_name, scriptArgs ?? '',
    this.getRuntimeSettings(), mergedEnvVars
  );
  // ...
}
```

## 6. 为内置 Skill 添加 .env.example

### everything-search/.env.example

```bash
# =================================================================
# Everything Search 环境配置
# =================================================================

# --- HTTP Server 模式 ---

# Everything HTTP Server 端口（配置此项优先使用 HTTP 模式）
ES_HTTP_PORT=

# Everything HTTP Server 绑定地址
ES_HTTP_HOST=127.0.0.1

# Everything HTTP Server 用户名（如设置了认证）
ES_HTTP_USER=

# Everything HTTP Server 密码（如设置了认证）
ES_HTTP_PASSWORD=

# --- CLI 模式 ---

# es.exe 的完整路径（配置此项优先使用 CLI 模式）
ES_PATH=
```

## 7. 实施顺序

1. **前置**：完成[内置 Skill 释出机制](./builtin-skill-eject.md)
2. 新建 `envExampleParser.ts`（纯函数，可独立测试）
3. 新建 `envFileManager.ts`（封装 .env 读写）
4. 为 `everything-search` 添加 `.env.example`
5. 重构 `SkillDetailPanel.vue` 环境变量 tab
6. 修改 `SkillManagerProxy.skill_run_script` 的变量读取逻辑
7. 实现旧数据迁移逻辑
8. 测试完整流程

## 8. 向后兼容

| 场景                                      | 处理                                   |
| ----------------------------------------- | -------------------------------------- |
| 旧版本升级，config 中有 skillEnvVars 数据 | 首次打开时自动迁移到 .env 文件         |
| skill 没有 .env.example                   | 退化为手动模式，仍写入 .env            |
| skill 脚本使用 dotenv 库                  | 双保险：.env 文件存在 + cmd.env() 注入 |
| .env 文件被用户手动编辑                   | 下次打开 tab 时正常读取展示            |

## 9. 补充细节

### 9.1. 内置安装的 Skill 支持卸载

从内置源安装的 skill 允许卸载操作（不再禁止）。理由：

- 用户可以随时从"获取技能"面板重新安装
- 卸载操作与普通 user skill 一致：删除 `appData/skills/{skillId}` 目录
- 卸载时同步清理 `builtinInstallRecords` 中对应的安装记录
- UI 上不再区分"内置不可卸载"，统一显示卸载按钮（保留"重置为默认"按钮作为额外能力）

### 9.2. 刷新时同步内置 Skill 索引状态

当用户卸载了一个从内置源安装的 skill 后，"获取技能"面板中该 skill 的状态应正确回到"可安装"。

**实现方式**：

- `handleRefresh` / `loadAvailableSkills` 执行时，遍历 `builtinInstallRecords`，检查对应 skill 是否仍存在于 `manifests` 列表中
- 如果某个记录对应的 skill 已不在 manifests 中（说明已被卸载），则自动清理该安装记录
- 这样 `isInstalled()` 判断会正确返回 `false`，卡片显示"安装"按钮而非"已安装"
