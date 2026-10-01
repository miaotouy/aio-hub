# 用户反馈调查与待办实施规划 (2026-09-30)

> 状态：F-01（Phase 2）重构已落地完成，4.1/4.2 的 aliases/拼音过滤未完成
> 来源：群聊与主人反馈收集（kfc50, 莓完莓鸟）
> 涉及模块：`skill-manager`, `llm-chat`, `aio-file-operator`
> 负责人：咕咕 (Architect)

---

## 1. 反馈概览与问题诊断

| 编号     | 反馈内容                                                     | 涉及模块                      | 核心痛点与根因诊断                                                                                                                                                                                     | 优先级 |
| :------- | :----------------------------------------------------------- | :---------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----- |
| **F-01** | Skill 管理器概览空空的，自说明放在“指令”中                   | `src/tools/skill-manager`     | `SkillDetailOverview.vue` 仅展示 `license`、`compatibility`、`scripts`、`allowedTools`、`metadata`。大多数标准 Skill 仅有 `SKILL.md` 正文，导致概览无有效内容可读；真正核心的自说明被孤立在“指令”Tab。 | **P1** |
| **F-02** | 考虑 `/` 命令的设计，支持自定义装配种类并作为候选列表        | `src/tools/llm-chat`          | 输入框目前仅有 `{{` 宏补全（`macroCompletionSource`），缺少斜杠指令体系。用户无法通过 `/` 快速调出不同种类（如动作、角色设定、格式规范、预设注入）的指令与片段。                                       | **P1** |
| **F-03** | 本地文件操作器功能未补齐                                     | `src/tools/aio-file-operator` | 目前仅支持 8 个基础操作，缺少文件流转关键动作（`copy_file`, `move_file` / `rename`）、递归搜索（`search_files`）、文件完整元数据（`get_file_info`）及大文件范围读取（`read_file_range`）。             | **P1** |
| **F-04** | 安全沙箱拦截报错提示需加长度上限，防止正文误塞导致上下文爆炸 | `src/tools/aio-file-operator` | `utils/security.ts` 中所有异常及拦截均无截断地原样回显 `path`（`"${targetPath}"`）。当模型参数错位把数千字正文当路径传入时，巨大报错直接返回给 LLM，严重浪费上下文 Token。                             | **P0** |

---

## 2. 深入技术分析与解决方案设计

### 2.1. [F-04] 安全沙箱拦截路径回显截断与脱敏 (P0)

#### 2.1.1. 问题分析

在 `src/tools/aio-file-operator/utils/security.ts` 中：

- `resolvePathForSecurity(path)`：当 `!isAbsolutePath(path)` 时直接抛出 `路径必须是绝对路径（收到: "${path}"）`。
- `checkSecurityPolicy`：在 `resolvePathForSecurity` 失败捕获时，回显 `安全沙箱拦截：无法解析路径 "${targetPath}"。`。
- 白名单与黑名单死区拦截时，回显 `安全沙箱拦截：路径 "${targetPath}" 不在允许的白名单目录中。`。

当 LLM 出现幻觉或工具参数边界错位，将待写入的代码全文、Markdown 文章或 JSON 字符串填入 `path` 参数时，这个带有换行符和成千上万字符的内容会被整体嵌入错误信息并返回至聊天历史，下一轮对话中该内容作为工具输出被二次消耗，造成严重的上下文污染与 Token 浪费。

#### 2.1.2. 改造方案

1. **安全格式化函数 `formatPathForError(rawPath: unknown, maxLength = 120): string`**：
   - 非字符串或空值处理为 `"<空路径>"`。
   - 移除前后空白，将连续换行/回车符压缩为空格，防止破坏日志与提示排版。
   - 字符数超过 `maxLength`（默认 120 字符）时截断，格式化为：
     `"前 100 字符... [已截断，原始内容长度: N 字符，疑似误将正文/数据传入路径参数]"`。
2. **全局统一拦截信息收口**：
   - 替换 `security.ts` 中所有拼接 `"${targetPath}"` 和 `"${path}"` 的错误信息。
   - `actions.ts` 中构建错误日志与返回结果 `buildErrorResult` 时增加参数预览安全截断。

---

### 2.2. [F-01] Skill 管理器概览布局重构与规范化 (P1)

#### 2.2.1. 问题诊断与现有实现缺陷

经 2026-10-01 深度复查，当前代码虽已合并了“指令”Tab，但落地形态存在显著的交互和架构缺陷：

1. **容器高度塌陷与双重滚动条（滚动地狱）**：
   `SkillDetailOverview.vue` 外层为 `.tab-scroll-container` (`height: 100%; overflow-y: auto`)，直接内嵌了 `DocumentViewer.vue`（自身也是 `height: 100%` + 内部滚动）。导致鼠标在文档区域时文档自己滚，滚到底才滚外层，极度割裂。
2. **组件误用与视觉“套娃”**：
   `DocumentViewer` 为通用文件查看器，自带了“文件名 / 源码与预览切换 / 复制 / 下载文件”工具栏和边框，嵌入在 Skill 详情中就像内嵌了一个文件窗口，缺乏原生“详情页/说明书”的一体感。
3. **关键元数据沉底被淹没**：
   采用上下硬堆叠布局，长篇指令导致“可用脚本”、“工具权限”、“元数据”折叠面板被挤到几屏之外的“地心深处”，用户根本注意不到该 Skill 是否有脚本和权限。
4. **Rust 与前端逻辑重复处理 Frontmatter**：
   Rust 端 `commands/skill_manager.rs:261` 已经把 YAML 剥离并将纯 instructions 传给前端，前端却再次执行正则匹配剥离，一旦正文开头存在 Markdown `---` 分割线便会造成误截断。

#### 2.2.2. 对标参考：VS Code 扩展市场与项目内 `PluginDetailPanel.vue` 标准范式

姐姐指出的 VS Code 插件市场详情页（以及项目中已成熟落地的 [`src/views/PluginManager/components/PluginDetailPanel.vue`](../../src/views/PluginManager/components/PluginDetailPanel.vue)）是此类“能力组件说明书”的行业标准实践：

- **主工作区（左侧 `main-content`）**：
  - 纯 Markdown 说明书直接流式渲染（复用 `RichTextRenderer`，与外层容器统一平滑滚动，无独立外框和多余工具栏）；
  - 最大宽度限制（`max-width: 900px`），保证宽屏下的最佳阅读舒适度。
- **元数据侧边栏（右侧 `info-sidebar`）**：
  - 固定宽度的信息看板（约 260px~280px）；
  - 分块展示：特征与规范（许可证、环境兼容性、来源）、可用脚本（带语言 Badge 与执行路径）、依赖工具权限（`allowedTools` 标签）、扩展元数据、资源文件统计等；
  - 即使文档有几万字，右侧能力要素依然一目了然。
- **响应式与容器查询（`@container`）**：
  - 宽屏与标准桌面窗口下采用“左文档 + 右信息”双栏；
  - 窄屏（如 `< 768px`）自适应变为“信息看板在上，Markdown 说明在下”单列流。

---

### 2.3. [F-03] 本地文件操作器功能补齐 (P1)

#### 2.3.1. 问题分析

`aio-file-operator` 现有 8 个 Agent 方法：

- `read_file`, `write_file`, `append_file`, `delete_file`, `list_directory`, `apply_diff`, `create_directory`, `path_exists`。

对比日常文件管理与智能体开发需求，缺失以下关键能力：

1. **文件流转能力缺失**：无法在本地复制 (`copy_file`)、移动或重命名 (`move_file` / `rename_path`)，智能体只能先读再写再删，极其低效且破坏原子性。
2. **查找与搜索能力缺失**：`list_directory` 仅列出直接子节点，无法按关键字/正则表达式在子树中递归定位文件 (`search_files`)。
3. **独立元数据查询缺失**：没有专门的 `get_file_info`，智能体为了看文件大小和修改时间只能通过读取或列出父目录间接获取。
4. **大文件分页读取能力缺失**：当文件超过 `maxFileSize` 时直接抛错，缺乏针对超大文本/日志文件的行级范围读取 (`read_file_range` / `read_lines`)。

#### 2.3.2. 扩展计划

1. **新增 Agent 方法与 Actions**：
   - `copy_file({ sourcePath, targetPath, overwrite?: boolean })`：安全复制文件，需同时对 source 和 target 执行路径沙箱校验。
   - `move_file({ sourcePath, targetPath, overwrite?: boolean })`：安全移动或重命名文件/目录，双路径校验。
   - `get_file_info({ path })`：返回文件类型、精确字节、创建/修改时间戳、行数预估、只读状态等。
   - `search_files({ directoryPath, pattern, recursive?: boolean, maxResults?: number })`：在指定目录下根据通配符或正则检索文件名及相对路径。
2. **多路径安全校验支持**：
   - 扩展 `checkSecurityPolicy`，支持检查 `args.sourcePath` 与 `args.targetPath`，防止跨沙箱跳板逃逸。
3. **注册元数据与类型同步**：
   - 同步更新 `aio-file-operator.registry.ts` 的 `getMetadata()` 及 `types.ts`。

---

### 2.4. [F-02] `/` 斜杠命令与自定义装配种类设计 (P1)

> 💡 **设计文档已独立归档**：
> 详见专用设计文档 [`docs/design/llm-chat-slash-command-system-design.md`](../design/llm-chat-slash-command-system-design.md)。
> 核心要点摘要：
>
> 1. **全面原生支持中文命令**：指令名原生支持中文（如 `/清空`、`/润色`），支持 `aliases` 别名（拼音首字母/英文别名），深度兼容 IME 输入法选词与 Composition 阶段；
> 2. **自定义装配种类**：复用并映射已有的快捷操作组，每个组为一个自定义装配种类，支持用户无心智负担自治；
> 3. **双编辑器适配**：CodeMirror 6 补全扩展与 Textarea 通用浮层双轮驱动；
> 4. **与宏引擎协同**：模板内支持现有 `{{宏}}` 语法并在发送时统一求值。

---

## 3. 分阶段实施待办清单 (Task Breakdown)

### Phase 1: 沙箱拦截报错截断与安全加固 (P0 - 即刻执行)

- [x] 1.1 在 `src/tools/aio-file-operator/utils/security.ts` 编写 `formatPathForError` 路径截断函数。
- [x] 1.2 替换 `validatePath`、`checkSecurityPolicy`、`resolvePathForSecurity` 中的裸路径拼接，限制报错最长显示 120 字符。
- [x] 1.3 在 `actions.ts` 的 `buildErrorResult` 中对 params 和 message 加入安全预览过滤。
- [x] 1.4 编写针对超长恶意路径（如 10KB 文本输入）的单测验证。

### Phase 2: Skill 管理器概览页面重构与对标优化 (P1)

- [x] 2.1 评估合并“概览”与“指令”Tab，减少冗余层级，提升即时可读性（已合并，`SkillDetailInstructions.vue` 已移除）。
- [x] 2.2 重构 `SkillDetailOverview.vue` 布局为 VS Code / `PluginDetailPanel.vue` 标准范式：
  - [x] 2.2.1 采用双栏容器查询布局（左侧 `main-content` 渲染 Markdown 说明，右侧 `info-sidebar` 聚合元数据与脚本）；
  - [x] 2.2.2 移除 `DocumentViewer`，替换为无多余工具栏、无高度硬限制的自然流式 `RichTextRenderer`，消除双重滚动条与套娃感；
  - [x] 2.2.3 移除前端重复剥离 frontmatter 的脆弱正则，直接信任 Rust 返回的干净 `instructions`；
  - [x] 2.2.4 右侧侧边栏按专业桌面级层级呈现：属性规格（许可证、环境兼容性）、脚本列表（卡片化/语言标签）、权限依赖（`allowedTools` 标签）、扩展元数据；
  - [x] 2.2.5 适配 `@container` 响应式，窄屏自动折叠至单列。
- [x] 2.3 走查内置与用户导入的典型 Skill（纯文档 Skill 如 `context7` 与含丰富脚本的复杂 Skill 如 `gpt-image-2`）的实际视觉与滚动表现。

### Phase 3: 本地文件操作器功能补齐 (P1)

- [x] 3.1 在 `actions.ts` 实现 `copyFile` 与 `moveFile`（支持 overwrite 策略与双路径沙箱验证）。
- [x] 3.2 在 `actions.ts` 实现 `getFileInfo` 与 `searchFiles`（支持递归与 pattern 过滤）。
- [x] 3.3 扩展 `utils/security.ts` 的 `checkSecurityPolicy` 支持源路径与目标路径双重检查。
- [x] 3.4 在 `aio-file-operator.registry.ts` 中注册新方法的 `agentCallable` 元数据与调度。
- [x] 3.5 补齐 `__tests__/aio-file-operator.test.ts` 的相关单元测试。

> ⚠️ 偏差记录：F-03 问题分析中提到的 `read_file_range`（大文件行级范围读取）未列入本 Phase 待办，亦未实现，后续按需单开任务。

### Phase 4: `/` 斜杠命令与自定义装配种类设计 (P1)

> 对应详细设计：[`docs/design/llm-chat-slash-command-system-design.md`](../design/llm-chat-slash-command-system-design.md)

- [x] 4.1 落地 `slashCommandService.ts` 与类型定义，支持中英文指令名与 aliases 别名查询。（中英文指令名已支持；`aliases` 独立别名与拼音匹配未实现，现以 `name`/`displayName`/`description`/`categoryLabel` 子串过滤替代）
- [x] 4.2 支持从快捷操作组加载自定义装配种类，支持中英文与拼音过滤。（快捷操作组映射已落地；拼音过滤未实现）
- [x] 4.3 在 `ChatCodeMirrorEditor.vue` 中集成 `slashCommandCompletionSource`，处理 IME 兼容与中文输入。
- [x] 4.4 美化斜杠指令补全下拉项，高亮显示分类 Badge、快捷键与参数说明。（已适配主题变量、详情列与匹配高亮；分类 Badge 与快捷键提示为简化展示，可后续增强）
- [x] 4.5 为 `ChatTextareaEditor.vue` 补充通用浮层触发支持。

---

## 4. 架构审查与边界检查

1. **Token 与上下文占用控制**：
   沙箱拦截保护是最高优先级，任何 Agent 工具在对外报告异常时，均不得无截断回显不可信的用户/模型输入参数。
2. **主题自适应与语义设计规范**：
   Skill 概览与斜杠命令补全菜单样式必须遵循 `theme-appearance.md` 与 `semantic-decoration.md`，使用 CSS 变量，禁止硬编码颜色与边框。
3. **桌面端与移动端兼容性**：
   斜杠命令设计应预留移动端虚拟键盘友好的指令快捷栏（Quick Action Bar），保证不同端的一致体验。
