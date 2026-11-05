# 移动端页面级 UI 设计规范

> **状态**: Draft v1（待评审）
> **定位**: 在 [`mobile-design-language.md`](./mobile-design-language.md)（架构层决议）之下，补齐**页面级与组件级视觉、间距、排版、导航与交互**的应然规范。
> **关系**: [`mobile-design-language.md`](./mobile-design-language.md) 回答"用什么框架、谁主导主题"；本文件回答"页面应该长什么样、每个值和组件怎么用"；[`mobile-ui-development.md`](./mobile-ui-development.md) 回答"新增页面怎么写"。
> **约束级别**: 文中 **必须 / 禁止 / 推荐** 为可判定规则；数值与 token 名为契约。实现细节以本文件为准，冲突时以本文件 + `mobile-design-language.md` 为准。

---

## 0. 为什么需要这份文件（现状依据）

移动端此前只有架构层设计语言，没有页面级视觉规范，导致施工期 UI 系统性偏离：

| 现状问题 | 事实（2026-10 盘点） |
| -------- | -------------------- |
| 三套变量体系并存 | AIO token（`--text-color`）/ MD3 兼容名（`--color-on-surface`）/ Element Plus 残留（`--el-color-*`） |
| MD3 兼容名被当主语 | 迁移前 `--color-*` 出现于 55 个 `.vue`、604 处（含 66 处 AIO 无对应物扩展色），违反"不新增 MD3 变量为主语" |
| Element Plus 变量泄漏 | 15 处，全部集中在 `llm-chat`（PC 复制残留），移动端无定义，样式静默失效 |
| 字号阶梯零使用 | `--font-size-*` 已定义但 0 处使用；实际散布 27 种 `rem` + 部分固定 `px` |
| 圆角三体系 | `--app-radius-*` 仅 3 个页面用，其余硬编码 8/10/12/14/16px |
| 顶部栏 5 种避让写法 | `--app-top-offset` / 魔法数 70px / 78px / 54px placeholder / 手写 `calc` 并存 |
| z-index 混乱 | 100 / 1000 / 1001 / 默认 4 种并存 |
| 触控目标不齐 | 27px / 30px / 42px 并存，低于 44px 的可点区域遍布 |
| 反馈机制三套 | Varlet `Snackbar/Dialog`、`feedback.ts`、`chatFeedback.ts` 并存 |
| 无骨架组件 | 列表 / 空状态 / 加载更多各页重复手写，`var-skeleton` 未用 |

本规范的目标不是"再定一堆原则"，而是给出**可直接写进代码、可被 review 判定**的具体契约，并提供从现状迁移的映射表。

---

## 1. 设计原则

1. **触屏优先**：一切尺寸先满足手指。最小可点区域 **44×44px**（视觉图标可小，但热区必须达标）。
2. **单手可达**：主操作区放在拇指舒适区（屏幕下 2/3）；危险操作不贴近系统返回手势边缘。
3. **信息层级靠排版而非装饰**：用字号 / 字重 / 颜色层级区分，不用阴影堆叠和多彩色块。
4. **默认干净、可定制但不默认花哨**：毛玻璃、壁纸、取色是能力不是默认妆效（见设计语言 §1.2）。
5. **一致优于局部最优**：同类页面（列表/详情/设置）必须复用同一套模板与组件，禁止每页自创骨架。
6. **明暗同源**：所有颜色走语义 token，`dark` 只切换 token 值，不在页面里写 `isDark` 分支或双份色值。

---

## 2. 设计 token 契约

> 所有视觉值 **必须** 引用 token，禁止在页面 `style` 中硬编码颜色 / 圆角 / 字号（例外见 §11）。

### 2.1 间距刻度（4pt 基）

页面与组件间距 **必须** 取下列之一（token 待补，见 §12）：

| token | 值 | 典型用途 |
| ----- | -- | -------- |
| `--space-1` | 4px | 图标与文字、行内元素间隙 |
| `--space-2` | 8px | 紧凑元素间距、chip 内边距 |
| `--space-3` | 12px | 列表项内边距、卡片内子项间距 |
| `--space-4` | 16px | **页面左右边距（基准）**、卡片内边距 |
| `--space-5` | 20px | 卡片内边距（大） |
| `--space-6` | 24px | 区块之间 |
| `--space-8` | 32px | 主要分区之间 |
| `--space-10` | 40px | 顶部页头下留白 / 页面底部收尾留白 |

- 页面左右内边距 **必须** 统一为 `--space-4`（16px）。现状的 20px/24px 混用需收敛。
- 禁止魔法数（如 `padding: 70px`、`calc(78px + env(...))`）做顶部避让，改用 §7 的避让契约。

### 2.2 排版阶梯

字号 **必须** 使用下列语义 token，禁止裸写 `rem`/`px`：

| token | 现状值(基准14) | 语义 | 用法 |
| ----- | -------- | ---- | ---- |
| `--font-size-xs` | 10px | 极辅助 | 徽标数字、极小注解（少用） |
| `--font-size-sm` | 12px | 次要 | 辅助说明、元信息、时间戳 |
| `--font-size-md` | 14px | 正文 | 列表主文本、输入框、消息正文（默认） |
| `--font-size-lg` | 16px | 强调 | 卡片标题、区块标题、按钮主文本 |
| `--font-size-xl` | 20px（待补） | 页面标题 | 列表/详情/设置页标题 |
| `--font-size-2xl` | 28px（待补） | 展示标题 | 仅首页 / 工具入口页问候语 |

- 字重：正文 `400`，次级 `400`，标题与强调 `600`，`700` 仅用于头像字母等极少数。
- 行高：正文 `1.5`，紧凑列表 `1.35`，标题 `1.25`。
- **层级靠字号 + 字重 + 颜色三者组合**，不得仅靠字号堆到夸张（现状 `0.65rem`~`2.3rem` 共 27 种值必须收敛到上表）。
- 允许"响应字号缩放"（`--app-font-scale`）自动生效，页面不得绕开 token 写死字号。

### 2.3 圆角

| token | 值 | 用途 |
| ----- | -- | ---- |
| `--app-radius-sm` | 4px | 小徽标、进度条、极小的标签 |
| `--app-radius-md` | 8px | **按钮、输入框、列表项、chip、头像** |
| `--app-radius-lg` | 12px | 卡片、分组容器、设置区块 |
| `--app-radius-xl` | 16px | 底部 Sheet 顶角、大弹层、Dialog |

- 禁止硬编码圆角（现状 8/10/12/14/16/50%/20px 混用）。
- 胶囊形一律用 `border-radius: 999px`（如 chip、分段控件），不属于上表。

### 2.4 颜色语义层

**必须只使用** AIO 语义 token。Varlet/MD3 变量仅作为其派生兼容层，业务代码不得直接消费。

| 语义 | token | 说明 |
| ---- | ----- | ---- |
| 页面背景 | `--bg-color` | 最底层 |
| 卡片/表面 | `--card-bg` | 卡片、列表容器、面板 |
| 分组容器 | `--container-bg` | 设置分组、次级容器 |
| 输入/次级表面 | `--input-bg` | 输入框、胶囊按钮底、选中项底 |
| 顶栏/侧栏 | `--sidebar-bg` | AppBar 等固定栏 |
| 弹层 | `--overlay-bg` | Sheet / Dialog / Popup |
| 品牌/主色 | `--primary-color` + `--primary-color-rgb` | 主按钮、选中态、强调 |
| 状态色 | `--success-color` / `--warning-color` / `--danger-color` / `--info-color`（各含 `-rgb`） | 语义状态 |
| 主文本 | `--text-color` | 正文与标题 |
| 次文本 | `--text-color-light` | 辅助说明、元信息 |
| 边框 | `--border-color` + `--border-width` | 所有描边 |

- **三级文本 / 禁用态**：暂无专用 token。规范统一约定用 `color: var(--text-color-light)` + `opacity: 0.6`，**禁止各页自定 0.3/0.4/0.58 等散值**（待补 `--text-color-tertiary` 后统一替换）。
- **半透明 / 混色**：需要主色淡背景时用 `color-mix(in srgb, var(--primary-color) N%, transparent)`，禁止硬编码 `rgba(64,158,255,...)`。
- **危险色文本**：用 `var(--danger-color)`，禁止 `#d14343` 等硬编码。
- **纯白文字**：反白内容用 `color: #fff` 仅在主色实底上（如 primary 卡、主按钮）；其余场景用 `--text-color`。集中定义，减少散落。

### 2.5 边框、阴影与毛玻璃

- **默认用 1px 边框而非阴影**表达分层：`border: var(--border-width) solid var(--border-color)`。禁止用 Material 阴影做默认层级。
- 弹层 / 浮层可用**一层**阴影 + 毛玻璃，禁止多层阴影。
- 毛玻璃统一 `backdrop-filter: blur(var(--ui-blur))`；`--ui-blur` 为 0 时视觉等同不透明卡片，页面不得另行判断或写死 blur 值。
- 边框宽度统一取 `--border-width`，禁止 `1.5px` 等非常规值。

### 2.6 图标尺寸

| 场景 | 尺寸 |
| ---- | ---- |
| 行内 / 小按钮 | 16–18px |
| 常规按钮、列表前导 | 20–24px |
| 顶部栏操作、主入口 | 24px |
| 空状态 / 大入口 | 32–48px |

- 图标库统一 **Lucide**（`lucide-vue-next`），不引入第二套线性图标。
- 可点图标按钮的**热区** ≥44px（图标可视尺寸可小）。

---

## 3. 变量使用规则与迁移映射表

### 3.1 规则

1. 业务代码 **禁止** 直接写 `--el-color-*`（Element Plus）与 §3.2 中**有 AIO 对应物**的 `--color-*`（MD3 兼容名）。二者仅存在于 `theme.css` / `themeTokens.ts` 的派生层，供 Varlet 原子件内部消化。
2. AIO 暂无对应物的 MD3 扩展色见 §3.4，**暂允许但已登记**，待 AIO 语义层补齐后替换；新增代码不得再引入。
3. 业务代码 **禁止** 直写十六进制 / `rgb()` / `rgba()` 颜色（内容性渐变、壁纸预览、图片遮罩除外，见 §11）。
4. 新增样式 **必须** 从 §2 的 token 中取值。

> 迁移状态（2026-10）：`mobile/src/**/*.vue` 中有 AIO 对应物的 MD3 别名与全部 `--el-color-*` 已完成替换，`--el-color-*` 残留为 0；构建通过。

### 3.2 MD3 兼容名 → AIO token 映射

| 现状（禁止） | 替换为 |
| ------------ | ------ |
| `--color-primary` | `--primary-color` |
| `--color-danger` / `--color-error` | `--danger-color` |
| `--color-success` / `--color-warning` / `--color-info` | 对应 AIO 状态色 |
| `--color-{primary,danger,warning}-rgb` | 对应 `--{primary,danger,warning}-color-rgb` |
| `--color-on-surface` | `--text-color` |
| `--color-on-surface-variant` / `--color-text-secondary` / `--color-text-placeholder` | `--text-color-light` |
| `--color-surface` / `--color-body` | `--bg-color` |
| `--color-surface-container` | `--container-bg` |
| `--color-surface-container-low` | `--card-bg` |
| `--color-surface-container-high` | `--input-bg` |
| `--color-surface-container-highest` | `--overlay-bg` |
| `--color-outline` / `--color-outline-variant` | `--border-color` |

### 3.3 Element Plus 变量清理记录（2026-10 已完成）

`--el-*` 全部 33 处已替换，残留为 0。其中 `--el-color-*` 15 处见下表；另 `--el-fill-color` / `--el-fill-color-light` / `--el-fill-color-lighter`（共 8 处）→ `--container-bg`、`--el-text-color-primary` / `-regular`（4 处）→ `--text-color`、`--el-text-color-secondary`（4 处）→ `--text-color-light`、`--el-border-color-darker`（1 处）→ `--border-color`：

| 位置 | 原值 | 替换为 |
| ---- | ---- | ------ |
| `llm-chat/components/BranchSelector.vue` | `--el-color-primary` | `--primary-color` |
| `llm-chat/components/ChatInput.vue` | `--el-color-primary` | `--primary-color` |
| `llm-chat/components/ChatMessage.vue` | `--el-color-primary-light-9/-5` | `color-mix(primary)` |
| `llm-chat/components/MessageContent.vue` | `--el-color-primary` / `--el-color-danger*` | `--primary-color` / `--danger-color` / `color-mix(danger)` |
| `llm-chat/components/MessageMenubar.vue` | `--el-color-danger` | `--danger-color` |
| `llm-chat/views/SessionList.vue` | `--el-color-danger-light-9` | `color-mix(danger)` |
| `llm-chat/views/LlmChatView.vue` | `--el-color-primary` | `--primary-color` |
| `rich-text-renderer/components/CodeBlock.vue` | `--el-color-success`（fallback） | `--success-color` |
| `rich-text-renderer/components/VcpBlock.vue` | `--el-color-danger`（fallback） | `--danger-color` |

### 3.4 AIO 暂无对应物的 MD3 扩展色（暂保留，待补）

以下变量由 Varlet `Themes.md3*` 提供，AIO 语义层目前没有等价概念，暂保留在业务样式中，待 §12.1 补齐后统一替换；其数量只能减少不能增加。

| 变量 | 语义 | 建议 AIO token（待定） |
| ---- | ---- | ---------------------- |
| `--color-primary-container` / `--color-on-primary-container` | 主色容器 / 其上文字 | `--primary-container-color` 等 |
| `--color-on-primary` | 主色实底文字 | 视场景用 `#fff` 或 `--on-primary-color` |
| `--color-secondary*` / `--color-tertiary*` | 次级 / 三级强调 | 评估后再定 |
| `--color-{danger,error}-container` / `--color-on-error-container` | 危险容器 | 用 `color-mix(danger)` 替代 |
| `--color-scrim` / `--color-shadow` | 遮罩 / 阴影 | 用 `--shadow-overlay` 替代 |

> CI / review 应禁止新增 `--el-` 与 §3.2 中的 `--color-*`；§3.4 变量数只能减不增。

---

## 4. 核心组件视觉规格

> 下列为**跨页面统一契约**；优先沉淀为 `mobile/src/components/base/` 组件（清单见 §12），未沉淀前各页也必须遵守数值。

### 4.1 按钮

| 类型 | 规格 |
| ---- | ---- |
| 主按钮 | 高 44px，圆角 `--app-radius-md`，底色 `--primary-color`，文字反白，字 `--font-size-lg`/600 |
| 次按钮 | 高 44px，底 `--input-bg`，边 `--border-color`，文字 `--text-color` |
| 文字按钮 | 高 44px（热区），无底无边，文字 `--primary-color` 或 `--text-color` |
| 图标按钮 | 热区 ≥44×44px，圆角 `--app-radius-md`，`active` 时底 `--input-bg` |
| 危险按钮 | 底/边用 `--danger-color` |

- 按钮圆角统一 `--app-radius-md`；禁止一处 `plain` 一处全圆。
- 禁用态：`opacity: 0.6`（统一值，禁止 0.58/0.4 等散值）。

### 4.2 输入与表单控件

- 输入框高 **44px**，圆角 `--app-radius-md`，底 `--input-bg`，边 `--border-width solid --border-color`，文字 `--font-size-md`；`focus` 边色 `--primary-color`（**不是** `--el-color-primary`）。
- 占位符 `--text-color-light`。
- **控件选择统一**：开关 / 单选 / 复选 / 滑杆 / 选择器在**同一工具内必须统一**（要么都用 Varlet 原子件，要么都用同一套自研）。禁止 `ChatSettingsView` 用 `var-switch` 而隔壁 `UserProfilesView` 用原生 `checkbox` 这种同工具分裂。
- 表单行布局统一：`标签（--font-size-md） + 控件`，标签与控件间距 `--space-2`；分组标题用 `--font-size-lg`/600。
- **禁止**在 `scoped` 样式中使用裸标签选择器（`input`/`select`/`textarea`/`label`）影响子组件，必须用类名限定。

### 4.3 列表项

| 形态 | 规格 |
| ---- | ---- |
| **卡片式**（默认） | 底 `--card-bg`，边 `--border-width solid --border-color`，圆角 `--app-radius-lg`，内边距 `--space-4`，卡片间距 `--space-3` |
| **分隔线式** | 仅行间 1px `--border-color` 分割，无圆角无边距卡片；行高 ≥64px，左右内边距 `--space-4` |

- **同一工具内列表形态必须统一**：现状 `AgentList` 用分隔线式、其它工具用卡片式，可接受（不同工具），但同一工具内不得混用。
- 列表项主文本 `--font-size-md`，次文本 `--font-size-sm` + `--text-color-light`。
- 行尾操作图标按钮热区 ≥44px（现状 27/30px 必须修正）。
- 触摸反馈：`active` 态背景变 `--input-bg` 或 `color-mix(primary 8%, transparent)`。
- **列表项禁用 `:title` 作为唯一说明**（触屏无效），改用可见文案或 `:aria-label`。

### 4.4 顶部栏（PageHeader）

**统一为一种骨架**，禁止 `var-app-bar` 与自研 div 两分天下：

- 高度 **54px**（`--app-bar-height`），底 `--sidebar-bg`，底边 1px `--border-color`，毛玻璃 `blur(var(--ui-blur))`。
- 结构：`左（返回/关闭，热区44） + 中（标题，--font-size-lg/600，单行省略） + 右（0–2 个操作）`。
- 标题统一左对齐；**禁止**同项目既有居中标题又有左对齐标题混用。
- 安全区：顶部避让 `--app-safe-area-top`，页面内容避让统一用 `--app-top-offset`。
- 顶部栏作为**待沉淀组件** `AppPageHeader`（`components/base/`），提供 `title` / `left` / `right` / `back` 插槽与 prop。

### 4.5 底部操作栏

- 固定于底部，底 `--sidebar-bg`，上边 1px `--border-color`，内边距 `--space-4`，含 `env(safe-area-inset-bottom)`。
- 仅用于"选中态批量操作"或"关键提交"，**不要每页都挂**。
- 与键盘避让联动（见 §8）。

### 4.6 弹层（Sheet / Dialog）

- **Sheet（底部抽屉，移动端默认选择）**：从底部升起，顶角 `--app-radius-xl`，底 `--overlay-bg`，含拖拽把手（40×4px，`--border-color`），最大高 `min(70vh, 560px)`，内容区可滚动，底部留安全区。
- **Dialog**：仅用于需要明确确认的中断式场景；圆角 `--app-radius-lg`，边 `--border-width solid --border-color`，按钮右对齐。
- 二者统一经项目封装（`feedback.ts` / `BaseDialog`）调用，禁止业务页直接 `var-popup`/`var-dialog` 搭结构（迁移期例外需注释说明）。
- 层级见 §7。

### 4.7 头像 / 徽标 / Chip

- 头像：默认**圆角矩形**（`--app-radius-md`），仅在明确需要时用圆形；尺寸 28 / 38 / 48 / 56px 四档，非方形时正方形裁切。
- 头像字母底色 `--primary-color`，字重 700。
- Chip：高 28–32px，胶囊圆角 999px，底 `--input-bg`，边 `--border-color`，选中态 `color-mix(primary 12%)` + 文字 `--primary-color`。
- 徽标（计数）：`--font-size-xs`，圆形/胶囊，底 `--danger-color`，文字反白。

### 4.8 空状态 / 加载 / 骨架

- **空状态统一组件**（待沉淀 `EmptyState`）：居中，图标 40–48px（`--text-color-light`），主文案 `--font-size-md`，可选次文案 `--font-size-sm`，可选一个操作按钮；统一为 `min-height: 220px`（现状 45vh/60vh/220px/96px 混用）。
- 加载：整页用居中 `var-loading`；局部用占位。
- 列表加载更多：统一"加载更多"按钮（高 44px）或骨架，**禁止**仅 asset-manager 一页有而其它页风格各异；需要骨架时用统一样式（`var-skeleton` 或待沉淀骨架）。

### 4.9 分段 / 标签页

- 分段控件（SegmentedTabs）：高 36–40px，胶囊圆角，底 `--input-bg`，选中块底 `--card-bg` + 文字 `--primary-color`，块切换无位移动画抖动。
- 用于同层级视图切换（如资产/存储），不用作主导航。

---

## 5. 页面模板

> 出现的页面 **必须** 归入下列五种模板之一，并复用同一套骨架；禁止每页自创结构。

### 5.1 网格首页（Home）

- 顶部：问候/品牌区（自研，`--font-size-2xl`）+ 右侧设置入口。
- 主体：**2 列网格**工具卡，卡片为纵向"图标 + 名称"，圆角 `--app-radius-lg`，间距 `--space-3`，卡片内边距 `--space-5`。
- 无底部导航。
- 卡片点击热区 ≥44px，`active` 反馈用 `color-mix`，不用硬编码 `rgba(64,158,255,...)`。

### 5.2 列表页

模板：`PageHeader（标题 + 右操作）+ [搜索/筛选栏] + 列表/空态 + [加载更多]`。
- 筛选栏 sticky 于 PageHeader 之下，底继承页面背景 + 毛玻璃。
- 列表形态按 §4.3 在**工具内统一**。
- 空态走 §4.8。
- 页面左右边距 `--space-4`。

### 5.3 详情 / 表单页

模板：`PageHeader（返回 + 标题 + 右保存）+ 分区表单 + [底部安全区留白]`。
- 分区用**同一层级容器**（统一卡片或统一裸分组，二选一，工具内一致）；区块标题 `--font-size-lg`/600。
- 输入按 §4.2。
- 保存反馈统一 `feedback.ts`；需展示保存中/失败态。
- 底部留 `max(--space-6, env(safe-area-inset-bottom))`。

### 5.4 设置页

模板：`PageHeader（或设置入口页头）+ 分组卡片（--container-bg/--card-bg，圆角 --app-radius-lg）+ 行式 cell`。
- 同类设置页 **圆角 / 内边距 / 标题尺寸必须一致**（现状 `Settings` 16px 圆角 vs `ThemeSettings` `--app-radius-lg` 必须收敛）。
- 分组标题 `--font-size-lg`/600 + `--text-color`；行说明 `--font-size-sm` + `--text-color-light`（用颜色而非 `opacity 0.3~0.6`）。
- 反馈统一走 `feedback.ts`（禁止本页 `Snackbar`、那页 `customMessage`）。

### 5.5 聊天页

- 全屏页面（可 `position: fixed`），底 `--bg-color`。
- 顶部栏：`PageHeader` + 右侧"当前智能体胶囊"（头像 28px + 名称 `--font-size-sm` 省略 + 下拉）。
- 主体：消息列表（占满剩余高度，统一在列表层纵向滚动）+ 底部输入区。
- **禁止**在渲染器内部产生纵向滚动条；长消息由消息列表统一滚动（既有约束保留）。
- 输入区固定底部，随键盘避让上移；回复引用条在输入框上方。
- 智能体选择用 **Sheet**（§4.6），不用全屏弹层。

---

## 6. 导航、层级与安全区

### 6.1 层级（z-index 契约）

| 层 | 值 | 用途 |
| -- | -- | ---- |
| 页面内容 | `auto`/0 | 常规 |
| Sticky 栏（顶栏/筛选/底栏） | 100 | 页面内固定 |
| 全屏页面（聊天） | 1000 | 覆盖常规页面 |
| Sheet / Popup | 1100 | 底部抽屉 |
| Dialog | 1200 | 中断确认 |
| 全局提示（toast） | 2000 | 最高 |

- 禁止沿用 100/1000/1001 混用；统一走上表或用集中常量。

### 6.2 返回行为

- 顶部左键统一"返回上一级路由"，行为与系统返回一致。
- 未保存表单离开前 **必须** 二次确认（统一走 `feedback.ts`）。
- 明确的一级工具首页返回目标固定为首页 `/`。

### 6.3 安全区

- 顶部避让 **统一** 用 `--app-safe-area-top`（经 `SafeTop`/`AppPageHeader`/`--app-top-offset`），**禁止**手写 `calc(8px + var(--app-safe-area-top))` 等变体。
- 底部避让统一 `env(safe-area-inset-bottom)`，经 `SafeBottom` 或底部栏组件处理。
- 内容顶部避让固定栏时，统一用 `--app-top-offset`，禁止 70/78/54px 魔法数。

---

## 7. 交互与反馈

- **触控目标** ≥44×44px；密集列表内的图标按钮也必须靠 padding 补足热区。
- **点击反馈** 必现：`active` 缩放 `scale(0.98)` 或背景变化，禁止无反馈的死区。
- **反馈统一入口**：`mobile/src/utils/feedback.ts` 的 `customMessage` / `customDialog`。
  - 禁止业务页直接 `import { Snackbar, Dialog } from "@varlet/ui"`。
  - `llm-chat` 的 `chatFeedback.ts` 应薄封装于 `feedback.ts` 之上，不得自成第三套。
- **加载态**：>300ms 的异步操作必须有进度或骨架，禁止静默卡顿。
- **动效**：时长 150–250ms，缓动统一；不做过场动画阻塞操作。
- **键盘避让**：输入控件聚焦时内容可滚动到可视区；页面底部操作栏随键盘上移（统一经 `useKeyboardAvoidance`）。

---

## 8. 可访问性

- 所有可点非按钮元素（`div` 卡片）**必须**补 `role="button"`、`tabindex="0"`、`@keydown.enter`；或直接用 `<button>`。现状 `ChatHome` 角色大厅卡缺失，属缺陷。
- 图标按钮 **必须** `aria-label`；禁止仅靠 `:title`（触屏无 tooltip）。
- 文字与背景对比度 ≥ 4.5:1（正文）、≥ 3:1（大字号）。
- 状态不只用颜色表达（选中/错误同时用图标或文字）。
- 触控热区与视觉尺寸解耦，保证小图标也可点。

---

## 9. 主题与明暗

- 页面 **禁止** 写 `isDark` 判断或维护两套色值；一切跟随 token。
- 新页面必须同时在明暗两种主题下走查。
- 壁纸 / 毛玻璃 / 取色为可选能力，关闭时（`--ui-effects-enabled=0`）视觉必须仍是完整可用的不透明界面。
- 自定义取色后，主色系派生（`--primary-color-rgb`、状态下混色）必须仍然协调。

---

## 10. 硬性禁令（review 必查）

1. 禁止新增 §3.2 中有 AIO 对应物的 `--color-*` MD3 兼容名作为业务主语；§3.4 扩展色不得再新增。
2. 禁止出现 `--el-color-*`。
3. 禁止硬编码颜色（内容性渐变/遮罩除外，需注释说明）。
4. 禁止硬编码圆角与字号（必须 token）。
5. 禁止魔法数做顶部/底部避让。
6. 禁止同工具内混用两套表单控件或两套反馈机制。
7. 禁止用 Varlet 容器组件（`var-app-bar`/`var-card`/`var-paper`/`var-cell`/`var-popup`/`var-bottom-navigation`）搭新增页面主结构。
8. 禁止 `scoped` 内裸标签选择器污染子组件。
9. 禁止可点区域小于 44px。
10. 禁止同一层级页面使用不同顶部栏骨架 / 对齐 / z-index。

---

## 11. 豁免

以下情况允许出现"硬编码"，但必须注释理由：

- 壁纸预览渐变、图片遮罩、图表数据色（内容本身）。
- 第三方组件内部样式（经 `:deep` 适配，尽量收敛到 `theme.css`）。
- 单次性品牌图形。
- 媒体 / 图片 / 视频叠加层上的白色文字与图标（底色为任意内容，配 `drop-shadow` 保证可读），如消息缩略图上的播放图标。

---

## 12. 待落地的 token 与组件清单

> 规范要能执行，必须先补这些基建。

### 12.1 token（`themeTokens.ts` / `theme.css`）

已完成（2026-10）：

- 间距：`--space-1..--space-10`（§2.1）
- 排版：`--font-size-xl`（20px）、`--font-size-2xl`（28px）
- 层级：`--z-sticky` / `--z-page` / `--z-sheet` / `--z-dialog` / `--z-toast`
- 阴影：`--shadow-overlay`（弹层单层阴影）

待补：

- 文本三级色 `--text-color-tertiary`（§2.4，用于替代散落的 opacity）
- MD3 扩展色语义层（§3.4 的 container / on-* / tertiary / secondary / scrim / shadow）

### 12.2 待沉淀组件（`mobile/src/components/base/`）

| 组件 | 覆盖现状 |
| ---- | -------- |
| `AppPageHeader` | 统一 5 种顶部栏 / 4 种避让 |
| `EmptyState` | 统一 6+ 页空态 |
| `BaseSheet` / BaseDialog 封装 | 收敛 var-popup/var-dialog 结构 |
| `BaseListItem` | 收敛 `var-cell`（98 处）与卡片/分隔线列表 |
| `SegmentedTabs` | 统一资产/存储等分段切换 |
| `LoadingMore` / 骨架 | 统一加载更多与骨架 |

---

## 13. 落地与验收

1. **先补 token 与基础组件**（§12）；token 已落地（2026-10），基础组件待沉淀。
2. **按工具逐个迁移**，顺序建议：`llm-chat`（污染最重）→ `agent-manager` → `asset-manager`（已较规范，只补字号 token）→ `settings`/`theme` → `llm-api`/`log-manager`。
3. **变量统一已完成**（2026-10）：有 AIO 对应物的 MD3 别名与全部 `--el-color-*` 已替换；后续迁移聚焦字号/圆角/间距 token 与页面骨架统一。
3. 每个工具迁移后运行 `bun run build` 与类型检查；涉及交互的走查明暗主题与窄屏。
4. **机器可查规则**（建议加 lint / CI）：
   - `mobile/src/**/*.vue` 中禁止 `--el-`；
   - 禁止 `--color-on-surface|surface|primary|danger|outline`;
   - 禁止在 `<style>` 中出现 `#hex` / `rgba(`（豁免文件白名单）。
5. 验收以"同类页面骨架一致、无越界变量、触控目标达标、明暗均可用"为准；视觉质量需真机/AVD 走查。

---

## 14. 与既有文档的关系

- 架构与主题主导权：见 [`mobile-design-language.md`](./mobile-design-language.md)。
- 新增工具流程：见 [`mobile-ui-development.md`](./mobile-ui-development.md)。
- 本文件是可判定的**数值与组件契约**，是 UI review 的判定依据；与实现冲突时以本文件为准并回溯修正实现。
