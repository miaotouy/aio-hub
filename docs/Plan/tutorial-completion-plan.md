# AIO Hub 教程补完计划 v2 — 模块化增量执行

> **状态**: 执行中 (In Progress)
> **版本**: v2 — 面向 Orchestrator 全自动执行
> **创建日期**: 2026-05-07
> **更新日期**: 2026-05-08

---

## 目录

1. [v1→v2 核心变化](#一v1v2-核心变化)
2. [Orchestrator 使用说明](#二orchestrator-使用说明)
3. [前置准备：侧边栏骨架重构](#三前置准备侧边栏骨架重构)
4. [任务单元模板](#四任务单元模板)
5. [任务单元清单](#五任务单元清单)
6. [执行策略](#六执行策略)
7. [附录：写作模板与信息来源](#七附录写作模板与信息来源)

---

## 一、v1→v2 核心变化

| v1 问题                       | v2 解决方案                                           |
| ----------------------------- | ----------------------------------------------------- |
| 侧边栏重构被当阻塞前提        | 侧边栏一次建好骨架（含插入锚点），各模块**增量追加**  |
| 按文档类型分阶段（Phase 1-4） | 按**工具模块**划分独立任务单元，无模块间依赖          |
| Orchestrator 自己决策导致卡住 | 每个任务单元精确到文件列表 + 侧边栏插入代码，无需判断 |
| 一个问题阻断全流程            | 子任务失败 → 记录 + 跳过，继续下一个，最终汇报汇总    |
| "先全部写再全部挂"            | **写一个模块挂一个模块**，索引自然生长                |

---

## 二、Orchestrator 使用说明

### 你的角色

你是一个任务派发器，**不是决策者**。你的职责：

1. 从[任务单元清单](#五任务单元清单)中按顺序取下一个任务单元
2. 将任务单元参数填入[模板](#四任务单元模板)，生成一条完整的子任务消息
3. 用 `new_task` 工具派发给 **code** 模式执行
4. 等待子任务完成结果，记录成功/失败
5. 取下一个任务单元，重复 2-4
6. 全部执行完毕后，汇总报告

### 铁律

- **禁止自行决策。** 所有必要信息在本计划中已经给出。
- **禁止提问。** 遇到任何问题（如子任务失败），记录后跳过，继续下一个。
- **禁止修改顺序。** 按清单顺序执行以确保侧边栏追加位置正确。
- **每个子任务只做一件事：** 一个工具模块的文档 + 该模块的侧边栏条目。
- **如果某个文件已存在：** 跳过创建，只做侧边栏追加。不要覆盖已有内容。

### ⛔ 命令白名单（严格执行）

子任务中**仅允许**使用以下命令，禁止自造任何不在列表中的命令：

| 允许的命令                         | 用途                                       |
| ---------------------------------- | ------------------------------------------ |
| `bun run docs:build`               | 验证 VitePress 构建                        |
| `bun run docs:dev`                 | VitePress 开发服务器（不推荐在子任务中用） |
| `bun run docs:preview`             | 预览构建产物（不推荐在子任务中用）         |
| `bun run check` / `check:frontend` | 类型检查                                   |

**禁止任何不在 package.json scripts 中的命令**，尤其禁止：

- `npx vitepress build docs`（必须用 `bun run docs:build`）
- 任何自造的 `vitepress` 命令变体
- 任何 `npm` / `yarn` / `pnpm` 命令

**原因**: 子任务运行在审批链中，自造命令会被系统拦截导致流程卡死。

### 子任务派发格式

使用 `new_task` 工具，mode 设为 `code`，message 按[模板](#四任务单元模板)填充。

---

## 三、前置准备：侧边栏骨架重构 (已完成 ✅)

> **备注**: 侧边栏骨架已于 2026-05-07 完成重构，包含所有必要的插入锚点。后续任务可直接使用 `apply_diff` 在锚点位置追加内容。

---

## 四、任务单元模板

### 4.1 🟢 单篇工具模板

适用于：复杂度低、功能单一的工具。产出一个 `.md` 文件 + 一个侧边栏链接。

**子任务消息模板（直接复制填充后发送给 code）：**

```
## 任务: 撰写 {工具显示名称} 用户教程

### 第一步: 创建文档文件
创建文件: docs/user-guide/tools/{toolId}.md

内容按以下结构撰写（使用 [写作原则](#72-写作原则)）:
1. ## 概述 — 一句话描述工具用途 + 3-5个核心功能要点
2. ## 快速上手 — 用户5分钟内完成首次使用的图文步骤
3. ## 功能详解 — 按面板/功能分区逐个介绍，包含关键参数说明
4. ## 高级用法（可选） — 组合使用场景、快捷键
5. ## 常见问题 — 3-5个FAQ

写作信息来源: 阅读 src/tools/{toolId}/ 下的源码了解功能

### 第二步: 更新侧边栏
编辑 docs/.vitepress/config.ts，在 `// ==== UG_SINGLE_TOOLS 插入点 ====` 行**上方**追加一行:
    {{ text: '{工具显示名称}', link: '/user-guide/tools/{toolId}' }},
注意保持缩进与其他条目一致

### 第三步: 验证
运行 `bun run docs:build`，确认无报错后回复"完成"
```

### 4.2 🟡 中等工具模板

适用于：功能较多、需要 2-4 篇文档的工具。产出子目录 + 多个 `.md` + 侧边栏 collapsed 分组。

**子任务消息模板：**

```
## 任务: 撰写 {工具显示名称} 文档集 ({N} 篇)

### 第一步: 创建文档目录和文件
创建目录: docs/user-guide/tools/{toolId}/

创建以下文件:
{文件列表，每行: - docs/user-guide/tools/{toolId}/xxx.md — [内容描述]}

每个文件按 [写作原则](#72-写作原则) 撰写，其中 index.md 作为快速上手入口页。

写作信息来源: 阅读 src/tools/{toolId}/ 下的源码了解功能

### 第二步: 更新侧边栏
编辑 docs/.vitepress/config.ts，在 `// ==== UG_MEDIUM_TOOLS 插入点 ====` 行**上方**追加以下 collapsed 分组:
    {{ text: '{显示名称}', collapsed: true, items: [
{每个文件:       {{ text: '{该篇标题}', link: '/user-guide/tools/{toolId}/{slug}' }},}
    ]}},

注意保持缩进与其他条目一致

### 第三步: 验证
运行 `bun run docs:build`，确认无报错后回复"完成"
```

### 4.3 🔴 复杂工具模板

适用于：LLM Chat、设置系统等超大型工具。使用 `collapsed: false` 默认展开分组。

**子任务消息模板：**

```
## 任务: 撰写 {工具显示名称} 文档集 ({N} 篇)

### 第一步: 创建文档目录和文件
创建目录: docs/user-guide/tools/{toolId}/

创建以下文件:
{文件列表，每行: - docs/user-guide/tools/{toolId}/xxx.md — [内容描述]}

每个文件按 [写作原则](#72-写作原则) 撰写，其中 index.md 作为快速上手入口页。

写作信息来源:
- 阅读 src/tools/{toolId}/ 下的源码了解功能
- 阅读 docs/architecture/{相关架构文档}.md 了解架构背景

### 第二步: 更新侧边栏
编辑 docs/.vitepress/config.ts，在 `// ==== UG_COMPLEX_TOOLS 插入点 ====` 行**上方**追加以下 collapsed 分组:
    {{ text: '{显示名称}', collapsed: false, items: [
{每个文件:       {{ text: '{该篇标题}', link: '/user-guide/tools/{toolId}/{slug}' }},}
    ]}},

注意保持缩进与其他条目一致

### 第三步: 验证
运行 `bun run docs:build`，确认无报错后回复"完成"
```

### 4.4 已有文档挂载模板

适用于：`docs/guide/` 或 `docs/architecture/` 中已写好的文档，只需追加侧边栏条目。

**子任务消息模板：**

```
## 任务: 挂载已有文档到侧边栏

### 操作
编辑 docs/.vitepress/config.ts，在 `// ==== {插入点名称} 插入点 ====` 行**上方**追加以下条目（每行一条）:
    {{ text: '{显示名称}', link: '/{路径}' }},
{多条重复}

### 验证
运行 `bun run docs:build`，确认无报错后回复"完成"
```

---

## 五、任务单元清单

### 📋 清单总览

| 批次     | 类型              | 单元数 | 预计总耗时 |
| -------- | ----------------- | ------ | ---------- |
| A        | 基础用户指南      | 6      | ~30 min    |
| B        | 🟢 单篇工具       | 28     | ~2.5 hr    |
| C        | 🟡 中等工具       | 5      | ~1 hr      |
| D        | 设置系统          | 1      | ~20 min    |
| E        | 🔴 LLM Chat       | 1      | ~30 min    |
| F        | 高级功能 + 移动端 | 8      | ~40 min    |
| G        | 已有开发指南挂载  | 3      | ~10 min    |
| H        | 已有架构文档挂载  | 5      | ~15 min    |
| **合计** |                   | **57** | **~6 hr**  |

---

### 批次 A: 基础用户指南（6 单元）

> 使用 🟢 单篇工具模板变体，所有条目追加到 `UG_BASICS` 插入点。

| #   | 文件                                  | 侧边栏显示名 | 插入点                          |
| --- | ------------------------------------- | ------------ | ------------------------------- |
| A1  | `docs/user-guide/getting-started.md`  | 快速开始     | UG_BASICS                       |
| A2  | `docs/user-guide/installation.md`     | 安装指南     | UG_BASICS                       |
| A3  | `docs/user-guide/project-overview.md` | 项目概览     | UG_BASICS                       |
| A4  | `docs/user-guide/workspace-basics.md` | 工作区基础   | UG_BASICS                       |
| A5  | `docs/user-guide/troubleshooting.md`  | 故障排除     | UG_BASICS                       |
| A6  | `docs/user-guide/tools/index.md`      | 工具总览     | ⚠️ 侧边栏已在骨架中，只创建文件 |

> **注意**: `tools/index.md` 是一个工具总览索引页，列出所有工具及其一句话简介（可从 `src/tools/` 目录 + `.kilocode/rules/tools.md` 获取工具列表）。此文件已存在于侧边栏骨架中，只需创建文件内容，无需追加侧边栏条目。

---

### 批次 B: 🟢 单篇工具（28 单元）

> 使用 [4.1 🟢 单篇工具模板](#41--单篇工具模板)，全部追加到 `UG_SINGLE_TOOLS` 插入点。
> 文件路径: `docs/user-guide/tools/{toolId}.md`

| #   | toolId               | 显示名称         | 源码目录                       |
| --- | -------------------- | ---------------- | ------------------------------ |
| B1  | transcription        | 多模态转写       | src/tools/transcription        |
| B2  | json-formatter       | JSON 格式化      | src/tools/json-formatter       |
| B3  | regex-applier        | 正则批量替换     | src/tools/regex-applier        |
| B4  | text-diff            | 文本差异对比     | src/tools/text-diff            |
| B5  | code-formatter       | 代码格式化       | src/tools/code-formatter       |
| B6  | token-calculator     | Token 计算器     | src/tools/token-calculator     |
| B7  | rich-text-renderer   | 富文本渲染测试   | src/tools/rich-text-renderer   |
| B8  | component-tester     | 组件测试器       | src/tools/component-tester     |
| B9  | tool-calling         | 工具调用测试     | src/tools/tool-calling         |
| B10 | api-tester           | API 测试工具     | src/tools/api-tester           |
| B11 | git-analyzer         | Git 分析器       | src/tools/git-analyzer         |
| B12 | service-monitor      | 服务注册表浏览器 | src/tools/service-monitor      |
| B13 | vcp-connector        | VCP 连接器       | src/tools/vcp-connector        |
| B14 | web-distillery       | 网页蒸馏室       | src/tools/web-distillery       |
| B15 | content-deduplicator | 内容查重         | src/tools/content-deduplicator |
| B16 | directory-janitor    | 目录清洁工具     | src/tools/directory-janitor    |
| B17 | directory-tree       | 目录结构浏览器   | src/tools/directory-tree       |
| B18 | symlink-mover        | 符号链接搬家工具 | src/tools/symlink-mover        |
| B19 | data-filter          | 数据筛选工具     | src/tools/data-filter          |
| B20 | color-picker         | 图片色彩分析     | src/tools/color-picker         |
| B21 | ffmpeg-tools         | FFmpeg 工具      | src/tools/ffmpeg-tools         |
| B22 | danmaku-player       | 弹幕播放器       | src/tools/danmaku-player       |
| B23 | media-info-reader    | AI 信息解析      | src/tools/media-info-reader    |
| B24 | system-pulse         | 系统脉搏         | src/tools/system-pulse         |
| B25 | llm-inspector        | LLM 检查器       | src/tools/llm-inspector        |
| B26 | embedding-playground | Embedding 测试   | src/tools/embedding-playground |
| B27 | st-worldbook-editor  | ST 世界书编辑器  | src/tools/st-worldbook-editor  |
| B28 | canvas               | Web Canvas       | src/tools/canvas               |

---

### 批次 C: 🟡 中等工具（5 单元）

> 使用 [4.2 🟡 中等工具模板](#42--中等工具模板)，全部追加到 `UG_MEDIUM_TOOLS` 插入点。

#### C1: 知识库 (knowledge-base) — 4 篇

| 文件                                                        | 侧边栏标题 |
| ----------------------------------------------------------- | ---------- |
| `docs/user-guide/tools/knowledge-base/index.md`             | 快速上手   |
| `docs/user-guide/tools/knowledge-base/indexing.md`          | 索引引擎   |
| `docs/user-guide/tools/knowledge-base/entry-management.md`  | 条目管理   |
| `docs/user-guide/tools/knowledge-base/agent-integration.md` | Agent 集成 |

侧边栏显示名: `📚 知识库`

#### C2: 资产管理器 (asset-manager) — 3 篇

| 文件                                                      | 侧边栏标题 |
| --------------------------------------------------------- | ---------- |
| `docs/user-guide/tools/asset-manager/index.md`            | 快速上手   |
| `docs/user-guide/tools/asset-manager/source-tracking.md`  | 来源追踪   |
| `docs/user-guide/tools/asset-manager/thumbnails-batch.md` | 缩略图管理 |

侧边栏显示名: `📦 资产管理器`

#### C3: 智能 OCR (smart-ocr) — 2 篇

| 文件                                          | 侧边栏标题 |
| --------------------------------------------- | ---------- |
| `docs/user-guide/tools/smart-ocr/index.md`    | 快速上手   |
| `docs/user-guide/tools/smart-ocr/advanced.md` | 进阶配置   |

侧边栏显示名: `🔍 智能 OCR`

#### C4: 媒体生成中心 (media-generator) — 2 篇

| 文件                                                        | 侧边栏标题 |
| ----------------------------------------------------------- | ---------- |
| `docs/user-guide/tools/media-generator/index.md`            | 快速上手   |
| `docs/user-guide/tools/media-generator/asset-management.md` | 资产管理   |

侧边栏显示名: `🎨 媒体生成中心`

#### C5: Web Canvas (canvas) — 2 篇

| 文件                                       | 侧边栏标题 |
| ------------------------------------------ | ---------- |
| `docs/user-guide/tools/canvas/index.md`    | 快速上手   |
| `docs/user-guide/tools/canvas/advanced.md` | 进阶       |

侧边栏显示名: `🎨 Web Canvas`

> **注意**: Canvas 也出现在批次 B（B28 单篇）。如果 B28 已完成（单篇 `canvas.md`），C5 应改为子目录版。Orchestrator 在执行 C5 前检查：若 `docs/user-guide/tools/canvas.md` 已存在则删除，改为创建 `canvas/` 子目录。

---

### 批次 D: 设置系统（1 单元，~6 篇）

> 使用 [4.3 🔴 复杂工具模板](#43--复杂工具模板)（`collapsed: true`），追加到 `UG_SETTINGS` 插入点。
> 设置系统不是传统"工具"，而是用户指南的核心配置章节。

| 文件                                          | 侧边栏标题     |
| --------------------------------------------- | -------------- |
| `docs/user-guide/settings/index.md`           | 设置概览       |
| `docs/user-guide/settings/appearance.md`      | 外观与壁纸     |
| `docs/user-guide/settings/llm-service.md`     | AI 服务配置    |
| `docs/user-guide/settings/general-startup.md` | 通用与启动项   |
| `docs/user-guide/settings/logs-assets.md`     | 日志与资产管理 |
| `docs/user-guide/settings/about.md`           | 关于与许可     |

侧边栏显示名: `⚙️ 设置指南`，`collapsed: true`

---

### 批次 E: 🔴 LLM Chat（1 单元，14 篇）

> 使用 [4.3 🔴 复杂工具模板](#43--复杂工具模板)（`collapsed: false`），追加到 `UG_COMPLEX_TOOLS` 插入点。

| 文件                                                 | 侧边栏标题   |
| ---------------------------------------------------- | ------------ |
| `docs/user-guide/tools/llm-chat/index.md`            | 快速上手     |
| `docs/user-guide/tools/llm-chat/sessions.md`         | 会话管理     |
| `docs/user-guide/tools/llm-chat/messages.md`         | 消息操作     |
| `docs/user-guide/tools/llm-chat/settings-chat.md`    | 聊天参数     |
| `docs/user-guide/tools/llm-chat/settings-plugins.md` | 插件设置     |
| `docs/user-guide/tools/llm-chat/attachments.md`      | 附件与资产   |
| `docs/user-guide/tools/llm-chat/agents.md`           | 智能体       |
| `docs/user-guide/tools/llm-chat/context-pipeline.md` | 上下文管道   |
| `docs/user-guide/tools/llm-chat/worldbook.md`        | 世界书       |
| `docs/user-guide/tools/llm-chat/user-profiles.md`    | 用户档案     |
| `docs/user-guide/tools/llm-chat/variables-macros.md` | 变量与宏     |
| `docs/user-guide/tools/llm-chat/export-import.md`    | 导出与导入   |
| `docs/user-guide/tools/llm-chat/shortcuts-tips.md`   | 快捷键与技巧 |
| `docs/user-guide/tools/llm-chat/faq.md`              | 常见问题     |

侧边栏显示名: `🤖 LLM 对话`，`collapsed: false`

---

### 批次 F: 高级功能 + 移动端（8 单元）

> 使用 🟢 单篇工具模板变体。

| #   | 文件                                              | 侧边栏显示名       | 插入点      |
| --- | ------------------------------------------------- | ------------------ | ----------- |
| F1  | `docs/user-guide/advanced/multi-window.md`        | 多窗口模式         | UG_ADVANCED |
| F2  | `docs/user-guide/advanced/plugins.md`             | 插件使用           | UG_ADVANCED |
| F3  | `docs/user-guide/advanced/agent-tool-calling.md`  | Agent 工具调用     | UG_ADVANCED |
| F4  | `docs/user-guide/advanced/css-variables-guide.md` | CSS 变量宏         | UG_ADVANCED |
| F5  | `docs/user-guide/mobile/index.md`                 | 移动端概览         | UG_MOBILE   |
| F6  | `docs/user-guide/mobile/llm-chat.md`              | LLM 对话（移动端） | UG_MOBILE   |
| F7  | `docs/user-guide/mobile/llm-api.md`               | API 配置（移动端） | UG_MOBILE   |
| F8  | `docs/user-guide/mobile/log-manager.md`           | 日志管理器         | UG_MOBILE   |

> **注意**: F4 的 `css-variables-guide.md` 已存在于 `docs/user-guide/`，只需移动到 `docs/user-guide/advanced/` 目录。

---

### 批次 G: 已有开发指南挂载（3 单元）

> 使用 [4.4 已有文档挂载模板](#44-已有文档挂载模板)。只追加侧边栏，不创建文件。

#### G1: 开发指南 — 核心系统 + 贡献（3 条 → GUIDE_CORE）

| 文本         | 路径                          |
| ------------ | ----------------------------- |
| 状态管理     | /guide/state-management-guide |
| 窗口配置系统 | /guide/window-config-system   |
| 贡献指南     | /guide/contribution-guide     |

#### G2: 开发指南 — 插件开发 + 资产管理 + 故障排除（4 条 → GUIDE_PLUGINS + GUIDE_ASSETS + GUIDE_TROUBLESHOOT）

| 文本             | 路径                               | 插入点             |
| ---------------- | ---------------------------------- | ------------------ |
| 插件 UI 开发     | /guide/plugin-ui-development-guide | GUIDE_PLUGINS      |
| LLM Chat 插件    | /guide/llm-chat-plugin-guide       | GUIDE_PLUGINS      |
| 来源追踪         | /guide/asset-source-module-guide   | GUIDE_ASSETS       |
| macOS Gatekeeper | /guide/macos-gatekeeper-fix        | GUIDE_TROUBLESHOOT |

#### G3: 开发指南 — 开发环境搭建（1 条 → GUIDE_START）

| 文本         | 路径                   |
| ------------ | ---------------------- |
| 开发环境搭建 | /guide/getting-started |

> **注意**: `docs/guide/getting-started.md` 需要新建。内容：Bun、Rust、Tauri CLI 安装步骤。

---

### 批次 H: 已有架构文档挂载（5 单元）

> 使用 [4.4 已有文档挂载模板](#44-已有文档挂载模板)。只追加侧边栏，不创建文件。

#### H1: 架构 — 总览区（2 条 → ARCH_OVERVIEW）

| 文本         | 路径                                      |
| ------------ | ----------------------------------------- |
| UI 结构图    | /architecture/ui-structure-diagram        |
| 工具架构总览 | /architecture/tools-architecture-overview |

#### H2: 架构 — LLM 系统（4 条 → ARCH_LLM）

| 文本               | 路径                                   |
| ------------------ | -------------------------------------- |
| Chat UI 结构       | /architecture/llm-chat-ui-structure    |
| 多媒体基础设施     | /architecture/llm-media-infrastructure |
| 模型元数据系统     | /architecture/model-metadata-system    |
| Embedding 基础设施 | /architecture/embedding-infrastructure |

#### H3: 架构 — 基础设施（4 条 → ARCH_INFRA）

| 文本             | 路径                                         |
| ---------------- | -------------------------------------------- |
| 服务层架构       | /architecture/services-architecture          |
| Composables 总览 | /architecture/composables-overview           |
| 设置系统         | /architecture/settings-architecture-overview |
| 窗口同步         | /architecture/window-sync-architecture       |

#### H4: 架构 — 扩展系统（2 条 → ARCH_EXTEND）

| 文本         | 路径                                     |
| ------------ | ---------------------------------------- |
| 转写服务架构 | /architecture/transcription-architecture |
| 插件异步任务 | /architecture/plugin-async-task-support  |

#### H5: 架构 — 知识库 + Tauri 后端（空分组标记）

> 这些分组在骨架中已创建，但对应文档尚未编写。暂不追加条目。日后写完文档后按 4.4 模板追加。

---

## 六、执行策略

### 6.1 执行顺序

严格按批次 A → B → C → D → E → F → G → H 顺序执行。批次内按编号顺序。

**原因**:

- A（基础页面）为后续工具教程提供可以链接的基础设施（如 `getting-started` 被多处引用）
- B（简单工具）先执行的好处：快速积累成功经验，侧边栏快速充实，后续复杂工具可借鉴简单工具的写法
- C/D/E（复杂工具）需要更仔细的源码阅读，放在后面减少上下文切换

### 6.2 子任务失败处理

```
如果子任务返回失败或错误:
  1. 记录: 单元编号、失败原因
  2. 跳过该单元，立即开始下一个
  3. 不要尝试修复——那不是你的工作
  4. 全部完成后，在汇总中列出所有失败的单元
```

### 6.3 进度追踪

每完成 10 个单元，向用户汇报一次进度（如 "已完成 10/57，当前正在执行 B11..."）。

### 6.4 最终验证

全部 57 个单元执行完毕后，运行一次完整验证：

```bash
bun run docs:build
```

将构建结果（成功/失败/死链警告）汇总到最终报告中。

---

## 七、附录：写作模板与信息来源

### 7.1 单篇工具文档结构

```markdown
# {工具名称}

## 概述

一句话描述工具用途。核心功能：

- 功能1
- 功能2
- 功能3

## 快速上手

1-2 个最常用场景的图文操作步骤（用文字描述截图位置，截图统一标注 `TODO: 截图`）。
重点让用户 5 分钟内能完成第一次使用。

## 功能详解

按面板/功能分区逐个介绍：

### {功能分区1}

- 用途
- 关键参数说明
- 操作方式

### {功能分区2}

...

## 常见问题

**Q: 问题1？**
A: 解答

**Q: 问题2？**
A: 解答
```

### 7.2 写作原则

1. **面向用户**，不是开发者。少讲原理，多讲操作。
2. **截图优先**，每个操作步骤配图（截图统一用 `TODO: 截图` 占位）。
3. **中文思维**，用"你"称呼用户，语气亲切但不啰嗦。
4. **场景驱动**，"你想做 X → 这样做" 而不是 "功能 Y 可以做到 Z"。
5. **每个文档可独立阅读**，不依赖其他文档的前置知识。

### 7.3 信息来源优先级

撰写工具教程时，按以下优先级获取信息：

1. **阅读源码**: `src/tools/{toolId}/` 下的 Vue 组件、composables、stores
2. **阅读规则文件**: `.kilocode/rules/tools.md` 了解工具定位
3. **阅读架构文档**: `docs/architecture/` 下的相关架构说明
4. **运行应用**: 实际使用工具了解交互流程

### 7.4 侧边栏插入操作说明

`apply_diff` 的 SEARCH 块以插入点注释为锚点，REPLACE 块在注释前追加新条目。

**示例** — 追加一个单篇工具链接到 `UG_SINGLE_TOOLS`:

```
SEARCH:
      // ==== UG_SINGLE_TOOLS 插入点 ====

REPLACE:
      { text: '多模态转写', link: '/user-guide/tools/transcription' },
      // ==== UG_SINGLE_TOOLS 插入点 ====
```

**示例** — 追加一个 complex 分组:

```
SEARCH:
      // ==== UG_COMPLEX_TOOLS 插入点 ====

REPLACE:
      { text: '🤖 LLM 对话', collapsed: false, items: [
        { text: '快速上手', link: '/user-guide/tools/llm-chat/index' },
        { text: '会话管理', link: '/user-guide/tools/llm-chat/sessions' },
      ]},
      // ==== UG_COMPLEX_TOOLS 插入点 ====
```

---

> **Orchestrator 启动指令**: 阅读本计划 → 按批次 A→H 顺序逐个派发子任务 → 完成后运行 `vitepress build` → 汇总报告。
