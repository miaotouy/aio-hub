# 玻璃材质系统与模糊渲染效率计划

> 状态：待实施（方案已确定，llm-chat 为试点）
>
> 最后更新：2026-09-17
>
> 关联：[主题系统架构](../architecture/theme-system-architecture.md)、[CSS 变量指南](../user-guide/advanced/css-variables-guide.md)
>
> 涉及范围：`src/styles/*`、`src/composables/useThemeAppearance.ts`、`src/composables/useIframeTheme.ts`、`src/components/TitleBar.vue`、`src/components/MainSidebar.vue`、`src/tools/llm-chat/**`

## 1. 当前结论

AIO 当前的毛玻璃实现是**每个元素各自 `backdrop-filter`**，即每个玻璃元素都会独立采样背景、独立生成一张离屏纹理。全仓 `src/` 与 `mobile/src/` 中共有 **244 个文件、369 处** `backdrop-filter`，其中大量位于滚动容器内的重复元素、嵌套卡片和 Element Plus 组件上。

本计划把模糊计算从「按元素」收敛为「按逻辑区域」，建立统一的玻璃材质体系：**一次区域模糊 + 区域内半透明填充**，并配套可脚本化的批量迁移与 CI 约束。试点选在 `llm-chat`（问题最集中），验证收益后再批量推广。

外部参照：`VCPChat` 于 2026-09-17 的提交 `9bccdee0`（「修复一个blur样式冲突引发的全局显存泄露」）走的是同一方向的减法路线——删除滚动容器、消息项与嵌套卡片的 `backdrop-filter`，仅保留稳定的头部与输入区，并用测试锁死约束。本计划在其基础上进一步保留「模糊」本身，而非直接放弃玻璃观感。

## 2. 问题量化

### 2.1 数量级来源

| 来源              | 现状                                                                                                                                                                                  | 问题                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Element Plus 组件 | `src/styles/element-plus.css:536-584` 为 `.el-card`、`.el-table`、`.el-message`、`.el-button`、`.el-input`、`.el-select`、`.el-tag`、`.el-checkbox__inner` 等统一加 `backdrop-filter` | 每个组件实例一次独立采样。一个设置页可能有几十个控件同时持有纹理    |
| 聊天消息          | `ChatMessage.vue:112-127` 按 `BLOCK_SIZE = 2000px` 把消息背景切块，每块一个 `backdrop-filter`（`:382-390`）                                                                           | 长消息的采样次数随高度线性增长；`CompressionMessage.vue` 有同款实现 |
| 消息内嵌套        | `ToolCallMessage.vue:1251`、`CompressionMessage.vue:458`、`MessageContent.vue:1451`、`AttachmentCard.vue` 多处、`rich-text-renderer` 各节点                                           | 嵌套 `backdrop` 成本相乘                                            |
| 动画 / 过渡元素   | 41 个文件同时存在 `backdrop-filter` 与 `animation` / `transition`                                                                                                                     | 动画期间每帧重算 backdrop                                           |
| 无效模糊          | 无壁纸时、`Mica` / `Acrylic` 窗口特效下、`iframe` 内（`useIframeTheme.ts` 的 `body` 背景不透明）                                                                                      | 模糊对象是纯色，视觉收益为零，成本照付                              |

### 2.2 为什么逐元素模糊不可持续

每个 `backdrop-filter` 元素产生一张面积 × 4 字节的离屏纹理和一次采样-模糊-合成。叠加 `content-visibility: auto`（`MessageList.vue:932-935` 对 `.chat-message` 启用）后，视口外交互元素在滚动中反复进出渲染，对应的合成层与纹理被反复销毁重建，直接表现为滚动卡顿与显存压力。

## 3. 关键前提

两条结构性事实决定了方案可行性与形态：

1. **背景层是静态且唯一的**。`body::before`（`theme-appearance.css:36-52`）是 `position: fixed` 的全屏壁纸层，`z-index: -2`；其上是 `html/body` 的半透明底色（`theme-appearance.css:60-63`），再上是内容。绝大多数玻璃区域背后只有「同一张不会随滚动变化的壁纸」，模糊结果与元素自身位置无关。
2. **聊天区已被整块涂层覆盖**。`.main-content` / `.chat-content`（`src/tools/llm-chat/components/ChatArea.vue:698-708`）带有整块 `background-color: var(--card-bg)`。因此聊天区内部所有 `backdrop-filter` 实际模糊的是「恒定半透明涂层 + 壁纸」，没有任何动态信息，纯属浪费。

此外 `src/views/MainLayout.vue:245` 的 `.main-content` 带有 `contain: size layout paint`。按 CSS Filter Effects 规范，`contain: paint` 只创建包含块与层叠上下文，**不创建 backdrop root**（backdrop root 由根元素及 `filter`、`opacity < 1`、`mask`、`will-change` 等创建）。因此区域层的 backdrop 采样可以一直向下穿透到 `body`，把全局壁纸层 `body::before` 纳入模糊——这是方案成立的前提，实施第一步需用最小原型先行验证该穿透行为。

## 4. 架构设计

### 4.1 三级材质语义

| 等级             | 语义                            | 典型对象                                            | 实现                                                     |
| ---------------- | ------------------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| `glass-shared`   | 背后只有全局背景（壁纸 + 底色） | 卡片、面板、侧栏、消息气泡、Element Plus 大块组件   | 无 `backdrop-filter`，仅半透明填充；模糊由所属区域层提供 |
| `glass-regional` | 背后是同级 UI，区域边界固定     | 悬浮工具条、固定在滚动区内的头 / 尾                 | 在**非滚动父容器**上做 1 次 backdrop，子元素透明         |
| `glass-overlay`  | 背后是实时变化的动态内容        | Dialog、Popper、Dropdown、ContextMenu、hover 操作栏 | 保留独立 `backdrop-filter`，收敛到统一白名单             |

分类规则可脚本化：选择器含 `popper|dialog|drawer|popup|menu|tooltip|dropdown|context|overlay`，或同时满足 `position: absolute|fixed` + 高 `z-index` → `glass-overlay`；区域根容器 → `glass-regional`；其余 → `glass-shared`。

### 4.2 采用区域级共享层，而非全屏单层

「全屏 1 层 + 区域内独立档」在物理上不可行：`backdrop-filter` 的采样范围是元素背后到最近 backdrop root 之间的**全部**已绘制内容，无法跳过某一层。聊天区若在全局层之上再叠一层，得到的是二次模糊而非独立档位。

区域级方案在成本上不吃亏（各区域面积之和 ≈ 视口面积，总模糊量相当），却天然支持多档模糊、影响范围局部化，且与既有 `contain` 渲染隔离策略不冲突。

同屏层数：`TitleBar` + `MainSidebar` + 当前页面（含聊天区）≈ **3~5 次模糊**，替代现状 369 次。

### 4.3 区域边界

```text
src/views/MainLayout.vue
├── TitleBar                                          → 区域 1（普通档）
└── .common-layout
    ├── MainSidebar                                   → 区域 2（普通档）
    └── .main-content（contain: size layout paint）    → 不设层（隔离边界）
        └── router-view → 工具页面
            └── llm-chat → .chat-area-container（消息档，ChatArea.vue:655-665）
                          + 会话侧栏根容器（普通档）
```

`.main-content` **不承载区域层**：它同时包含聊天区与其余内容，若在此设层会与聊天区层叠加。区域层下放到「需要独立档位的最小区域」。

`.chat-area-container` 是 `overflow: hidden` 的非滚动容器，符合承载条件；其 `contain: size layout style` 不含 `paint`，不影响 backdrop 采样。

### 4.4 统一机制：`glass-region`

在 `src/styles/theme-appearance.css` 提供区域玻璃层，必须落在**非滚动**的父容器上（滚动容器承载 backdrop 会导致整块采样面在子内容移动时反复失效，这正是 VCPChat 提交的核心结论）。

```css
.glass-region {
  position: relative;
  /* 建立层叠上下文，把 ::before 约束在区域内，负 z-index 不会外溢到祖先 */
  isolation: isolate;
}

.glass-region::before {
  content: "";
  position: absolute;
  inset: 0;
  /* 负值：绘制在容器背景之上、正常流内容之下，无需抬升任何子元素 */
  z-index: -1;
  pointer-events: none;
  backdrop-filter: blur(var(--glass-region-blur, var(--ui-blur)));
}
```

三条实现约定：

- **不使用 `.glass-region > *` 通配符抬升子元素**。通配符会破坏区域内 `position: sticky`（如 `MessageNavigator`）、高 `z-index` 浮层，以及 `<Teleport>` 到区域外的遮罩（如 `ShareScreenshotDialog`）的层叠关系。改用 `isolation: isolate` + `z-index: -1` 后，内容层无需任何改动。
- **区域内若存在需要在玻璃层之前绘制的背景元素**（例如分离窗口的 `.detached-wallpaper`），将其降到 `z-index: -2`，即可被区域层采样且仍在内容层之下。
- **区域层的采样会穿透到 `body`**（见第 3 节：`contain: paint` 不创建 backdrop root），全局壁纸 `body::before` 参与模糊。若实施首步的原型验证发现穿透被阻断，则需退回「逐区域显式承载内部壁纸」的形态。

档位约定：

- 聊天区：`--glass-region-blur: var(--chat-message-bg-blur)`
- 其余区域：`--glass-region-blur: var(--ui-blur)`

### 4.5 变量与开关

在 `useThemeAppearance.ts` 中集中注入：

- 新增 `--glass-region-blur` 兜底与区域开关；
- 当以下任一条件成立时，全部模糊值置 `0px`（区域层不生成纹理，成本归零）：
  - `enableUiEffects` 或 `enableUiBlur` 关闭；
  - 未启用壁纸（模糊纯色无收益）；
  - 窗口特效为 `Mica` / `Acrylic`（系统已提供模糊，前景重复采样纯属浪费）。

`useIframeTheme.ts` 的变量桥需同步新增 token；`iframe` 内 `body` 背景不透明，不需要 blur。

## 5. 变更清单

### 5.1 Phase 1 · 全局骨架（手写，作为模板）

| 文件                                    | 变更                                                |
| --------------------------------------- | --------------------------------------------------- |
| `src/styles/theme-appearance.css`       | 新增 `.glass-region` 与 `--glass-region-blur` token |
| `src/composables/useThemeAppearance.ts` | 注入 token；实现 4.5 的开关判定                     |
| `src/composables/useIframeTheme.ts`     | 变量列表新增 token                                  |
| `src/components/TitleBar.vue:722`       | 改为区域层模式                                      |
| `src/components/MainSidebar.vue:205`    | 改为区域层模式                                      |

### 5.2 Phase 1 · Element Plus（只清大块）

`element-plus.css` 现状是两组选择器混装（`:536-544` 与 `:545-555`），分组与语义并不一致，需按面积重排而非沿用现有分组：

- **下线**（大块，改由区域层提供模糊）：`.el-card`、`.el-table`、`.el-slider__runway`、`.el-progress-bar__outer`、`.el-step__icon`（现同组于 `element-plus.css:536-544`）
- **保留**（小控件，面积小、感知强，维持独立采样）：`.el-button`、`.el-input`、`.el-textarea`、`.el-select`、`.el-tag`、`.el-date-editor`、`.el-radio__inner`、`.el-checkbox__inner`（现跨 `:536-544` 与 `:545-555` 两组）
  - 其中 `.el-tag` 现与大块同组，需从该组拆出并单独保留其 `backdrop-filter`
- **浮层白名单**（`glass-overlay`）：`.el-popper`、`.el-popconfirm__popper`、`.el-picker-panel`、`.el-cascader-panel`、`.el-autocomplete-suggestion`、`.el-color-dropdown`、`.el-notification`、`.el-dialog`、`.el-drawer`（`element-plus.css:505-519`）
  - **`.el-message` 一并划入白名单**：它现位于 `element-plus.css:545` 的小控件组，但默认挂载在 `document.body` 下，不在任何 `glass-region` 内，直接下线会让提示条失去模糊兜底。改为独立采样，或为其补足够不透明度的实体底色

### 5.3 Phase 1 · llm-chat 试点

**接入区域层**

- `src/tools/llm-chat/components/ChatArea.vue` 的 `.chat-area-container`（`:655-665`，`overflow: hidden` 非滚动）→ `glass-region`（消息档）
- llm-chat 会话侧栏根容器 → `glass-region`（普通档）

**移除分块渲染**

- `src/tools/llm-chat/components/message/ChatMessage.vue`：删除 `BLOCK_SIZE`、`backgroundBlocks`、`useResizeObserver` 与模板中的 `.message-background-container` 分块（`:112-127`、`:269-281`），背景改为单一 `.chat-message::before` 半透明填充
- `src/tools/llm-chat/components/message/CompressionMessage.vue`：同款分块一并删除（`:95`、`:264`、`:458`）

**`glass-shared` 去 backdrop**

- 消息内嵌套：`ToolCallMessage.vue:1251`、`CompressionMessage.vue:458`、`MessageContent.vue:1451`
- 侧栏 / 面板：`LeftSidebar.vue:99`、`SessionsSidebar.vue:609`、`SessionItem.vue:230`、`AgentListItem.vue:318`、`AgentsSidebar.vue:1084`、`AgentsSidebar.vue:1122`、`ConfigSection.vue:91`、`PipelineConfig.vue:215`、`LlmChatSkeleton.vue:492`
- 树图：`FlowTreeGraph.vue` 与 `GraphNode.vue:237` 逐处判定（覆盖在动态内容之上者保留）

**`glass-overlay` 白名单（不动）**

`ContextMenu.vue:133`、`GraphNodeDetailPopup.vue:281`、`GraphNodeMenubar.vue:442`、`QuickActionFullManager.vue:497`、`MessageMenubar.vue:901`、`MessageNavigator.vue:234`、`ChatSearchPanel.vue:335`、`ChatSearchPanel.vue:426`、`ToolCallingApprovalBar.vue:328`、`MessageInput.vue:636`、`ChatCodeMirrorEditor.vue:572`、`ChatCodeMirrorEditor.vue:635`、`AgentsSidebar.vue:1061`（拖拽覆盖层）

## 6. Phase 2 · 批量迁移与 CI 约束

Phase 1 验证收益后启动，可脚本 + agent 并行推进。

### 6.1 迁移脚本

- 用 `@vue/compiler-sfc` 解析 `.vue` 的 `<style>` 块、用 `postcss` 解析 `.css`，扫描全部 `backdrop-filter` 声明；
- 按 4.1 的规则打标 `shared / regional / overlay` 并输出清单；
- `shared` 类自动改写为区域层模式，`overlay` 类要求带豁免注释。

### 6.2 CI 约束（新增 `bun run check:glass`，挂到 `check:frontend` 旁）

- 滚动容器（`overflow-y: auto|scroll`）与 `content-visibility: auto` 元素禁止出现 `backdrop-filter`；
- 带 `backdrop-filter` 的元素禁止同时声明 `animation` 与 `transition: all`；
- 裸 `backdrop-filter` 必须携带 `/* glass-overlay */` 豁免注释。

断言写法可参照 VCPChat 的 `tests/stream-manager-terminal-cleanup.test.js`。

### 6.3 迁移顺序

冻结 `glass-overlay` 白名单 → 按工具逐个接入区域层 → 移除过渡期兜底。

## 7. 边界与风险

| 场景                                                                        | 处理方式                                                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 无壁纸 / `Mica` / `Acrylic`                                                 | 模糊值置 `0px`，不生成纹理                                                                                                                              |
| 分离窗口（`body.no-global-wallpaper`）                                      | `.detached-wallpaper`（`ChatArea.vue:681-695`）现为 `z-index: 0`，会绘制在区域层 `::before` 之上、致其采样不到局部壁纸；需按 4.4 约定降到 `z-index: -2` |
| 分离窗口底色不透明（`ChatArea.vue:677`）                                    | 容器背景 `--detached-base-bg` 默认 0.85 不透明，玻璃观感本就偏弱，需实测确认                                                                            |
| 组件内部自带壁纸（`ChatArea.vue:681-695`）                                  | 同 `.detached-wallpaper` 的层级约定，区域层与内部壁纸的叠加关系需实测                                                                                   |
| 截图模式（`ShareScreenshotDialog`、`ScreenshotRenderer`、`screenshotMode`） | 确认区域层是否进截图，必要时截图期间强制包含                                                                                                            |
| 低 `uiBaseOpacity`                                                          | 去掉 blur 后按区域设置背景不透明度下限，保证可读性                                                                                                      |
| 区域留白观感                                                                | 区域内的留白会从「清晰壁纸」变为「模糊壁纸」，属预期统一效果，需真实走查确认                                                                            |
| 未接入的工具（约 240 个文件）                                               | 迁移期可用全局兜底层开关（默认关闭），避免出现「清晰壁纸」断层                                                                                          |

## 8. 验证

- `bun run check:frontend`（`vue-tsc --noEmit`）
- `bun run build:vite`（覆盖打包期导入、插件与 CSS 检查）
- 真实 Tauri 窗口：长会话快速滚动，对比优化前后的 GPU 占用、显存与滚动帧率
- 视觉走查：区域留白统一度、消息档与普通档差异、叠加场景、低不透明度可读性
- 场景走查：截图分享（`ShareScreenshotDialog`）导出结果、分离窗口拖拽与尺寸调整、`MessageNavigator` 等 `sticky` / 高 `z-index` 元素在区域层下的层叠是否正确
- 前提验证：最小原型确认区域层 backdrop 能穿透 `contain: paint` 采到 `body::before` 的全局壁纸
- `check:glass` 断言通过

## 9. 决策记录

| 决策点                  | 结论                                                                                                                             | 理由                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 共享层形态              | 区域级（3~5 层），不做全屏单层                                                                                                   | 全屏单层与区域内独立档会叠加成二次模糊；区域级成本相当且支持多档                         |
| Element Plus 治理       | 只清大块（`.el-card` / `.el-table` / `.el-slider__runway` 等），保留小控件；`.el-message` 因挂载在 `body` 下改列 `glass-overlay` | 大块面积是显存主要来源；小控件面积小、感知强；`.el-message` 不在任何区域层内，需独立兜底 |
| 模糊档位                | 全局单档 + 聊天区区域层                                                                                                          | 保留 `chatMessageBlurFactor` 语义，无需下线设置项                                        |
| `chatMessageBlurFactor` | 保留，由聊天区区域层承载                                                                                                         | 无需双档共享层即可正确实现                                                               |

## 10. 回写要求

1. Phase 1 完成后，将稳定契约写入 [`theme-system-architecture.md`](../architecture/theme-system-architecture.md) 的 5.4 适配指南：模糊由区域层提供，区域只做半透明填充，仅 `glass-overlay` 保留独立 `backdrop-filter`。
2. 在 [`css-variables-guide.md`](../user-guide/advanced/css-variables-guide.md) 补充 `--glass-region-blur`。
3. 若实施中偏离本文（例如区域边界调整、档位策略变化），同步修正本文或标记偏差。
4. 全部验收后按 [`docs/Plan/README.md`](./README.md) 的回写顺序更新台账。
