# 容器元素语义与装饰样式对应方案

> **状态**：Approved（已批准并沉淀为常驻规范【kilo做的于是目前是写在kilo的目录中，其他ai有需要可以改成通用目录】）
> **日期**：2026-08-24
> **范围**：桌面端 `src/**` 与移动端 `mobile/src/**` 的容器、卡片、列表项和信息块视觉装饰  
> **背景**：统一治理“容器左侧单边粗描边高亮”在不同语义中的使用方式，降低高密度页面中的竖线噪音。

---

## 1. 背景与问题

当前项目中，左侧粗描边同时承担了多种不同职责：

- 当前选中、激活状态；
- Warning / Error 等严重度提示；
- 消息角色和事件类型分类；
- 日志等级和监控事件编码；
- Markdown 引用、说明和 Alert 内容块；
- 工具调用、调试输出和普通信息容器；
- 拖拽、调整尺寸等交互反馈。

这种做法单独看通常没有问题，但当多个语义在同一页面组合出现时，用户无法仅通过视觉形式快速判断左侧色条到底代表“选中”“告警”“类型”还是“普通装饰”。尤其是 LLM Chat、VCP Monitor、LLM Inspector 等高密度页面，所有内容块都使用相似的 3px / 4px 左边线，会导致视觉层级变平。

### 1.1 现状统计

本次统计覆盖 `src/**` 与 `mobile/src/**`，排除了 `node_modules`、构建产物和独立插件仓库：

| 统计口径                                  |                    数量 |
| ----------------------------------------- | ----------------------: |
| `border-left: >=2px ...` 原始声明         | 86 条，分布在 58 个文件 |
| 排除 VideoPlayer 三角形绘制后的候选声明   |                   84 条 |
| 再排除 2px 虚线分隔用途后的实心强调线候选 |                   83 条 |
| 桌面端命中文件                            |                   47 个 |
| 移动端命中文件                            |                   11 个 |
| 3px 声明                                  |                   52 条 |
| 4px 声明                                  |                   20 条 |
| 额外的左侧 inset 阴影等价实现             |                    2 处 |

3px 与 4px 声明合计约占直接声明的 84%，说明项目中已经形成了较统一但偏强烈的左侧强调习惯。

使用密度最高的区域为：

1. `src/tools/llm-chat`：16 条；
2. `src/tools/vcp-connector`：11 条；
3. `src/tools/llm-inspector`：5 条；
4. `src/tools/recall`：5 条。

这些区域应作为第一批收敛对象。

---

## 2. 设计目标

### 2.1 目标

1. 让相同视觉装饰只表达相近语义。
2. 让普通容器回归结构表达，不默认带有彩色强调线。
3. 保留左侧线在引用、持久性告警和选中态中的有效性。
4. 为角色、类型、日志等级等高频分类语义提供更轻量的视觉方案。
5. 降低同屏多个彩色竖线带来的视觉噪音。
6. 保持桌面端和移动端的语义一致，同时允许移动端采用更紧凑的表现。
7. 新增样式时可以通过明确规则判断是否允许使用左侧粗描边。

### 2.2 非目标

本方案不要求：

- 一次性删除所有 `border-left`；
- 将所有组件强制改造成统一卡片；
- 替换 Markdown、富文本或第三方组件内部的必要语义样式；
- 用单一颜色替代所有状态颜色；
- 通过新增全局组件抽象来掩盖组件本身的层级问题。

---

## 3. 核心原则

### 3.1 结构与状态分离

普通容器只表达结构，选中、告警、失败等状态通过独立的状态装饰表达。

- 结构：1px 中性边框、背景层级、间距和分组标题；
- 交互：2px 主色边线、背景变化或 focus outline；
- 内容语义：3px 左侧线，仅用于引用和强语义内容；
- 分类：Badge、图标、色点或标签；
- 严重度：图标、状态文案、语义背景，必要时才增加色条。

### 3.2 一个视觉手段只承担一个主语义

左侧粗描边不应同时表示：

- 当前选中；
- 角色类型；
- 错误等级；
- 内容引用；
- 普通信息块。

如果一个组件同时拥有多个状态，应优先使用组合方式表达，例如“选中背景 + 角色 Badge”，而不是继续叠加多条边线。

### 3.3 高密度列表优先使用低面积装饰

日志、事件、消息和监控列表中，优先使用：

- 6px 左右的状态点；
- 图标；
- 小型 Badge / Tag；
- 标题颜色；
- 行背景的轻微色阶。

不建议让列表中的每一行都拥有 3px 或 4px 的整高色条。

### 3.4 不能只依赖颜色

颜色应与图标、文字标签、形状或位置组合使用。角色、事件类型和严重度尤其不能仅通过红、黄、绿、蓝等颜色区分。

---

## 4. 语义与装饰样式映射

### 4.1 总览表

| 语义              | 首选装饰                       | 次选装饰           | 左侧粗描边规则             |
| ----------------- | ------------------------------ | ------------------ | -------------------------- |
| 普通容器 / 分组   | 1px 全边框 + 背景层级          | 标题、分隔线、间距 | 禁止                       |
| Hover             | 背景变化 + 边框颜色变化        | 轻微阴影           | 禁止新增                   |
| Selected / Active | 浅色背景 + 2px 主色左线        | 主色 outline       | 允许，仅交互态             |
| Focus             | `outline` / focus ring         | 外部阴影           | 不用左线                   |
| Info              | 信息图标 + 淡色背景            | 1px 语义边框       | 默认不用，必要时 2px       |
| Warning           | 警告图标 + 标签 + 淡色背景     | 语义边框           | 持久性告警才允许 2–3px     |
| Error             | 错误图标 + 操作建议 + 淡色背景 | 语义边框           | 阻断性错误允许 3px         |
| Success           | 成功图标 + 状态点 + 淡色背景   | 成功 Badge         | 不用粗左线                 |
| 消息角色          | 图标 + Role Badge              | 标题色 + 状态点    | 禁止默认粗左线             |
| 事件 / 数据类型   | 状态点 + Type Badge            | 类型图标           | 禁止默认粗左线             |
| 日志等级          | 图标 + 等级标签                | 行首状态点         | 禁止每行使用粗左线         |
| 引用 / Blockquote | 低饱和 3px 左线 + 背景         | 引号图标           | 允许，专属语义             |
| Tool Call / Code  | 1px 边框 + 标题栏 + 折叠       | 状态点             | 仅运行中或失败时允许 2–3px |
| Drag / Resize     | 可视化手柄 + 光标              | active focus ring  | 容器最多 2px               |
| Disabled          | 降低对比度 + 虚线边框          | 禁用图标           | 禁止彩色粗线               |

---

### 4.2 普通容器与分组

适用范围：设置区块、工具面板、普通卡片、预览区域、表单分组。

```css
.container {
  border: 1px solid var(--border-color);
  background: var(--container-bg);
  border-radius: var(--ui-radius-md);
}
```

普通容器不应使用：

```css
border-left: 3px solid var(--primary-color);
```

如果需要加强层级，按以下顺序处理：

1. 增加标题层级；
2. 调整背景色阶；
3. 增加内外间距；
4. 使用 1px 全边框；
5. 最后才考虑语义性装饰。

---

### 4.3 Selected / Active

适用范围：侧栏当前项、当前 Agent、当前模型、当前 Tab、当前资源或节点。

```css
.item {
  border-left: 2px solid transparent;
  background: transparent;
}

.item:hover {
  background: var(--hover-bg);
}

.item.selected {
  border-left-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}
```

规则：

- 只在 `.selected`、`.active` 等真实交互状态下出现；
- 宽度固定为 2px；
- 同时提供背景变化，不能只依靠颜色；
- 不与告警色条复用相同的 3px / 4px 视觉强度。

适合保留或统一的现有区域包括：

- `src/views/Settings/shared/ProfileSidebar.vue`；
- `src/tools/llm-chat/components/sidebar/AgentListItem.vue`；
- 模型选择器、插件列表等当前项状态。

---

### 4.4 Focus 与 Keyboard Navigation

Focus 不应通过增加左侧边框来表达，因为这可能改变容器尺寸并与 Selected / Warning 混淆。

推荐：

```css
.interactive:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
```

Focus 的视觉责任是告诉用户“当前可以操作”，而不是告诉用户“这个内容很重要”。

---

### 4.5 Info / Warning / Error

信息和告警应优先使用“图标 + 语义背景 + 文案”的组合：

```css
.alert {
  border: 1px solid var(--alert-border-color);
  background: var(--alert-bg);
  border-radius: var(--ui-radius-md);
}
```

推荐结构：

```text
[语义图标] 标题 / 状态标签
          详细说明
          相关操作
```

#### 左侧线的使用条件

| 状态    | 默认方案                       | 左侧线               |
| ------- | ------------------------------ | -------------------- |
| Info    | 图标 + 淡色背景 + 1px 边框     | 默认不用，必要时 2px |
| Warning | 图标 + Warning 标签 + 淡色背景 | 持久性告警可用 2px   |
| Error   | 图标 + Error 标签 + 操作建议   | 阻断性错误可用 3px   |
| Success | Check 图标 + 成功状态点        | 不用                 |

普通成功结果不使用绿色粗左边线，避免列表中出现连续的绿色竖线。

---

### 4.6 消息角色、事件类型与日志等级

角色和类型属于“分类语义”，不是“容器严重度”。应从大面积色条改成低面积标识。

推荐结构：

```text
┌─────────────────────────────┐
│ [角色图标] Assistant   12:30 │
│ 消息内容                     │
└─────────────────────────────┘
```

推荐装饰组合：

- 角色：图标 + Role Badge；
- 类型：Type Badge + 状态点；
- 日志等级：等级图标 + 文案；
- 当前选中：另加 2px 主色左线；
- 错误：转换为 Error 语义，而不是继续增加角色色条。

适用于：

- `src/tools/llm-chat/components/context-analyzer/StructuredView.vue`；
- `src/tools/llm-chat/components/message/ToolCallMessage.vue`；
- `src/tools/llm-inspector/components/detail/StructuredMessagesView.vue`；
- `src/tools/vcp-connector/components/monitor/BroadcastCard.vue` 及其相关卡片。

---

### 4.7 日志与监控事件

高密度日志和监控列表优先使用行首状态点：

```css
.event-type {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.event-type::before {
  content: "";
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--event-color);
}
```

事件类型可以通过图标形状进一步区分：

| 类型         | 推荐标识              |
| ------------ | --------------------- |
| RAG          | 蓝色状态点 / 检索图标 |
| Thinking     | 紫色状态点 / 思考图标 |
| Private Chat | 黄色状态点 / 对话图标 |
| Memo         | 青色状态点 / 书签图标 |
| Plugin Step  | 深色状态点 / 方块图标 |
| Log          | 灰色状态点 / 文档图标 |

颜色可以保留，但应从整卡片左边线迁移到 Badge、图标或状态点。这样仍然支持快速扫描，同时减少整列竖线。

---

### 4.8 引用、Markdown 与富文本内容块

左侧线最适合表达引用或正文结构语义，因此这类样式可以保留：

```css
blockquote,
.markdown-quote {
  margin: 12px 0;
  padding: 8px 12px;
  border-left: 3px solid var(--blockquote-border-color);
  background: var(--blockquote-bg);
  color: var(--text-secondary);
}
```

规则：

- 统一为 3px；
- 使用低饱和主题色；
- 不额外叠加彩色全边框；
- 普通说明卡不能直接复用引用样式；
- AlertBlock 需要同时展示图标和状态文案，与普通 Blockquote 区分。

---

### 4.9 Tool Call、代码块与调试输出

普通工具调用使用结构层级，不使用默认彩色粗边：

```text
┌─────────────────────────────┐
│ ▸ tool.call       running    │
├─────────────────────────────┤
│ {                           │
│   ...                       │
│ }                           │
└─────────────────────────────┘
```

```css
.tool-block {
  border: 1px solid var(--border-color);
  background: var(--code-bg);
  border-radius: var(--ui-radius-md);
}

.tool-block__header {
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border-color);
}
```

只有以下状态允许出现 2–3px 左侧线：

- 当前正在执行；
- 执行失败；
- 用户主动选中该调用。

普通 Tool Call、JSON 输出和代码片段不能默认使用 4px 左边线。

---

### 4.10 Drag / Resize

拖拽和调整尺寸应高亮实际可操作的手柄，而不是把整个容器伪装成告警卡。

```css
.resize-handle {
  width: 4px;
  background: transparent;
  cursor: ew-resize;
}

.resize-handle:hover,
.resize-handle:active {
  background: var(--primary-color);
}

.container:has(.resize-handle:active) {
  box-shadow: 0 0 0 2px
    color-mix(in srgb, var(--primary-color) 25%, transparent);
}
```

容器本身最多使用 2px 交互边线，且只在拖拽激活时出现。

---

## 5. 统一 Token 与宽度规范

建议新增或整理以下语义变量，具体变量名应以项目现有主题系统为准：

```css
:root {
  /* 结构 */
  --decoration-border-width: 1px;

  /* 交互 */
  --decoration-active-rail-width: 2px;
  --decoration-focus-width: 2px;

  /* 内容语义 */
  --decoration-quote-rail-width: 3px;
  --decoration-alert-rail-width: 3px;

  /* 语义颜色 */
  --decoration-active-color: var(--primary-color);
  --decoration-info-color: var(--el-color-info);
  --decoration-success-color: var(--el-color-success);
  --decoration-warning-color: var(--el-color-warning);
  --decoration-danger-color: var(--el-color-danger);
}
```

### 5.1 宽度约束

|       宽度 | 允许用途                                         |
| ---------: | ------------------------------------------------ |
|        1px | 普通结构边框                                     |
|        2px | 选中、激活、拖拽、局部交互反馈                   |
|        3px | 引用、持久性告警、强语义内容                     |
|        4px | 仅兼容已有 Markdown / 富文本特殊样式，不建议新增 |
| 5px 及以上 | 不用于容器；仅允许 CSS 三角形等绘制技巧          |

### 5.2 颜色约束

- 优先使用项目主题变量；
- 不在新组件中直接写硬编码 hex；
- 角色或事件类型应使用语义变量；
- 颜色必须搭配图标、文字或形状，不能作为唯一信息来源；
- 深色主题中需要验证低饱和背景的对比度。

---

## 6. 迁移顺序

### 第一阶段：高密度区域

#### 6.1 VCP Monitor

涉及：

- `src/tools/vcp-connector/components/monitor/BroadcastCard.vue`；
- `src/tools/vcp-connector/components/monitor/AgentCardContent.vue`；
- `src/tools/vcp-connector/components/monitor/RagCardContent.vue`；
- `src/tools/vcp-connector/components/monitor/MemoCardContent.vue`；
- `src/tools/vcp-connector/components/monitor/ChainCardContent.vue`。

目标：

- 事件类型从卡片左边线迁移到 Type Badge + 状态点；
- 仅错误或阻断状态保留 2–3px 左侧告警线；
- 将硬编码颜色迁移到主题语义变量。

#### 6.2 LLM Chat 与 LLM Inspector

涉及：

- `src/tools/llm-chat/components/context-analyzer/StructuredView.vue`；
- `src/tools/llm-chat/components/message/ToolCallMessage.vue`；
- `src/tools/llm-chat/components/common/ChatRegexHelpDialog.vue`；
- `src/tools/llm-inspector/components/detail/StructuredMessagesView.vue`。

目标：

- 角色使用图标和 Badge；
- 普通 Tool Call 使用 1px 结构边框；
- Error / Warning 进入告警组件语义；
- Selected 统一使用 2px 主色左线。

#### 6.3 Recall

涉及：

- `src/tools/recall/components/monitor/RecallLogCard.vue`；
- `src/tools/recall/components/KnowledgeBackupDialog.vue`；
- `src/tools/recall/components/SearchSlot.vue`。

目标：

- 日志等级使用图标、状态点和标签；
- 只为持久性错误保留左侧线；
- 普通说明使用 1px 边框和淡色背景。

### 第二阶段：普通提示与结果卡片

排查以下语义名称或类似样式：

- `scope-note`；
- `concept-card`；
- `guide`；
- `detail`；
- `result`；
- `info`；
- `summary`。

如果组件只是普通说明或分组，应改为 1px 全边框、背景层级和标题图标。

### 第三阶段：交互态统一

统一以下场景：

- Sidebar selected；
- Agent selected；
- 当前模型；
- 当前节点；
- Resize active；
- 可拖拽区域 focus。

所有交互态左侧线统一为 2px，并确保只在真实状态类或伪类下出现。

---

## 7. 新增样式的决策树

新增容器装饰前按以下顺序判断：

```text
这是普通分组吗？
├─ 是 → 1px 全边框 + 背景层级
└─ 否
   这是选中或激活态吗？
   ├─ 是 → 2px 主色左线 + 浅色背景
   └─ 否
      这是引用或正文语义块吗？
      ├─ 是 → 3px 低饱和左线
      └─ 否
         这是告警或错误吗？
         ├─ 是 → 图标 + 语义背景 + 1px 边框
         │        阻断性或持久性告警才增加 2–3px 左线
         └─ 否
            这是角色、类型或日志分类吗？
            ├─ 是 → Badge + 图标 + 状态点
            └─ 否 → 不使用左侧粗描边
```

---

## 8. 验收标准

### 8.1 视觉验收

- 普通容器不再默认出现彩色 3px / 4px 左边线；
- 同一屏幕内的左侧彩条数量明显减少；
- 用户能区分 Selected、Warning、Error、Role、Event Type 等不同语义；
- VCP Monitor 不再依赖六种整卡片色条区分事件类型；
- LLM Chat 中角色和工具调用不会与告警视觉混淆；
- 深色和浅色主题下均保持足够对比度；
- 移动端窄屏中不会因左侧线和内边距叠加而挤压内容。

### 8.2 代码验收

- 新增普通容器不得使用 3px / 4px 彩色左边线；
- 新增 3px 左边线必须能说明其引用、持久告警或强语义内容；
- 新增 4px 左边线需要明确说明兼容性理由；
- 新增颜色优先使用主题变量，不新增硬编码 hex；
- Selected / Active 左线宽度统一为 2px；
- 角色、类型和日志等级不得只依赖颜色；
- 修改前后运行对应的类型检查和 Vite 构建，并在真实 Tauri WebView 中检查高密度页面。

---

## 9. 开放问题

1. 是否需要将 `StatusBadge`、`TypeBadge`、`SemanticAlert` 抽成共用组件，还是先在高密度模块内局部迁移？
2. VCP 事件类型是否需要一套统一的图标注册表，避免只依赖颜色？
3. 移动端是否将 3px 语义线进一步限制为 Error / Blockquote 两类，以换取更多正文宽度？
4. 是否需要在主题系统中增加统一的 `--*-container-bg`、`--*-border-color` 语义变量？
5. 是否需要增加 lint 或样式扫描规则，阻止普通组件继续新增 4px 左侧彩色边框？

---

## 10. 结论

左侧单边粗描边不应被删除，而应从“默认容器高亮”收敛为受限语法：

- **1px 全边框**：表达普通结构；
- **2px 主色左线**：表达选中、激活和交互反馈；
- **3px 低饱和左线**：表达引用和持久性强语义内容；
- **Badge / 图标 / 状态点**：表达角色、类型和日志分类；
- **4px 以上**：不再用于普通容器。

通过这套映射，既能保留现有界面的信息扫描效率，也能降低 LLM Chat、VCP Monitor、LLM Inspector 等高密度页面的装饰重复和视觉噪音。
