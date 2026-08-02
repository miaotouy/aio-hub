# Agent 模型参数适配规则设计草案

> 最后更新：2026-08-01
> 状态：构想记录，尚未排期实施
> 主要归属：`src/tools/agent-manager/`
> 关联模块：`src/tools/llm-chat/`、LLM Profile / Provider 参数支持、Agent 导入导出

## 1. 背景

当前 Agent 使用单个 `parameters` 对象保存生成参数。该结构默认假设同一个角色在不同模型上使用同一组参数，但实际使用中，同一个角色可能需要针对 Gemini、GPT、Claude、DeepSeek 等模型家族分别调整采样参数、输出长度和思考配置。

临时模型进一步放大了这一问题：切换临时模型时，当前实现只替换 `profileId` / `modelId`，继续沿用并过滤 Agent 原参数，无法表达“这个角色在不同模型上应使用不同参数”。

本草案记录一种以 Agent 为主要作用域的**模型参数适配规则列表**：规则随 Agent / 角色卡保存和分享，根据当前实际生效的模型匹配，多条命中规则按优先级叠加。全局规则仅保留为未来可能的低优先级兜底，本阶段不要求实现。

## 2. 核心结论

1. 模型参数匹配规则首先属于 Agent，而不是全局模型元数据。
2. 规则列表是角色适配的一部分，应随 AIO Hub Agent 导入导出。
3. 当前实际生效模型可能是 Agent 默认模型，也可能是输入区临时模型；两者使用同一套 Agent 规则求值。
4. 所有启用且命中的规则参与合并，低优先级先应用，高优先级覆盖低优先级。
5. 单个参数需要支持“未配置、指定值、禁用”三态。
6. 侧边栏不再直接铺开完整模型参数编辑器，只显示适配摘要并打开独立的规则列表编辑器。
7. 全局规则不是首期依赖；未来若实现，只作为 Agent 规则之前的可选兜底。

## 3. 目标与非目标

### 3.1 目标

- 支持一个 Agent 为不同 Provider、模型家族或精确模型保存不同生成参数。
- 支持基础“任意模型”规则与更高优先级匹配规则叠加。
- 支持规则折叠列表、完整编辑、启停、删除和命中测试。
- 支持显示最终参数及每个参数的来源规则。
- 支持临时模型按当前 Agent 规则重新匹配。
- 保证规则随 Agent 导入导出，从而成为角色卡可分享的适配配置。
- 保留请求前的模型能力过滤，错误规则不得直接形成非法请求。

### 3.2 非目标

- 首期不建设全局模型参数规则中心。
- 首期不把参数规则并入模型元数据 `properties`。
- 首期不让模型元数据全局规则在每次请求时动态补写参数。
- 首期不将上下文压缩、上下文后处理、图片压缩等非模型请求配置纳入匹配规则。
- 首期不要求支持在线规则目录、规则同步或内置规则更新系统。
- 首期不要求把外部角色卡格式中的非标准参数规则反向映射为其他软件的原生字段。

## 4. 用户可见模型

Agent 内显示一个“模型适配规则”列表：

```text
1. [匹配：Gemini] [优先级：50] [启用]   编辑 删除 ▼
   Temperature：1.2
   Max Tokens：8192

2. [匹配：gpt-*] [优先级：40] [启用]    编辑 删除 ▼
   Temperature：禁用
   Reasoning Effort：xhigh

3. [匹配：任意] [优先级：0] [启用]      编辑 删除 ▼
   Temperature：1
   Max Tokens：4096
   Top P：0.95
```

列表默认按优先级从高到低展示；实际求值时从低到高应用。

## 5. 匹配与合并语义

### 5.1 匹配对象

规则针对当前**实际生效模型**求值：

```text
存在临时模型 → 使用临时模型 profileId / modelId
否则         → 使用 Agent 默认 profileId / modelId
```

首期建议支持：

- 任意模型；
- Provider / Profile 类型；
- 模型 ID 精确匹配；
- 模型 ID 前缀匹配；
- 模型 ID 包含匹配；
- 模型 ID 正则匹配。

展示层可以显示 `gpt-*`，持久化层应保存规范化的 `prefix + "gpt-"`，避免隐式 glob 语义。

### 5.2 合并顺序

所有启用且命中的规则共同参与：

1. `priority` 低的先应用；
2. `priority` 高的后应用并覆盖同名参数；
3. 同优先级需要稳定次序，建议使用显式 `order`；
4. UI 规定同优先级时列表靠上的规则优先，执行时按其反向顺序应用；
5. `false`、`0`、空字符串均为显式值，不能当作缺失。

示例：

```text
[任意 P0]
Temperature = 1
Max Tokens = 4096
Reasoning = medium

[gpt-* P40]
Temperature = 禁用
Reasoning = xhigh
```

对 `gpt-5.2` 的结果：

```text
Temperature = 不发送
Max Tokens = 4096
Reasoning = xhigh
```

### 5.3 参数三态

每条规则对每个参数表达以下三态：

| 状态   | 含义                                                      |
| ------ | --------------------------------------------------------- |
| 未配置 | 本规则不干预，继续继承低优先级规则                        |
| 指定值 | 使用本规则值覆盖低优先级结果，并视为重新启用该参数        |
| 禁用   | 明确从最终请求中移除该参数，不能通过 `undefined` 表达删除 |

如果更高优先级规则再次指定已禁用参数，则该参数重新启用。

### 5.4 独占规则

类似模型元数据的 `exclusive` / “命中后停止继承低优先级规则”可以保留为后续能力，但不是首期必要条件。参数级“继承、覆盖、禁用”已经能覆盖主要场景。

## 6. 数据结构草案

```typescript
export type AgentParameterMatchOperator =
  "any" | "exact" | "prefix" | "contains" | "regex";

export interface AgentParameterRuleMatcher {
  target: "model" | "provider";
  operator: AgentParameterMatchOperator;
  value?: string;
}

export interface AgentModelParameterRule {
  id: string;
  name?: string;
  matcher: AgentParameterRuleMatcher;
  priority: number;
  order?: number;
  enabled: boolean;

  /** 本规则显式设置的请求参数 */
  values: Partial<LlmParameters>;

  /** 本规则显式禁用的参数键；JSON 中不能依赖 undefined 表达 */
  disabledParameters?: Array<keyof LlmParameters>;

  /** 后续可选能力 */
  exclusive?: boolean;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

Agent 暂定增加：

```typescript
interface AgentBaseConfig {
  // 现有字段
  parameters?: LlmParameters;

  // 新字段
  modelParameterRules?: AgentModelParameterRule[];
}
```

首期应限制 `values` 只接受模型请求参数白名单。虽然类型可暂时复用 `Partial<LlmParameters>`，解析器不得允许 `contextCompression`、`contextPostProcessing`、`imageCompression` 等字段进入模型匹配规则。

## 7. 与现有 `parameters` 的兼容

现有 Agent、导入文件和默认模板广泛使用 `parameters`，不能直接删除。

建议兼容顺序：

1. Agent 没有 `modelParameterRules` 时，继续按现有 `parameters` 行为执行；
2. 用户首次进入新规则编辑器时，可将现有 `parameters` 转换为一条 `[任意，P0]` 规则；
3. 转换必须预览，不静默删除旧字段；
4. 新规则链稳定后，再决定 `parameters` 是保留为额外 Agent 覆盖层，还是完全迁移到规则列表；
5. 导入旧角色卡时继续保留原参数语义。

首期更保守的求值方式：

```text
Agent 规则结果
    ↓
现有 agent.parameters（兼容覆盖层）
    ↓
会话覆盖
    ↓
临时模型手动覆盖（若后续实现）
    ↓
目标模型支持过滤
```

是否让旧 `parameters` 高于规则结果，需要在正式实施前通过迁移原型确认；最终目标应避免长期维护两套等价编辑入口。

## 8. 侧边栏与编辑器信息架构

### 8.1 侧边栏

当前 `ParametersSidebar.vue` 不再直接铺开完整 `ModelParametersEditor`。建议改为摘要：

```text
模型适配

默认模型：Gemini 3 Pro
规则数量：3
当前命中：Gemini P50、任意 P0
当前覆盖参数：4

[编辑模型适配规则]
```

侧边栏仍属于 Agent 配置，但不要求用户在狭窄区域编辑完整规则和参数。

### 8.2 规则列表 Drawer / Dialog

点击“编辑模型适配规则”打开独立界面：

- 列表按优先级排序；
- 支持启用、编辑、复制、删除；
- 折叠态显示匹配条件、优先级和参数摘要；
- 展开态显示完整参数、禁用项、描述和命中模型；
- 完整编辑使用 Dialog 或 Drawer，不在列表行内铺开所有控件；
- 提供“添加任意模型规则”“根据当前模型添加规则”等快捷动作。

### 8.3 参数编辑三态

每个参数使用明确的三态编辑：

```text
Temperature
○ 继承
● 指定值  [1.2]
○ 禁用
```

编辑器只保存当前规则的差异，不复制所有继承值。

### 8.4 当前模型测试

规则编辑器顶部提供模型测试选择器：

```text
测试模型：[OpenRouter · gpt-5.2]

命中规则：
✓ gpt-* P40
✓ 任意 P0
```

最终结果至少显示：

- 参数最终值；
- 是否禁用；
- 来源规则；
- 被哪条高优先级规则覆盖。

## 9. 临时模型

临时模型不维护独立规则列表，而是使用当前 Agent 的 `modelParameterRules` 重新求值：

```text
临时模型成为实际生效模型
    ↓
匹配当前 Agent 规则
    ↓
得到角色针对该模型的适配参数
    ↓
叠加输入区的临时手动覆盖
```

输入框临时模型胶囊可显示：

- 当前命中的 Agent 规则；
- 合并后的关键参数；
- 临时手动覆盖项；
- “编辑临时覆盖”入口。

临时覆盖只属于当前会话草稿，不修改 Agent 规则。

## 10. Agent 导入导出与分享

`modelParameterRules` 应被视为 Agent 的标准配置段：

- AIO Hub JSON / YAML / ZIP / PNG Agent 导出默认包含规则；
- 导入时进行结构校验、规则 ID 去重、正则合法性检查和参数白名单过滤；
- 角色卡预览中显示“包含 N 条模型适配规则”；
- 导入确认页允许用户查看规则摘要；
- 外部格式没有对应字段时，保存在 AIO Hub 扩展字段中，不伪造第三方原生语义；
- 导出时不得包含本地全局兜底规则。

该设计的主要价值是让角色作者可以同时分享“角色内容”和“角色针对不同模型的推荐运行参数”。

## 11. 全局规则：暂缓项

全局规则不是首期目标，也不是 Agent 规则正常工作的前置条件。

如果后续确有需求，可增加独立的全局兜底规则列表，推荐语义为：

```text
全局规则（可选、低层）
    ↓
Agent 规则（随角色分享、优先）
    ↓
会话 / 临时覆盖
```

届时需要额外解决：

- Agent 是否允许使用全局兜底；
- 导入角色卡时是否默认隔离本地全局规则；
- 如何保证作者与接收者的角色行为可复现；
- 全局规则与 Agent 规则同优先级时的确定性顺序；
- 全局规则是否只补缺失值，还是允许参与普通覆盖。

在这些语义明确前，不应为了“完整”提前接入全局规则。

## 12. 与模型元数据的边界

本规则列表可以参考模型元数据的匹配、优先级、禁用、测试和来源追踪交互，但两者职责不同：

- 模型元数据描述模型本身的能力、Token 限制、图标、API family 等事实；
- Agent 模型参数规则描述某个角色希望如何使用不同模型；
- Agent 规则随角色分享，模型元数据不应被角色卡修改；
- 运行时不得从全局模型元数据规则动态回退并覆盖 Agent 请求参数；
- 最终参数仍必须经过 Provider 支持表、模型能力和 `filterParametersForModel()` 清洗。

若未来抽取通用匹配核心，应复用确定性排序、正则校验和合并诊断，不复制第二套略有差异的算法。

## 13. 初步实施阶段

### Phase 0：契约与纯解析器

- 冻结规则类型、匹配类型和参数三态；
- 实现纯函数：匹配、排序、合并、来源追踪；
- 覆盖无匹配、多规则、禁用后重启用、同优先级和无效正则测试；
- 暂不接入聊天请求。

### Phase 1：Agent 存储与导入导出

- Agent 类型与存储增加 `modelParameterRules`；
- AIO Hub Agent 导入导出携带规则；
- 旧 `parameters` 保持兼容；
- 增加坏数据校验和迁移测试。

### Phase 2：规则列表 UI

- 侧边栏改为规则摘要；
- 新增规则列表 Drawer / Dialog；
- 新增规则编辑器和当前模型测试；
- 编辑器支持继承、指定值、禁用三态。

### Phase 3：聊天运行时与临时模型

- 发送、重新生成、继续生成、工具重新解析共用同一有效配置解析器；
- 临时模型使用当前 Agent 规则重新匹配；
- 参数来源可在调试或消息元数据中查看；
- 保留请求前最终过滤与参数快照。

### Phase 4：可选扩展

- 临时模型胶囊参数覆盖；
- 从临时覆盖创建 Agent 规则草稿；
- 全局低优先级兜底规则；
- 规则复制、模板和批量测试。

## 14. 预期影响范围

正式实施前至少需要审计：

- `src/tools/agent-manager/types/agent.ts`
- `src/tools/agent-manager/stores/agentStore.ts`
- `src/tools/agent-manager/services/agentImportService.ts`
- `src/tools/agent-manager/services/agentExportService.ts`
- `src/tools/agent-manager/components/management/EditAgentDialog.vue`
- `src/tools/llm-chat/components/sidebar/ParametersSidebar.vue`
- `src/tools/llm-chat/components/message-input/toolbar/ToolbarStatusCapsules.vue`
- `src/tools/llm-chat/config/parameter-config.ts`
- `src/tools/llm-chat/composables/chat/useChatHandler.ts`
- `src/tools/llm-chat/composables/chat/useChatExecutor.ts`
- `src/tools/llm-chat/composables/input/useChatInputManager.ts`

前端实施完成后，除定向单测和类型检查外，必须运行对应 Vite 构建；临时模型、分离窗口同步及真实请求链路不能仅以普通浏览器 mock 作为最终验收。

## 15. 待确认问题

1. 同优先级是否允许拖动排序，还是要求优先级唯一？
2. 首期是否支持 `exclusive`，还是只实现参数级禁用？
3. 现有 `agent.parameters` 最终作为规则之上的覆盖层，还是迁移成 `[任意 P0]` 后废弃？
4. Provider 匹配使用 Profile 类型、模型自身 provider，还是二者都支持？
5. 临时模型手动覆盖是否与规则列表首期一起实施？
6. Agent 导入时，正则规则是否默认启用，是否需要安全提示？
7. 参数规则是否允许自定义请求参数，若允许如何限制危险键和 Provider 冲突？
8. 全局规则是否有足够真实需求；在没有明确需求前保持暂缓。

## 16. 当前建议的最小可行版本

首期只实现：

- Agent 内规则列表；
- `任意 / Provider / exact / prefix / contains / regex` 匹配；
- 优先级合并；
- 参数继承、指定值、禁用；
- 当前模型测试和参数来源；
- AIO Hub Agent 导入导出；
- 临时模型按 Agent 规则重新匹配；
- 旧 `parameters` 无损兼容。

全局规则、独占规则、在线目录和自动绑定全部暂缓。

