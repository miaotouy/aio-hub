# 世界场景运行时与 MVU 兼容能力调查

**状态**: 调查完成，待进入架构设计  
**调查日期**: 2026-07-14  
**适用范围**: 桌面端 AIO Hub；移动端适配不在本轮调查范围内  
**建议工作名**: `world-runtime` / `scenario-runtime`（尚未定名）

## 1. 调查背景

本调查源于一种新的工具模块设想：作者能够创建预设世界、场景、角色、规则和前端页面，LLM 作为 GM 或 NPC，在受约束的结构化协议下生成剧情、对话和世界状态变更；运行时负责上下文选择、状态校验、存档回放和页面渲染，并可在后续支持多 Agent 协作。

社区同时提出了对 SillyTavern 生态中 MVU（MagVarUpdate）能力的需求，重点包括：

- 使用强类型变量记录长期剧情状态；
- 根据变量和剧情阶段程序化选择上下文，避免全量注入；
- 通过结构化命令更新变量，而不是每轮重写完整状态栏；
- 允许前端界面读取和修改状态；
- 兼容既有角色卡、世界书、正则和 MVU 资产；
- 用比 EJS 更容易阅读和维护的规则表达方式替代现有脚本组合。

本调查回答以下问题：

1. AIO Hub 当前已经具备哪些可复用能力？
2. MVU zod 的真实组成和协议是什么？
3. 哪些能力应由新模块原生提供，哪些应继续由现有模块负责？
4. 如何兼容酒馆资产而不复刻其插件堆叠和任意脚本环境？

## 2. 执行摘要

### 2.1. 核心结论

仓库已经具备较完整的外围地基，但尚不存在独立的世界场景运行时。

已有能力包括：

- `llm-chat` 的树状会话、消息级 Agent 绑定、上下文管线和会话变量快照；
- `agent-manager` 的角色预设、资产、世界书、正则、工具权限和导入导出；
- `st-worldbook-manager` 的 SillyTavern 世界书兼容；
- Chat 正则的 Render/Request 双阶段处理和 SillyTavern 正则导入；
- LLM API 层的 `json_schema` 结构化输出支持；
- `rich-text-renderer` 的 HTML 沙箱、动作按钮和变量变化展示；
- `web-canvas` 的前端项目模板、物理文件、Git 和独立预览；
- `tool-calling` 的工具循环、审批和超时；
- `skill-manager` 的受路径限制脚本执行与 Python 运行时探测；
- `fast-json-patch` 和跨窗口 JSON Patch 基础设施。

缺失的核心能力包括：

- 可版本化、可迁移的世界包格式；
- 独立于聊天消息的世界实例和存档模型；
- Schema 校验、Patch 归一化、规则校验和原子提交；
- 状态驱动的上下文编译器；
- 页面与宿主之间的受控双向状态协议；
- GM/NPC 调度、调用预算和多 Agent 冲突处理；
- MVU zod 的 initvar、Schema、JSON Patch 和脚本资产兼容层。

### 2.2. 推荐模块边界

建议新增独立的 `world-runtime`（暂名），而不是继续把核心能力塞入 `llm-chat` 或 `web-canvas`。

- `world-runtime`: 世界包、世界实例、状态引擎、事件日志、上下文编译、页面桥接、Agent 编排；
- `llm-chat`: 对话 UI 和上下文请求出口，通过适配器接收 `ContextPlan`；
- `web-canvas`: 作者编辑和预览场景页面，不作为世界状态真实来源；
- `agent-manager`: GM/NPC 配置来源；
- `st-worldbook-manager`: Lore 资产来源；
- Chat 正则: 输出清洗、隐藏更新块、Render/Request 差异处理；
- `rich-text-renderer`: 无自定义页面时的默认交互界面和 HTML 承载层。

## 3. AIO Hub 现有建设

### 3.1. Web Canvas

相关文件：

- `src/tools/web-canvas/ARCHITECTURE.md`
- `src/tools/web-canvas/web-canvas.registry.ts`
- `src/tools/web-canvas/types/template.ts`
- `src/tools/web-canvas/composables/useCanvasPreview.ts`
- `src/tools/web-canvas/components/window/CanvasPreviewPane.vue`

`web-canvas` 是 Physical-First 的 Agent 协作开发环境：

- 每个项目是独立物理目录和 Git 仓库；
- 支持模板初始化，模板类型已包含 `game`；
- Agent 可读写文件、应用 Diff、创建项目、提交或丢弃变更；
- iframe 预览能够捕获 console 和运行时错误并回传；
- 主窗口是画布状态真实来源，分离窗口只负责预览。

它适合作为世界页面的作者工具，但不能直接充当世界运行时：

- 当前状态模型是文件和 Git 状态，不是剧情世界状态；
- 当前 iframe 协议只处理 console/error，没有类型化的 State/Action 通道；
- 项目模板只有文件清单和入口文件，没有世界 Schema、角色、规则、存档和迁移概念；
- `CanvasPreviewPane` 的消息处理尚未校验 `event.source`，不能直接升级为加载第三方世界包的高信任通信桥。

### 3.2. Agent 与角色资产

相关文件：

- `src/tools/agent-manager/types/agent.ts`
- `src/tools/agent-manager/types/agentImportExport.ts`
- `src/tools/agent-manager/services/agentImportService.ts`
- `src/tools/agent-manager/services/agentExportService.ts`

当前 `ChatAgent` 已包含：

- 模型和参数；
- 预设消息和多个开局消息；
- 世界书、知识库和快捷操作绑定；
- 工具调用配置；
- 私有图片、音频、视频和文件资产；
- 正则配置；
- 视觉化输出指南；
- 会话变量配置；
- 虚拟时间配置。

Agent 导出支持 JSON、YAML、Zip、文件夹和 PNG 内嵌包，并可携带资产及世界书。该机制可作为世界包导入导出的实现参考，但世界包不应被建模为一个超大 Agent：一个世界可以包含多个 GM/NPC、多个页面和多个存档实例。

### 3.3. 会话变量系统

相关文件：

- `src/tools/llm-chat/types/sessionVariable.ts`
- `src/tools/llm-chat/core/context-processors/variable-processor.ts`
- `src/tools/llm-chat/docs/architecture/session-variable-system.md`

现有会话变量系统明确面向“剧情数值/状态机”场景：

- Agent 声明变量定义树和初始值；
- 模型在消息正文中输出 `<svar>`；
- 支持 `set/add/sub` 和基础算术操作；
- 数值可按 `min/max` 裁剪；
- 快照写入消息节点元数据；
- 能沿树状消息历史恢复、分支和确定性回放；
- 压缩节点会保留状态锚点；
- `$[path]` 和 `$[svars::json]` 可将状态重新注入上下文。

这是新状态引擎最直接的原型，但不宜直接扩展为完整世界状态层：

- 状态更新依赖聊天文本标签解析；
- Schema 只覆盖树结构、初始值和数值上下限；
- 不支持完整对象、数组、枚举、默认值、跨字段约束和迁移；
- 没有 Patch 事务、权限、事件来源和失败回滚；
- 状态与 ChatSession/ChatMessageNode 强绑定，无法自然承载非聊天页面操作和多 Agent 后台事件。

应复用其“消息快照 + 分支回放 + 压缩锚点”设计思想，而不是继续扩大 `<svar>` 协议。

### 3.4. 上下文管线

相关文件：

- `src/tools/llm-chat/types/pipeline.ts`
- `src/tools/llm-chat/core/pipeline/PipelineEngine.ts`
- `src/tools/llm-chat/stores/contextPipelineStore.ts`
- `src/tools/llm-chat/docs/architecture/context-pipeline.md`

统一上下文管线已经提供合适的集成点：

- `ContextProcessor` 有稳定的 ID、优先级、启用状态和日志；
- 处理器可增删改最终消息列表；
- `sharedData` 可在同一轮处理器之间传递临时数据；
- Store 支持动态注册、注销和排序处理器；
- 世界书、正则、知识库、变量、Token 限制和消息格式化已经按优先级执行。

建议由新模块注册一个稳定的 `world-context-processor`，把 `ContextPlan` 转换为管线消息。世界实例和持久状态不能存放在 `PipelineContext.sharedData`，后者只适合单轮临时黑板。

### 3.5. Chat 正则与酒馆兼容

相关文件：

- `src/tools/llm-chat/types/chatRegex.ts`
- `src/tools/llm-chat/utils/chatRegexUtils.ts`
- `src/tools/llm-chat/core/context-processors/regex-processor.ts`
- `src/tools/llm-chat/services/sillyTavernParser.ts`
- `src/tools/llm-chat/docs/architecture/chat-regex-pipeline.md`

现有正则系统已经覆盖 MVU 角色卡常见需求，新模块不应重做正则引擎。

已确认能力：

- Render 和 Request 两阶段；
- Global、Agent、User 三层规则；
- Message-Bound 绑定，历史消息使用生成时 Agent 的正则；
- 角色、深度、流式阶段过滤；
- 宏替换、捕获组后处理和可选替换脚本；
- 独立导入 SillyTavern 正则 JSON；
- 导入 Character Card v2/v3 时自动提取 `regex_scripts`；
- 将所有角色卡脚本合并为一个 Agent 正则预设。

关键映射：

| SillyTavern 字段     | AIO 映射                       | MVU 用途                 |
| -------------------- | ------------------------------ | ------------------------ |
| `markdownOnly: true` | `render: true, request: false` | 显示状态栏但不发给模型   |
| `promptOnly: true`   | `render: false, request: true` | 仅清理或修改模型上下文   |
| `placement`          | `targetRoles`                  | 区分用户、助手、系统内容 |
| `minDepth/maxDepth`  | `depthRange`                   | 限制历史深度             |
| `substituteRegex`    | `substitutionMode`             | 控制宏替换方式           |

已知兼容边界：

- SillyTavern `SLASH_COMMAND` placement 被忽略；
- `WORLD_INFO` 暂映射为 system 角色；
- AIO 的替换脚本不是 EJS 提示词模板，不能用来替代状态驱动的上下文编译器。

### 3.6. 结构化输出和 Patch 基础

相关文件：

- `src/tools/llm-chat/types/llm.ts`
- `src/llm-apis/adapters/openai/chat.ts`
- `src/llm-apis/adapters/openai/responses.ts`
- `src/llm-apis/adapters/gemini/utils.ts`
- `src/utils/sync-helpers.ts`
- `package.json`

底层请求类型已支持：

- `text`；
- `json_object`；
- `json_schema`；
- OpenAI Chat `response_format`；
- OpenAI Responses `text.format`；
- Gemini `responseMimeType/responseSchema`。

当前聊天执行链仍将响应作为普通文本流保存，没有场景级 JSON 解析、Schema 二次校验、自动修复重试和原子状态提交。

仓库已直接依赖 `fast-json-patch`，跨窗口同步也已有 Patch 生成和应用辅助函数。该依赖只支持标准 JSON Patch；MVU 的 `delta` 和 `insert` 需要先归一化为内部事件或标准 Patch。

### 3.7. 富文本渲染和交互页面

相关文件：

- `src/tools/rich-text-renderer/ARCHITECTURE.md`
- `src/tools/rich-text-renderer/components/HtmlInteractiveViewer.vue`
- `src/tools/rich-text-renderer/components/nodes/ActionButtonNode.vue`
- `src/tools/rich-text-renderer/components/nodes/SvarNode.vue`

现有渲染器已支持：

- LLM 流式 Markdown/HTML；
- HTML SPA iframe 沙箱、CSP、日志捕获和 CDN 本地化；
- `send/input/copy` 白名单动作按钮；
- `<svar>` 变量变更徽章；
- Agent 私有资产解析；
- iframe 消息来源校验。

它适合提供默认场景 UI，也可作为自定义页面宿主的参考。当前动作按钮只面向聊天输入和发送，尚不能表达世界 Intent、状态补丁和事务结果。

### 3.8. 多 Agent 现状

相关文件：

- `src/tools/llm-chat/composables/chat/useChatExecutor.ts`
- `src/tools/llm-chat/types/message.ts`

当前系统支持：

- 每次请求指定一个 Agent；
- 每条消息记录生成它的 Agent 快照；
- 同一会话历史中切换不同 Agent；
- 工具调用循环和同轮工具并行。

当前不存在：

- GM 到 NPC 的自动调度；
- 多 Agent 共享同一世界事务；
- Agent 之间的上下文隔离和信息权限；
- 每轮最大调用数、模型分层和成本预算；
- 多个 Agent 提案之间的冲突裁决。

工具调用编排器不能等同于多 Agent 编排器。

## 4. MVU zod 外部调查

### 4.1. 名称与依赖关系

MVU 的上游项目为 [MagVarUpdate](https://github.com/MagicalAstrogy/MagVarUpdate)，仓库描述为“以 `_.set` 风格更新变量”。当前默认分支为 `beta`，使用 MIT License，主要语言为 TypeScript。

教程当前推荐的是 MVU zod。运行一张完整的酒馆 MVU zod 角色卡通常依赖：

- SillyTavern；
- 酒馆助手（JS-Slash-Runner）；
- 提示词模板扩展（ST-Prompt-Template）；
- 角色内嵌的 MagVarUpdate bundle；
- 角色脚本、世界书、正则和可选前端页面。

教程明确区分：MVU 本身主要负责变量维护；EJS 属于提示词模板扩展；前端和脚本能力来自酒馆助手。AIO 的兼容实现应按职责拆分，而不是把整个插件组合视为一个不可分割引擎。

### 4.2. MVU zod 的四个核心组成

#### 4.2.1. 强类型变量 Schema

作者通过 Zod 定义世界变量：

- `object/record/array`；
- `string/boolean/coerce.number`；
- `literal/union/enum`；
- `prefault` 默认值；
- `transform` 数据修正；
- 动态对象键；
- 跨字段派生和集合裁剪。

示例用途包括：

- 好感度裁剪至 0-100；
- 依据好感度限制称号数量；
- 删除数量不为正的物品；
- 为动态 NPC 字段补默认值；
- 将旧存档迁移到新结构。

Zod `transform` 可以执行任意 JavaScript，这使其很强，但也意味着不能无损序列化为简单 JSON Schema。兼容层必须区分可移植 Schema 子集和受信任脚本扩展。

#### 4.2.2. initvar 初始化

变量初始值使用 YAML 表达，来源可以是：

- 名称包含 `[initvar]` 的禁用世界书条目，作为通用保底；
- 开局消息中的 `<initvar>...</initvar>`，覆盖通用初始化；
- 旧版 `_.set` 命令。

初始化值会先经过 Schema 解析、默认值填充和 transform，再成为当前消息楼层的状态。

#### 4.2.3. 扩展 JSON Patch 更新协议

推荐输出格式为：

```xml
<UpdateVariable>
<Analysis>...</Analysis>
<JSONPatch>
[
  { "op": "replace", "path": "/角色/好感度", "value": 35 },
  { "op": "delta", "path": "/角色/体力", "value": -10 },
  { "op": "insert", "path": "/物品栏/钥匙", "value": { "数量": 1 } },
  { "op": "remove", "path": "/任务/旧任务" },
  { "op": "move", "from": "/队伍/0", "to": "/队伍/2" }
]
</JSONPatch>
</UpdateVariable>
```

它借用 RFC 6902 JSON Patch，但使用以下操作集合：

- `replace`；
- `delta`（非 RFC 6902）；
- `insert`（对应对象新增或数组追加，非标准命名）；
- `remove`；
- `move`。

旧版 `_.set/_.add/_.insert/_.remove` 命令仍保留兼容。

#### 4.2.4. 消息级状态与事件

MagVarUpdate 会：

- 从最近有效消息读取旧变量；
- 解析当前用户或助手消息中的更新命令；
- 执行更新和 Schema 检查；
- 把新状态写入消息变量；
- 在助手消息末尾添加 `<StatusPlaceHolderImpl/>`；
- 发出初始化、解析完成、更新开始、单变量更新、更新结束等事件。

教程展示的事件包括：

- `VARIABLE_INITIALIZED`；
- `VARIABLE_UPDATE_STARTED`；
- `COMMAND_PARSED`；
- `VARIABLE_UPDATE_ENDED`；
- `SINGLE_VARIABLE_UPDATED`。

脚本可在事件阶段修正命令、限制单轮变化、维护派生字段、删除无效实体和触发剧情旗标。

### 4.3. 状态驱动的上下文注入

MVU zod 的上下文选择主要不由 MVU 本体完成，而由 EJS 提示词模板和酒馆助手注入 API 完成。

常见 EJS 模式：

```ejs
<%_ if (getvar('stat_data.世界.当前地点') === '酒馆') { _%>
酒馆相关设定
<%_ } _%>
```

它还支持：

- `if/else if/else` 阶段人设；
- `getvar()` 读取变量；
- `getwi()` 读取其他世界书条目；
- `matchChatMessages()` 按近期消息激活；
- `print()` 输出提示词；
- `injectPrompts()` 注入预扫描文本或直接注入提示词；
- `filter()` 基于实时状态决定是否注入；
- 粘性、冷却、概率和世界书递归等酒馆机制。

其核心价值不是 EJS 语法，而是：

> 根据当前世界状态生成本轮上下文计划，只披露当前地点、角色、阶段和事件所需的信息。

新模块应将其实现为结构化 `ContextPlan`，而不是允许脚本直接修改 Chat 消息数组。

### 4.4. 前端状态栏与交互页面

MVU 常用正则将 `<StatusPlaceHolderImpl/>` 替换为：

- 纯文本状态；
- HTML/CSS 状态栏；
- 可交互前端界面；
- 商城、技能、任务、地图和开局选择器。

前端可以直接修改消息楼层变量。教程建议另设“系统日志”变量记录玩家操作，否则剧情模型只会看到数值无原因变化。

新模块应把这类日志提升为一等事件：页面提交 Intent，宿主生成带来源和摘要的事件事务。这样既能更新状态，也能向 GM 提供可理解的行为原因。

### 4.5. Python 需求的真实含义

现有 MVU zod 并不使用 Python；它使用 TypeScript/Zod、JavaScript 和 EJS。

社区所说的“用 Python 实现”更接近以下诉求：

- 规则语法更容易阅读；
- 有类型提示和编辑器支持；
- 不必在文本模板中混写 EJS；
- 规则可以测试、复用和由 AI 生成；
- 上下文控制逻辑与 UI/正则解耦。

因此 Python 是新作者语言候选，不是旧资产兼容协议。

## 5. 能力复用矩阵

| 能力                | 当前状态     | 归属建议               | 处理方式                     |
| ------------------- | ------------ | ---------------------- | ---------------------------- |
| 角色卡导入          | 已有         | Agent Manager          | 复用并扩展世界包编排         |
| 世界书导入和扫描    | 已有         | Worldbook + Chat       | 原样复用                     |
| 酒馆正则导入        | 已有         | Chat Regex             | 原样复用，不重做             |
| Render/Request 分离 | 已有         | Chat Regex             | 原样复用                     |
| 消息状态快照        | 轻量已有     | World Runtime          | 提取设计思想，建立独立实例   |
| JSON Schema 请求    | API 层已有   | LLM API                | 复用请求适配                 |
| 响应 Schema 校验    | 缺失         | World Runtime          | 新建                         |
| 标准 JSON Patch     | 依赖已有     | Shared/World Runtime   | 复用 `fast-json-patch`       |
| MVU delta/insert    | 缺失         | MVU Adapter            | 归一化为内部事件             |
| EJS 条件上下文      | 缺失         | Context Compiler       | 常见模式转换，核心不执行 EJS |
| HTML 页面渲染       | 已有         | Rich Text/Web Canvas   | 复用和加固                   |
| 页面状态双向通信    | 缺失         | View Bridge            | 新建能力协议                 |
| 多 Agent 自动调度   | 缺失         | Orchestrator           | 后续阶段新建                 |
| Python 外部执行     | Skill 中已有 | Authoring/Trusted Mode | 不作为默认逐轮运行时         |

## 6. 建议架构

### 6.1. 总体数据流

```text
用户输入 / 页面 Intent / 系统 Tick
                │
                ▼
         World Runtime
       读取 WorldInstance
                │
                ▼
        Context Compiler
       生成 ContextPlan
                │
                ▼
       Agent Orchestrator
     选择 GM / NPC / 模型
                │
                ▼
      LLM Structured Output
        生成 TurnProposal
                │
                ▼
  Parse → Normalize → Validate
                │
                ▼
       WorldEvent Transaction
                │
                ▼
      Reducer + Schema + Rules
                │
                ▼
    新状态 + 事件日志 + ViewModel
```

### 6.2. 世界包与世界实例分离

```text
WorldPackage                         WorldInstance
├── manifest.yaml                    ├── instance.json
├── schemas/                         ├── snapshots/
├── rules/                           ├── events/
├── context/                         ├── branches/
├── actors/                          └── runtime.json
├── views/
├── assets/
└── compat/
```

- `WorldPackage` 是作者发布的只读定义；
- `WorldInstance` 是某次游玩或运行产生的状态；
- 同一个世界包可以创建多个实例；
- 世界包升级通过 migrations 迁移实例；
- 导入的酒馆正则放入 `compat/regex` 或绑定到关联 Agent，不进入状态引擎。

### 6.3. 内部事件模型

不建议让 LLM、页面或脚本直接修改状态对象。所有外部变更先转换为内部事件：

```ts
type WorldEvent =
  | { type: "set"; path: string; value: unknown }
  | { type: "increment"; path: string; delta: number }
  | { type: "insert"; path: string; value: unknown }
  | { type: "remove"; path: string }
  | { type: "move"; from: string; to: string };

interface WorldTransaction {
  id: string;
  source: "player" | "view" | "gm" | "npc" | "rule" | "system";
  summary?: string;
  events: WorldEvent[];
  timestamp: number;
}
```

事务提交前执行：

1. 路径权限检查；
2. 操作类型检查；
3. Schema 校验；
4. 规则校验和派生变更；
5. 资源和调用预算检查；
6. 原子提交；
7. 写事件日志和必要快照；
8. 推送新 ViewModel。

### 6.4. ContextPlan

建议把上下文选择结果建模为结构化计划：

```ts
interface ContextPlan {
  fragments: Array<{
    id: string;
    role: "system" | "user" | "assistant";
    position: string;
    priority: number;
    contentRef: string;
    cacheKey?: string;
  }>;
  activeActors: string[];
  outputSchemaRef: string;
  budget: {
    maxContextTokens: number;
    maxAgentCalls: number;
  };
}
```

声明式规则示例：

```yaml
id: location-tavern
when: state.world.location == "酒馆"
include: context/locations/tavern.md
role: system
priority: 300
```

这可以覆盖大部分 EJS `if + getvar + getwi` 用法，同时支持可视化编辑、静态分析、Token 预估和调试解释。

### 6.5. 页面桥接协议

建议采用宿主控制的消息协议：

```text
宿主 → 页面
  VIEW_INIT
  WORLD_SNAPSHOT
  TRANSACTION_RESULT
  VIEW_EFFECT

页面 → 宿主
  VIEW_READY
  USER_INTENT
  REQUEST_ACTION
```

安全要求：

- 校验 `event.source` 和每个 View 实例的随机通道令牌；
- 页面只读取裁剪后的 ViewModel，不直接获得完整世界状态；
- 页面只能提交 Intent，不能调用任意状态 Setter；
- 网络、文件、剪贴板、模型请求和窗口能力按 capability 显式授权；
- 默认页面不允许访问 Tauri API；
- 第三方世界包的脚本和资源执行应有信任级别与安装预检。

### 6.6. 多 Agent 编排

多 Agent 不应默认让所有 NPC 每轮调用模型。推荐按需调度：

- GM 负责叙事、裁决和最终提案；
- NPC 只在当前场景、被点名或规则要求时调用；
- 规则引擎优先处理确定性状态变化；
- 检索、摘要和数据库 Agent 按阈值后台运行；
- 每个世界包声明 `maxAgentCallsPerTurn`；
- 支持给不同角色绑定不同价位或能力的模型；
- 所有 Agent 只能提交提案，由统一运行时提交事务。

## 7. 作者规则语言评估

### 7.1. 不建议把系统 Python 作为默认运行时

AIO 已能通过 Skill Manager 发现并执行系统 Python，但这不适合每轮世界规则：

- 用户不一定安装 Python；
- 外部进程启动和 IPC 有额外成本；
- 第三方依赖难以随世界包稳定分发；
- 当前 Skill 安全以路径校验为主，不是完整进程能力沙箱；
- 任意 Python 默认能够访问文件、网络和子进程；
- 桌面和移动端的一致性较差。

外部 Python 更适合：

- 世界包构建和导入转换；
- 作者本地测试；
- 受信任开发模式；
- 离线数据生成与迁移工具。

### 7.2. 推荐三层作者能力

1. **可视化规则编辑器**：地点、旗标、数值区间、角色关系和事件触发；
2. **声明式 YAML/JSON**：覆盖大部分条件上下文和状态规则；
3. **Python 风格受限脚本**：处理复杂计算，但只接收受控输入并返回结构化结果。

三层最终编译到同一规则 IR。

### 7.3. 候选实现

| 方案            | 优点                              | 风险                           | 建议           |
| --------------- | --------------------------------- | ------------------------------ | -------------- |
| YAML + 表达式   | 可移植、易检查、易做 UI           | 复杂逻辑表达能力有限           | 作为核心格式   |
| Starlark        | Python 风格、确定性、默认能力受限 | 需评估 Rust/前端实现和调试体验 | 优先 PoC       |
| RustPython      | Python 兼容度高                   | 包体、性能和沙箱复杂           | 暂不优先       |
| 系统 Python     | 生态完整                          | 环境不一致且高风险             | 仅可信开发模式 |
| 任意 JavaScript | 与现有栈一致                      | 容易重演 EJS/插件耦合          | 不作为默认格式 |

规则函数应保持纯函数风格：读取 State/Turn，返回 `ContextPlan`、`WorldEvent[]` 或 `AgentPlan`，不能直接操作 Chat Store、DOM、文件和网络。

## 8. MVU 兼容策略

### 8.1. 兼容层级

#### Level 0: 资产识别

- 识别角色卡中的 MVU bundle、`[initvar]`、`[mvu_update]`、`<UpdateVariable>` 和状态占位符；
- 展示依赖和兼容预检报告；
- 不静默执行未知脚本。

#### Level 1: 数据协议兼容

- 导入 `[initvar]` YAML；
- 解析 `<UpdateVariable>/<JSONPatch>`；
- 支持 `replace/delta/insert/remove/move`；
- 兼容旧 `_.set/_.add/_.insert/_.remove` 的常见子集；
- 保存消息级导入来源和迁移信息。

#### Level 2: Schema 兼容

- 转换常见 Zod 类型；
- 支持 enum、默认值、数值转换、record 和数组；
- 将常见 clamp、过滤和派生 transform 转换为规则 IR；
- 任意 JavaScript transform 标记为“需要人工迁移”或“可信脚本模式”。

#### Level 3: 上下文规则兼容

- 转换常见 `if/else + getvar + getwi`；
- 映射近期消息匹配、概率、楼层和时间条件；
- 复用现有世界书粘性、冷却、递归和正则；
- 任意 EJS/TavernHelper API 输出明确的未兼容报告。

#### Level 4: 页面兼容

- 复用导入的 Render/Request 正则；
- 支持 `<StatusPlaceHolderImpl/>` 生成静态或 HTML 状态栏；
- 为可交互页面提供兼容 SDK，将旧变量操作适配为 `USER_INTENT`；
- 不暴露 TavernHelper 全局对象或任意宿主 API。

### 8.2. 不建议原生复刻的内容

- 完整 SillyTavern 插件生命周期；
- 完整 EJS 执行环境；
- TavernHelper 全 API；
- 通过正则拼装业务状态；
- 任意角色脚本自动执行；
- 依赖系统 Python 的可分发世界包；
- 每轮 6-7 次无预算的默认 Agent 调用。

## 9. 建议实施阶段

### Phase 0: 兼容性 PoC

- 建立独立调查样例，不接入正式 UI；
- 导入一张公开 MVU zod 示例卡；
- 解析 initvar 和扩展 JSON Patch；
- 复用现有角色卡、世界书和正则导入；
- 对比 AIO 状态快照与 MVU 消息楼层状态；
- 输出无法转换的 Zod/EJS/脚本清单。

### Phase 1: 单 GM 世界运行时

- 定义 `WorldPackage/WorldInstance/WorldEvent`；
- 实现 Schema、事务、快照和回放；
- 实现声明式 ContextPlan；
- 接入单个 GM Agent；
- 使用现有 Rich Text Renderer 提供默认玩家界面；
- 完成存档、回滚和调试日志。

### Phase 2: 作者工坊与自定义页面

- Web Canvas 世界模板；
- Schema 和规则编辑器；
- View Bridge 与 capability 权限；
- 世界包安装、导出和迁移；
- 页面 Intent 和事件日志可视化。

### Phase 3: MVU 导入增强

- 常见 Zod Schema 转换；
- 常见 EJS 条件转换；
- 状态栏兼容 SDK；
- 迁移报告和人工修复工作流；
- 建立公开兼容样例测试集。

### Phase 4: 多 Agent

- GM/NPC 调度策略；
- Agent 信息权限和上下文切片；
- 调用预算、并发和模型分层；
- 冲突裁决和后台任务；
- 性能、Token 和长时间运行评估。

## 10. 风险与注意事项

| 风险           | 说明                                             | 缓解方向                         |
| -------------- | ------------------------------------------------ | -------------------------------- |
| 任意脚本执行   | Zod transform、EJS 和前端可能包含任意 JS         | 默认转换为 IR；可信模式显式授权  |
| 状态与聊天耦合 | 直接扩展 `<svar>` 会限制非聊天页面和后台事件     | 新建独立 WorldInstance           |
| Schema 演进    | 作者升级世界包后旧存档可能失效                   | manifest 版本和 migrations       |
| Token 失控     | 多 Agent 和全量状态注入成本高                    | ContextPlan、预算、渐进式披露    |
| 状态幻觉       | 模型提交非法路径或不合理数值                     | Schema + Rule + 权限三层校验     |
| 页面越权       | 第三方 iframe 可能尝试访问宿主能力               | capability、令牌、来源校验和 CSP |
| 兼容承诺过大   | 完整模拟酒馆插件生态成本不可控                   | 分级兼容和预检报告               |
| 双状态源       | Chat 消息变量和 WorldInstance 同时可写会产生冲突 | WorldInstance 为唯一真实来源     |

## 11. 待决策事项

1. 模块对外名称使用“世界运行时”“场景引擎”还是“交互世界工坊”；
2. 世界状态 Schema 以 JSON Schema 为核心，还是引入独立 Zod 作为作者层；
3. Python 风格脚本是否采用 Starlark，及其 Rust/前端运行位置；
4. WorldInstance 是否仍与 ChatSession 建立一对一绑定，还是允许一个实例包含多条对话线程；
5. 世界包中的 Agent 是引用全局 Agent、复制快照，还是支持两种模式；
6. 首个 PoC 选择哪张公开、许可明确的 MVU zod 示例卡；
7. 自定义页面的可信等级、签名和 capability 授权交互；
8. 移动端是否只支持声明式 View，还是也加载自定义页面；
9. 多 Agent 是否作为同一模块的后续能力，还是独立编排服务。

## 12. 建议的下一步

在写正式架构文档前，建议先完成一个窄范围 PoC：

1. 选取一个公开 MVU zod 示例；
2. 用现有 SillyTavern Parser 导入 Agent、世界书和正则；
3. 新写独立解析器读取 initvar 和 `<JSONPatch>`；
4. 将 MVU 操作归一化为 `WorldEvent[]`；
5. 用现有 `fast-json-patch` 或 Reducer 应用到独立内存状态；
6. 验证分支回放、Render/Request 正则和状态栏显示；
7. 记录 Zod transform、EJS 和前端脚本的未兼容项。

PoC 通过后，再在 `docs/architecture/` 创建正式架构文档，并在 `docs/Plan/` 编写分阶段实施计划。

## 13. 外部参考

- [手写 MVU zod 变量卡](https://github.com/StageDog/stagedog.github.io/blob/main/%E7%BB%9C%E7%BB%9C/%E6%95%99%E7%A8%8B/%E6%89%8B%E5%86%99mvu%E5%8F%98%E9%87%8F%E5%8D%A1/index.md)
- [MagVarUpdate](https://github.com/MagicalAstrogy/MagVarUpdate)
- [MVU zod 变量输出格式](https://github.com/StageDog/tavern_helper_template/blob/main/%E5%88%9D%E5%A7%8B%E6%A8%A1%E6%9D%BF/%E8%A7%92%E8%89%B2%E5%8D%A1/%E6%96%B0%E5%BB%BA%E4%B8%BAsrc%E6%96%87%E4%BB%B6%E5%A4%B9%E4%B8%AD%E7%9A%84%E6%96%87%E4%BB%B6%E5%A4%B9/%E4%B8%96%E7%95%8C%E4%B9%A6/%E5%8F%98%E9%87%8F/%E5%8F%98%E9%87%8F%E8%BE%93%E5%87%BA%E6%A0%BC%E5%BC%8F.yaml)
- [酒馆助手文档](https://n0vi028.github.io/JS-Slash-Runner-Doc/)
- [ST-Prompt-Template](https://github.com/zonde306/ST-Prompt-Template)
- [JSON Patch RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902)
- [Zod](https://zod.dev/)

## 14. 仓库内参考

- `src/tools/llm-chat/ARCHITECTURE.md`
- `src/tools/llm-chat/docs/architecture/context-pipeline.md`
- `src/tools/llm-chat/docs/architecture/session-variable-system.md`
- `src/tools/llm-chat/docs/architecture/chat-regex-pipeline.md`
- `src/tools/web-canvas/ARCHITECTURE.md`
- `src/tools/rich-text-renderer/ARCHITECTURE.md`
- `src/tools/st-worldbook-manager/ARCHITECTURE.md`
- `docs/architecture/agent-tool-skill-integration.md`

## 15. 变更记录

| 日期       | 变更                                                             |
| ---------- | ---------------------------------------------------------------- |
| 2026-07-14 | 初版调查：整合仓库摸查、MVU zod 原文调查、正则复用修正和建议架构 |

