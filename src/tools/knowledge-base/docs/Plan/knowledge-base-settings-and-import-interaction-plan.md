# Knowledge 设置与文档导入交互补完计划

- **状态**：已暂停，待按 Knowledge 产品方案重写
- **创建日期**：2026-07-18
- **最近修订**：2026-07-18
- **适用范围**：`src/tools/knowledge-base/`、`src-tauri/src/knowledge/`
- **关联文档**：
  - [Knowledge 资料库产品方案](./knowledge-base-product-interaction-design.md)
  - [Recall / Knowledge 领域拆分与重构实施计划](../../../recall/docs/Plan/recall-knowledge-domain-restructure-implementation-plan.md)
  - [Knowledge 架构说明](../../ARCHITECTURE.md)

> **暂停说明（2026-07-18）**：后续调查确认，本文从现有硬编码缺口直接推导了配置分层、自动向量化默认值、占位符延续、向量维度限制和若干导入约束，却没有先明确 Knowledge 的产品定位。上位产品方案现已将 Knowledge 定义为“用户或 Agent 主动调用的本地冷资料检索服务”，并明确不以绑定后的自动上下文注入为标准路径。本文第 3 节以后保留为历史调查和旧施工草案，不再表示“已确认设计决策”，任何 Phase 均不得直接开工。重写时必须先完成旧占位符使用调查、Agent 访问权限模型、独立 Knowledge 工具和结构化 `@` mention 的契约设计。

## 1. 背景与结论

2026-07-17 的领域拆分将原知识库中的完整语义条目 UI、全局设置和集合设置迁入 `src/tools/recall/`。2026-07-18 新建的 Knowledge 工作台补齐了文档、分块、语义索引和检索测试，但没有恢复与文档资料域相匹配的设置能力，也没有完成文件导入的格式说明和拖放交互。

当前缺口包括：

1. 没有 Knowledge 全局设置页和单资料库设置入口。
2. `KnowledgeLibrary.config` 与 manifest 的 legacy `config_json` 已存在，但配置和活动向量身份不能继续以 manifest 为真源；WAL 下跨 manifest/library 的 `ATTACH` 事务不具备崩溃原子性。
3. 分块长度、重叠长度、检索数量和向量批次大小散落为硬编码。
4. 文件选择器拥有扩展名白名单，解析器没有使用同一白名单，页面也不显示支持格式。
5. 工作台没有文件拖放入口，没有拖入悬停、格式拒绝和批次结果检查交互。
6. Knowledge 的模块壳层、响应式布局、边框 token 和交互语义与 Recall 及当前项目规范不一致。

本计划补齐上述范围。目录监听、递归目录导入和持久化 ingest queue 继续归入目录同步阶段。

## 2. 调查结果

### 2.1 设置数据链路

| 项目           | 当前实现                                  | 问题                                         |
| -------------- | ----------------------------------------- | -------------------------------------------- |
| 全局默认值     | 无                                        | 新建资料库无法继承用户偏好                   |
| 单库配置       | 前后端类型含 `config`                     | 缺少单库事实表、更新入口和 legacy 迁移       |
| 名称与说明     | 仅创建时填写                              | 创建后无法编辑                               |
| 分块参数       | Rust 固定 `1000 / 120`                    | 调整必须改代码，重建行为不可配置             |
| 检索测试       | `strategy=auto`、`limit=12`、`minScore=0` | 默认值不可见，也不能按库保存                 |
| 向量化批次     | 前端服务固定 `32`                         | 无法根据渠道能力或稳定性调整                 |
| Embedding 模型 | 对话框默认选第一个可用项                  | 没有用户默认值，选择结果也不构成建库默认配置 |

#### WAL 下跨库事务的具体风险

初版实现曾考虑用 `ATTACH knowledge_meta.db` 在一次 transaction 中同步写 manifest 和 `library.kdb`。这在当前连接配置下不能作为崩溃原子性方案：两个数据库都使用 WAL，而 SQLite 对 attached database 的多文件原子提交依赖 rollback-journal 的 super-journal；WAL 没有等价的跨文件协调日志。运行中的 SQL 错误通常仍能整体回滚，但如果进程或设备恰好在两个 WAL 的提交窗口中断，恢复后可能只有一份数据库包含新状态。

对 Knowledge 而言，这不是可忽略的显示延迟。若 manifest 里的配置/活动空间与 library 内的 chunk、FTS 和 vector 分别成为事实源，故障后可能出现新分块配置读取旧 chunk、向量空间身份与实际维度不匹配，或后续重建基于错误身份继续写入。此类不一致能跨重启持续存在，因此按严重数据一致性问题处理。

最终边界是：名称、说明和数据库路径属于 manifest 目录元数据；版本化索引配置、活动 Embedding space/route/descriptor、document、chunk、FTS、vector 和 graph 属于 library 数据，全部在单个 `library.kdb` WAL transaction 中提交。运行时不得用 manifest legacy 字段补齐或覆盖 library 真值。目录摘要更新失败只能产生可重建的滞后，不得影响摄取、索引或检索；重新引入任何跨库强一致写入前，必须完成符合实际 journal mode 的崩溃恢复证明和进程终止测试。

Recall 已提供顶层设置页、全局默认配置和单集合设置视图，可以作为信息架构参考。Knowledge 不能直接复制 Recall 的配置字段：Knowledge 的向量维度来自实际 Embedding 响应和 space descriptor，不允许由设置页手工指定；Recall 设置页当前即时调用 `saveWorkspace()`，Knowledge 的高频设置更新必须按项目规范使用 `saveDebounced`。

### 2.2 支持格式

当前文件选择器列出以下扩展名：

| 类别       | 扩展名                             | 解析方式                  |
| ---------- | ---------------------------------- | ------------------------- |
| PDF        | `.pdf`                             | `pdfjs-dist` 提取页面文本 |
| Word       | `.docx`                            | 共享 `parseDocx`          |
| 网页       | `.html`、`.htm`                    | Readability + Turndown    |
| Markdown   | `.md`、`.markdown`                 | 文本解码                  |
| 结构化文本 | `.json`、`.csv`                    | 文本解码                  |
| 纯文本     | `.txt`                             | 文本解码                  |
| 代码       | `.ts`、`.js`、`.vue`、`.py`、`.rs` | 文本解码                  |

`fileParser.ts` 只对 PDF、DOCX 和 HTML 分支处理，其他扩展名全部落入文本解码。它没有拒绝未知扩展名，因此拖入未知二进制文件时可能把乱码送入索引。文件选择器、页面说明、拖放校验、MIME 映射和解析器需要共用一份格式定义。

本轮只统一和展示现有支持范围，不顺带声明 YAML、Office 其他格式、压缩包或图片 OCR 已受支持。扫描型 PDF 没有可提取文本时继续作为单文件失败处理。

### 2.3 拖放基础设施

项目已有 `src/components/common/DropZone.vue` 和 `src/composables/useFileDrop.ts`，支持：

- Tauri v2 `webview.onDragDropEvent` 的绝对路径事件。
- H5 原生拖放回退。
- 多文件、仅文件、扩展名过滤和自定义校验。
- 拖入状态、错误回调和点击选择文件。

Knowledge 应复用上述能力。不能只绑定 DOM `drop` 事件，因为 Tauri WebView 的文件绝对路径依赖现有拖放封装；也不能单独实现另一套导入循环。

### 2.4 UI 与响应式

当前 `KnowledgeBase.vue` 同时承担模块壳层、侧栏、创建表单、文档管理、检索测试、导入流程和全部样式，文件超过 1300 行。主要问题包括：

- 没有类似 Recall 的顶层“工作区 / 设置”结构。
- 小窗口仍保留固定侧栏，内容区空间不足。
- 窄屏隐藏操作按钮文字后没有为全部图标按钮补充 tooltip。
- 文档和结果行使用 `article role="button"`，只响应 Enter，不具备完整原生按钮键盘行为。
- 边框混用 Element Plus 变量和项目 `--border-width`、`--border-color`。
- 导入失败只显示数量，用户看不到失败文件和原因。

## 3. 旧草案设计决策（已暂停）

### 3.1 配置分层

配置分为两层：

1. **全局创建默认值**：使用 `createConfigManager` 保存，只影响以后新建的资料库。
2. **资料库配置快照**：保存在各 `library.kdb` 的版本化 `library_metadata` 中，运行时只读取资料库自身配置。

创建资料库时把全局默认值深拷贝为单库配置。后续修改全局默认值不得改变已有资料库，避免用户资料库随全局设置变化而隐式重切片、改变检索数量或触发额外模型调用。

manifest 只保存 library ID、名称、说明和受管文件路径等目录信息。索引配置、活动 Embedding space、route、descriptor 与实际维度属于派生索引身份，必须与 document/chunk/FTS/vector/graph 位于同一个 library 数据库。应用配置和重建只允许在单个 WAL 数据库事务内提交；禁止依赖 WAL 模式下的 `ATTACH` 跨文件提交。manifest 中已有的 `config_json` 与活动向量字段只作为可重入的一次性迁移输入，迁移完成后不得参与运行时判定。

单库配置使用版本化结构，例如：

```ts
interface KnowledgeLibraryConfigV1 {
  version: 1;
  chunking: {
    targetChars: number;
    overlapChars: number;
  };
  import: {
    autoVectorize: boolean;
  };
  search: {
    defaultStrategy: "auto" | "keyword" | "semantic" | "hybrid";
    limit: number;
  };
  embedding: {
    preferredRouteKey: string;
    batchSize: number;
  };
}
```

`preferredRouteKey` 只负责预选调用渠道。真正的 `activeEmbeddingSpaceId`、descriptor 和维度仍由实际向量构建结果决定。

通用 `minScore` 暂不进入首版可见设置。当前四种策略的原始分数语义不同，在没有按策略完成阈值标定前，一个共享滑块容易让用户误解。运行时继续使用 `0`；需要开放时改为按策略配置并增加固定查询集测试。

### 3.2 设置范围

全局设置页包含：

- 默认 Embedding 调用渠道。
- 新资料库默认分块长度和重叠长度。
- 导入后是否自动补齐语义向量，默认关闭。
- 检索测试默认策略和结果数量。
- 向量化批次大小。
- 重置为默认值。

单资料库设置包含：

- 名称和说明。
- 当前分块长度和重叠长度。
- 当前检索测试默认策略和结果数量。
- 首选 Embedding 渠道与向量空间只读摘要。
- 自动向量化开关和批次大小。

名称、说明属于 manifest 目录元数据，可独立保存。系统运行参数保存在全局配置中。分块和 Embedding 契约先保留在前端表单中，用户确认“应用并重建”后，由单个 library DB 事务完成配置提交、重切片、FTS/graph 重建以及旧活动向量清理；操作失败或进程中断时继续保留原配置与原索引。修改首选渠道不等于切换已存在的向量空间，模型切换继续通过语义索引流程确认。

Agent 的 `knowledgeSettings`、binding 和占位符参数保持独立。本设置页不覆盖 Agent 已保存的 `limit`、`min-score` 或 strategy。

### 3.3 格式定义单一来源

新增前端格式定义模块，至少包含：

```ts
interface KnowledgeFileTypeDefinition {
  category: string;
  label: string;
  extensions: string[];
  mimeTypes: string[];
  parser: "pdf" | "docx" | "html" | "text";
  validation: "verified" | "experimental" | "unsupported";
  description: string;
}
```

由该模块导出扁平扩展名列表和显示摘要，供以下入口共同使用：

- Tauri 文件选择器 filter。
- `DropZone` 的 `accept`。
- `parseKnowledgeFile` 的前置校验和 parser 分派。
- 空状态、导入区域和格式详情 popover。
- 单元测试与用户文档。

页面主文案保持紧凑，显示“支持 PDF、DOCX、HTML、Markdown、文本与常用代码文件”；完整扩展名与已验证、实验性、不支持状态放在“支持格式” popover 中。PDF 明确只提取文本层，扫描 PDF 与图片 OCR 均标记为未支持。格式说明不得只藏在文件选择器内。

未知扩展名不再读取前一律拒绝：读取字节后先执行文本/二进制检测，可确认是文本时按实验性通用文本导入，检测为二进制时返回 validation 阶段失败。已知二进制格式只进入专用 parser；已知但未接入 parser 的 Office、图片和压缩包在读取前返回明确能力状态。

### 3.4 拖放交互

拖放使用两种展示状态：

1. **空资料库**：文档主面板显示可点击的紧凑拖放入口，包含“选择文件”按钮和支持格式摘要。
2. **已有文档**：平时不占用布局；文件进入当前资料库工作区时显示全区域覆盖层，文案为“松开以导入到「资料库名称」”。

状态流程：

```text
文件进入工作区
  -> 校验当前资料库
  -> 校验仅文件、扩展名和多选数量
  -> 显示目标资料库覆盖提示
  -> 松开后调用统一 importPaths(paths)
  -> 解析 n/total
  -> 写入 n/total
  -> 刷新文档、分块和索引状态
  -> 展示成功数量与失败明细
```

约束：

- 没有当前资料库时不接收文件，提示先选择或创建资料库。
- 本阶段拒绝目录并说明“目录同步尚未开放”。
- 混合拖入时继续处理支持的文件，汇总不支持项和解析失败项。
- 点击选择与拖放必须调用同一个 `importPaths(paths)`，文件类型和错误行为不得分叉。
- Knowledge 依赖绝对 `sourcePath` 完成更新识别和来源回溯。关闭 Tauri 路径拖放 handler 后，H5 `File` 无法保证提供绝对路径，工作台必须提示改用“选择文件”，不得用文件名或虚构路径入库。
- 导入期间禁用重复投递，覆盖层显示当前解析或写入进度。
- 取消拖动、离开目标和按 Escape 后必须清理悬停状态。

## 4. 目标信息架构

```text
Knowledge
  顶层导航
    工作区
    设置

  工作区
    资料库列表
    当前资料库标题与索引摘要
    文档 / 检索测试
    当前资料库设置入口
    文件拖放覆盖层

  全局设置
    新资料库默认值
    导入与向量化
    检索测试默认值

  单资料库设置
    基础信息
    分块与导入
    检索默认值
    向量空间摘要
```

顶层只新增“工作区 / 设置”，不照搬 Recall 的统计、监控和实验室页面。单资料库设置从当前资料库标题区的设置图标进入，返回后保持当前资料库、文档选择和工作模式。

## 5. UI 施工要求

- 保持桌面生产力工具的紧凑密度，不新增营销式标题、装饰卡片或大面积空白。
- 复用 Element Plus、Lucide、`SettingListRenderer`、`BaseDialog` 和 `DropZone`。
- 页面与设置分组使用 `--card-bg`、`--input-bg`、`--sidebar-bg`、`--border-width`、`--border-color` 和 `backdrop-filter: blur(var(--ui-blur))`。
- 设置页采用受限内容宽度和清晰分组，不把每个字段包装成独立卡片。
- 卡片和输入区域遵循项目现有 6px 至 8px 圆角；圆形按钮仅用于纯图标命令。
- 图标按钮必须有 `aria-label` 和 tooltip。`el-dropdown` 与 tooltip 组合时在 tooltip 外包裹 `<div>`。
- 文档、资料库和结果选择项改为原生按钮或具备 Space、Enter、`aria-selected` 的等价语义。
- 使用容器宽度决定布局：宽布局常驻资料库侧栏，中窄布局通过选择器或对话框管理资料库，不保留挤压内容的固定 190px 侧栏。
- 拖放仅使用边框、背景和图标变化提供反馈，不增加无意义循环动画；遵守 `prefers-reduced-motion`。
- 浅色与深色主题均检查文本、边框、覆盖层和错误状态对比度。

## 6. 施工步骤

### Phase 1：统一配置与格式契约

- 新增 Knowledge 全局默认配置和 `createConfigManager` 持久化模块。
- 定义 `KnowledgeLibraryConfigV1`、默认值、深度合并和校验函数。
- 新增支持格式定义模块，替换文件选择器和解析器中的重复列表。
- 对未知扩展名执行文本/二进制检测；未知文本进入通用文本 parser，未知二进制返回明确错误。
- 为旧资料库的空 `config_json` 提供 V1 默认迁移，并把非空 legacy 配置与活动向量身份可重入地迁入 `library_metadata`；不在普通读取路径批量改写 manifest。

### Phase 2：补齐后端资料库配置接口

- 扩展创建 command，使其在新建 `library.kdb` 时写入配置快照和空活动向量身份。
- 新增更新资料库名称、说明和配置的 command、repository 方法及前端 service。
- `chunk_document`、摄取和重建从资料库配置读取分块参数。
- 校验 `targetChars > 0`、`overlapChars >= 0` 且 overlap 小于 target。
- 新增原子“应用配置并重建”操作。配置、活动向量身份、chunk、FTS、vector 和 graph 在同一个 library WAL 事务中提交；不得使用 `ATTACH` 更新 manifest。失败或崩溃恢复后不得留下新配置配旧索引、旧配置配新索引或部分重建状态。

### Phase 3：拆分模块壳层并实现设置页

- 将现有工作台从 `KnowledgeBase.vue` 拆到 `views/WorkspaceView.vue`，根组件负责顶层导航和 keep-alive。
- 新增 `views/SettingsView.vue`，使用 `SettingListRenderer` 管理全局创建默认值。
- 新增单资料库设置视图或聚焦组件，复用当前向量空间摘要和重建确认逻辑。
- 全局设置高频变化调用 `saveDebounced`；重置操作使用确认框并设置 `lockScroll: false`。
- 保持活动资料库和当前工作模式，不因进入设置页清空工作区上下文。

### Phase 4：实现统一导入与拖放

- 从当前 `importDocuments()` 提取 `selectImportPaths()` 和 `importPaths(paths)`。
- 在空资料库状态接入 `DropZone` 默认模式。
- 在有内容的工作区接入 `DropZone` overlay 模式。
- 配置 `multiple: true`、`fileOnly: true` 和共享 `accept` 列表。
- 失败结果增加可展开明细，显示文件名、路径、阶段和错误信息。
- 自动向量化开启时，只补齐当前向量空间未覆盖的 chunk；尚未建立空间时使用首选渠道创建空间。无可用首选渠道时保留关键词索引并给出可恢复提示，不能回滚已导入文档。
- Tauri 路径事件不可用时不消费 H5 `File` 入库，显示来源路径限制并保留点击选择入口。

### Phase 5：样式、响应式与可访问性收口

- 对齐 Recall 和项目主题 token，不复制 Recall 中已过时或不符合当前规范的局部样式。
- 按容器宽度重构资料库列表的常驻、选择器和弹层模式。
- 修复隐藏文字后的 tooltip、焦点态、Space 键和 `aria-selected`。
- 检查拖放覆盖层不会遮挡系统对话框、下拉菜单或正在进行的确认操作。

### Phase 6：文档与验证

- 更新 `ARCHITECTURE.md`、产品交互设计和用户指南的格式、设置与拖放说明。
- 回写本计划各 Phase 状态和实际偏差。
- 在隔离 appData 的真实 Tauri WebView 中完成文件选择与拖放验收。

## 7. 测试计划

### 7.1 前端单元测试

- 文件选择器、拖放 accept 和 parser 使用同一扩展名集合。
- 已知不支持格式在 `readFile` 前被拒绝；未知扩展名在读取后按文本/二进制检测结果分派。
- 支持与不支持文件混合拖入时，支持项继续处理并生成失败明细。
- 点击选择和拖放调用同一导入函数，进度与失败隔离行为一致。
- 全局默认配置加载、深度合并、重置和防抖保存正确。
- 修改全局默认值不会改变已存在资料库的配置对象。
- 单资料库设置切换时表单不串库，保存失败后保留用户输入。

涉及 Tauri API 的测试使用 `@tauri-apps/api/mocks`，覆盖文件对话框和 WebView 拖放事件契约。

### 7.2 Rust 测试

- 创建资料库在 `library_metadata` 保存配置快照；旧 manifest `{}` 按 V1 默认值迁移，非空 legacy 配置和活动向量身份迁移后重启仍可恢复。
- 更新名称、说明和配置后重启仍可恢复。
- 自定义分块参数影响 chunk 数量、offset 和 overlap。
- 重建失败时原 document、chunk、FTS、vector 和 graph 状态保持一致。
- 修改分块参数并成功重建后清除旧语义向量，关键词索引仍可用。
- 非法配置不能写入 `library_metadata`。
- 测试必须证明运行时配置和活动空间只从 library DB 读取；篡改或滞后 manifest legacy 字段不改变检索与重建行为。

### 7.3 Tauri 手工验收

- 文件选择器显示完整支持格式，页面能在不打开对话框时查看格式摘要。
- 单文件、多文件、重复路径、混合格式、空文件、未知二进制和目录拖入结果符合设计。
- Tauri 路径优先模式可以拖放导入；关闭 Tauri handler 的 H5 兼容模式明确提示改用文件选择，不生成虚假来源路径。
- 拖入覆盖层只在目标区域激活，离开、取消和导入完成后消失。
- 大、中、小三档窗口宽度下无文本遮挡、操作丢失或固定侧栏挤压。
- 浅色、深色主题下设置页、空状态、覆盖层、warning 和 error 对比度可读。
- 应用重启后全局设置、单库设置和活动资料库恢复正确。

### 7.4 工程检查

按仓库当前脚本执行：

```text
bun run lint
bun run check:frontend
bun run test:run
bun run build
bun run check:backend
```

Vite build 是必选项，不能用 TypeScript 类型检查替代。最终文件拖放和 Tauri IPC 验证必须在真实 Tauri 窗口完成，普通浏览器只可用于明确 mock 的纯前端测试。

## 8. 验收标准

- Knowledge 顶层存在“工作区 / 设置”，并有清晰的单资料库设置入口。
- 用户能配置新资料库默认值，已有资料库不会随全局默认值改变。
- 名称、说明和单库配置可保存、重启恢复，并有失败反馈。
- 修改分块参数必须经过明确重建确认，不会静默清除向量。
- 页面在文件选择器关闭时仍能查看支持格式；显示列表、选择器、拖放和解析器完全一致。
- 空资料库和已有文档状态都支持多文件拖放，点击选择与拖放共享处理流程。
- 未知格式、目录、空内容和解析错误有可定位明细，成功文件不会回滚。
- 响应式、键盘操作、tooltip、主题 token 和明暗主题达到本计划要求。
- 前端检查、相关测试、后端检查和 Vite build 全部通过。
- 在隔离 appData 的 Tauri WebView 中完成真实文件选择、拖放、重启恢复和模型调用验收。

## 9. 明确不做

- 不实现目录 watcher、递归目录导入或持久化 ingest queue。
- 不新增图片 OCR、扫描 PDF OCR、压缩包或未验证的 Office 格式。
- 不让全局设置在运行时覆盖已有资料库配置。
- 不把手工向量维度配置带入 Knowledge。
- 不复用 Recall store、Recall entry、标签池、priority 或联想召回参数。
- 不在普通浏览器中把 Vite 页面当作真实 Tauri 拖放验收环境。
