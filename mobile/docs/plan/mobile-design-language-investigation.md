# 移动端设计语言调查报告

> **状态**: Draft v3.1
> **作者**: 咕咕
> **日期**: 2026-05-31
> **前提**: 移动端尚未对外发布，仍处于内部构建阶段，**无线上兼容性债务**

---

## 版本演进

| 版本 | 核心命题                                                                                                                                                                                                                                                                                                   | 状态        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| v1   | 把"玻璃质感"当作 AIO Hub 的 DNA                                                                                                                                                                                                                                                                            | ❌ 错判     |
| v2   | DNA 修正为"高度可定制视觉系统 + 品牌一致性元素"，但仍在"换不换 UI 库"的框架里讨论                                                                                                                                                                                                                          | ⚠️ 不彻底   |
| v3   | 跳出"UI 库选型"框架，提出"组件抽象层"路线。但**误把桌面端 `BaseDialog` 类自研当作必然规律**，直接把"自研 base/" 写成了既定结论                                                                                                                                                                             | ⚠️ 武断     |
| v3.1 | **修正 v3 的武断**：自研 `base/` 是**候选方案而非既定结论**。桌面端 [`BaseDialog`](src/components/common/BaseDialog.vue) 自研是因为 `el-dialog` 实测不够理想，移动端要走同样路径必须先做**组件适配性调查**：逐个验证 Varlet 关键组件是否真的"承担骨架不够用"，再决定哪些下沉到 `base/`、哪些可继续直接使用 | ✅ 当前版本 |

---

## 0. 核心命题（v3.1 修订版）

### 0.1 v3 的可继承部分

**v2 之前的报告默认了一个隐含假设**："选好一个移动端 UI 库 + 把它调成 AIO 调性 = 完成血缘对齐"。**这个假设是错的**。

桌面端 [`LlmChat.vue`](src/tools/llm-chat/LlmChat.vue:369) 这种旗舰场景里，几乎**没有任何一个 `<el-*>` 标签**承担"页面骨架"角色：

```
LlmChat（旗舰页面）
├── 布局/拖拽/分离窗口  → 100% 手写 Vue + CSS
├── ChatArea / LeftSidebar / SessionsSidebar  → 100% 自研业务组件
├── Avatar / BaseDialog / DraggablePanel       → 全部自研通用组件
└── <el-button> / <el-input> / <el-select>     → Element Plus 只在最底层叶子节点出现
```

桌面端的设计哲学是：**UI 库主要负责"原子件"，骨架与业务大量自研**。这一点 v3 已经识别出来了，**保留作为指导思想**。

### 0.2 v3 的武断部分（v3.1 修正点）

v3 直接得出结论："移动端也必须自研 `base/`，把 Varlet 降级到表单原子件层。"

**这个结论跨越了一个未经验证的前提**：

> **桌面端做 [`BaseDialog`](src/components/common/BaseDialog.vue) 是因为 `el-dialog` 实测不够理想**（毛玻璃支持差、Tauri 滚动锁定问题、样式束缚多——这些都是项目规范反复提到的痛点）。
>
> 但**移动端 Varlet 的 `var-popup` / `var-app-bar` / `var-cell` 是否同样"承担骨架不够用"，从来没有人系统验证过**。

也许 `var-popup` 装上 AIO 主题 token 之后就够用了；也许 `var-app-bar` 沉浸式状态栏适配本身就能满足；也许 `var-cell` 加上简单的样式覆盖就能贴合 AIO 调性。**这些可能性 v3 没有评估，就跳到了"全部自研"的结论。**

### 0.3 v3.1 的修正命题

> **真正与桌面端血缘对齐的不是"换更合身的 UI 库"，但也不是"无脑全量自研"，而是经过组件级别评估之后，把"承担骨架不够用"的部分下沉到 `base/`，可用的部分继续保留。**
>
> **桌面端的 `common/` 层不是凭空创造的，是一个一个组件被 `el-*` 实测痛点驱动出来的**。移动端的 `base/` 层也应该走同样的演化路径：**先组件适配性调查，再决定下沉清单**。
>
> Varlet 大概率会被部分降级，但**降级的范围必须由调查结果决定，而不是由"对齐桌面端架构哲学"的预设结论决定**。

---

## 1. DNA 提取（沿用 v2 的结论）

### 1.1 默认形象（首次启动用户看到的）

基于 [`defaultAppearanceSettings`](src/utils/appSettings.ts:185) 的真实默认值，桌面端默认状态：

| 设置项                          | 默认值                        |
| ------------------------------- | ----------------------------- |
| `enableWallpaper`               | **false**                     |
| `enableUiEffects`               | **false**                     |
| `enableWindowEffects`           | **false**                     |
| `autoExtractColorFromWallpaper` | **false**                     |
| `themeColor`                    | `#409eff` Element Plus 默认蓝 |

**默认形象的视觉语汇**：

| 维度   | 桌面端默认                            |
| ------ | ------------------------------------- |
| 背景   | 纯色（跟随明/暗主题），无壁纸         |
| UI 层  | 不透明卡片，无模糊                    |
| 主题色 | `#409eff` Element Plus 蓝             |
| 状态色 | 绿/橙/红/灰，均为 Element Plus 标准色 |
| 边框   | 1px 标准实线                          |
| 圆角   | 中等克制（卡片 8-12px，按钮 6-8px）   |
| 头像   | **圆角矩形**（非圆形，关键品牌细节）  |
| 图标   | Lucide 线性图标，描边细               |
| 布局   | 三栏 + 顶部窗口栏 + 极窄图标侧栏      |

气质：**干净、专业、信息密集的桌面工具**。更接近 VSCode / Notion 的"工程工具"气质，而非花哨消费级应用。

### 1.2 高定制态（用户开启质感系统后）

- 壁纸基底 + 半透明卡片 + `backdrop-filter: blur()`
- 主题色随壁纸动态变化
- 背景色混合（hue/multiply/overlay 等 12 种）
- 分层透明度微调（侧边栏/卡片/弹窗各自偏移）
- 窗口特效（mica / acrylic / blur / vibrancy）

**这套能力是"一等公民可选项"，不是默认开启。**

### 1.3 DNA 三层结构

| 层级           | 内容                                                                                  | 重要性                      |
| -------------- | ------------------------------------------------------------------------------------- | --------------------------- |
| **品牌资产层** | AIO Hub Logo / 应用名 / 品牌字体 / Lucide 图标体系 / Element Plus 色板 / 圆角矩形头像 | ★★★★★ 任何状态下都必须保留  |
| **能力供给层** | "界面质感"自定义面板（壁纸/取色/透明/模糊/混合模式），与桌面端能力对齐                | ★★★★ 提供存在感本身就是 DNA |
| **架构哲学层** | UI 库主要负责原子件，骨架与业务大量自研（但**具体哪些自研要由实测痛点驱动**）         | ★★★★ v3.1 软化措辞          |

---

## 2. 移动端当前状态盘点

### 2.1 Varlet 渗透度

| 维度          | 数字                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Varlet 引用点 | **264 处**                                                                                                                                                                                       |
| 已用组件类型  | **23 种** 以上                                                                                                                                                                                   |
| 已建工具数量  | 4 个（`llm-api` / `llm-chat` / `log-manager` / `ui-tester`）                                                                                                                                     |
| 关键基础设施  | [`var-style-provider`](mobile/src/App.vue:77)（主题注入）、[`var-bottom-navigation`](mobile/src/components/AppBottomNav.vue:61)、命令式 [`Snackbar` / `Dialog`](mobile/src/views/Settings.vue:4) |
| 已发布        | **否**（无线上兼容性约束）                                                                                                                                                                       |

### 2.2 当前问题分类（v3.1 修订）

| 类别                          | 描述                                                                                  | 处理方式                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **基础设施缺位（已确认）**    | `customMessage` 等价封装缺失、桌面端血缘组件（Avatar 等）未移植——这部分跟 Varlet 无关 | **直接补建，不需要调查**                                     |
| **Varlet 越级嫌疑（待调查）** | `var-popup` / `var-app-bar` / `var-cell` 等组件**是否真的承担骨架不够用**             | **逐一实测后才能下结论**，不能直接照搬桌面端"必须自研"的结论 |

---

## 3. 候选目标架构（待调查论证）

> **重要说明（v3.1）**：本章描述的是**调查论证之后可能采纳的最终架构**，不是既定结论。具体哪些组件需要自研到 `base/`、哪些可保留直接使用 Varlet，**取决于第 4 章"组件适配性调查"的实测结果**。

### 3.1 桌面端的真实分层（学习对象）

```
src/
├── components/
│   ├── common/                  ← UI 地基层（自研通用组件）
│   │   ├── Avatar.vue           ← 圆角矩形头像（品牌标识）
│   │   ├── BaseDialog.vue       ← 明确声明"不是 el-dialog 封装"
│   │   │                         ← 自研原因：el-dialog 毛玻璃支持差、
│   │   │                                     Tauri 下滚动锁定有 bug、
│   │   │                                     样式控制束缚太多
│   │   ├── DraggablePanel.vue   ← 自研原因：Element Plus 无对应组件
│   │   ├── DropZone.vue
│   │   ├── DynamicIcon.vue
│   │   ├── RichCodeEditor.vue
│   │   ├── AvatarSelector.vue
│   │   └── ...
│   └── (其他业务组件)
├── tools/                       ← 各工具自治
│   └── {toolId}/
│       ├── components/          ← 工具自研业务组件（不直接吃 el-*）
│       └── ...
└── utils/
    ├── customMessage.ts         ← 包装 ElMessage（强制设置 offset 等）
    ├── errorHandler.ts          ← 统一错误处理
    └── ...

Element Plus 在这套结构里的角色：
  ✅ <el-button> / <el-input> / <el-select> / <el-form-item> 等原子件
  ✅ ElNotification / customMessage(ElMessage 包装) 全局通知
  ❌ 不承担页面骨架——但这是被 el-dialog 实测痛点逼出来的，不是预设的
```

> **关键观察**：桌面端 `common/` 层的每一个组件都对应着 Element Plus 的一个**实测痛点**。`BaseDialog` 不是凭"架构哲学"诞生的，是被项目规范里的 "MessageBox 滚动锁定处理"、毛玻璃需求等具体问题逼出来的。

### 3.2 移动端候选架构（取决于调查结果）

**结构骨架可能长这样**（具体内容由 §4 调查决定）：

```
mobile/src/
├── components/
│   ├── base/                    ← 可能新建：仅放调查证实"必须自研"的组件
│   │   └── (具体清单见 §4 调查结论)
│   ├── common/                  ← 已有，扩展为与桌面端对等
│   │   ├── Avatar.vue           ← 移植桌面端（圆角矩形 ★ DNA 标识，确定要做）
│   │   ├── DynamicIcon.vue      ← 已有
│   │   ├── IconPresetSelector.vue ← 已有
│   │   ├── AvatarSelector.vue   ← 待移植
│   │   └── ...
│   └── AppBottomNav.vue         ← 已有
├── tools/                       ← 各工具自治
└── utils/
    ├── customMessage.ts         ← 必做：包装 Snackbar（API 对齐桌面端）
    ├── customDialog.ts          ← 必做：包装 Dialog
    ├── errorHandler.ts          ← 已有
    ├── logger.ts                ← 已有
    └── ...
```

**Varlet 的最终角色由调查决定**，可能的两种极端：

- **最小变动版（如果调查显示 Varlet 容器足够用）**：仅做 `customMessage` 等价封装 + Avatar 移植 + 主题 token 覆盖，所有 `var-popup` / `var-app-bar` / `var-cell` 保留直接使用
- **最大重构版（如果调查显示 Varlet 容器全面不够用）**：建立完整 `base/` 层，Varlet 仅保留表单原子件
- **现实中大概率是混合**：部分组件下沉、部分保留

### 3.3 已确认必做项（不依赖调查）

无论调查结果如何，下列项目都需要做：

| 项目                                                                                 | 确定做的原因                                                 |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [`mobile/src/utils/customMessage.ts`](mobile/src/utils/customMessage.ts)             | 当前各处裸调 `Snackbar` 是反模式，桌面端规范明确要求统一封装 |
| [`mobile/src/utils/customDialog.ts`](mobile/src/utils/customDialog.ts)               | 同上                                                         |
| [`mobile/src/components/common/Avatar.vue`](mobile/src/components/common/Avatar.vue) | 圆角矩形头像是 ★★★★★ DNA 标识，必须移植                      |
| 主题 token 覆盖（`mobile/src/styles/`）                                              | 把 Element Plus 蓝调 token 注入到 Varlet 默认变量            |
| 桌面端 [`useThemeAppearance`](src/composables/useThemeAppearance.ts) 移植            | "界面质感"系统对等是 DNA 一部分                              |

---

## 4. 组件适配性调查（v3.1 新增，最关键的前置工作）

> **本章是 v3.1 相对 v3 的最大新增**：在动任何代码之前，需要逐一评估 Varlet 关键组件"承担骨架够不够用"，调查结论决定 `base/` 层的实际内容。

### 4.1 调查方法论

每个组件按以下维度评估：

| 维度             | 评估问题                                                                        | 输出                                   |
| ---------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| **DNA 贴合度**   | 通过 token 覆盖能否压成 AIO 调性？                                              | 能 / 不能 / 需大量 SCSS override       |
| **功能完整度**   | 是否支持移动端必需特性（沉浸状态栏、安全区、长按、滑动操作）？                  | 全支持 / 部分支持 / 不支持             |
| **样式控制力**   | 是否允许充分定制（圆角、阴影、间距、深色模式）？                                | 高 / 中 / 低                           |
| **质感系统适配** | 是否支持 `backdrop-filter` 半透明 + 模糊？                                      | 原生支持 / 需 hack / 不支持            |
| **Tauri 兼容性** | 在 Tauri 移动 WebView 下是否有特殊 bug？（参考桌面端 `el-dialog` 滚动锁定问题） | 无问题 / 有可绕过的 bug / 有阻塞性 bug |
| **替代成本**     | 如果不用它，自研工作量？                                                        | 小 / 中 / 大                           |

每个组件最终输出一个明确结论：**保留 / 包装薄层 / 下沉 base/**。

### 4.2 待调查组件清单（按优先级）

#### 🔴 高优先级（最可能"承担骨架不够用"）

| 组件                                                                       | 调查重点                                                                            | 备注                                                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`var-popup`](mobile/src/tools/llm-api/components/ProfileEditor.vue:302)   | 底部 Sheet / 全屏 Sheet 双模态支持？毛玻璃？嵌套 Sheet 行为？安全区适配？           | 对标桌面端 [`BaseDialog`](src/components/common/BaseDialog.vue) 自研动因 |
| [`var-app-bar`](mobile/src/tools/llm-api/components/ProfileEditor.vue:309) | 沉浸式状态栏融合？滚动渐显？大标题模式？左中右插槽灵活度？                          | 决定 Sheet/页面顶部体验                                                  |
| [`var-cell`](mobile/src/views/Settings.vue:134)                            | 长按 / 左右滑动操作支持？分组样式？深色模式贴合度？                                 | 列表是移动端核心交互                                                     |
| [`var-style-provider`](mobile/src/App.vue:77)                              | 是否阻塞使用 `:root` CSS Variables 注入？是否能与 `useThemeAppearance` 移植版兼容？ | 主题系统对等的关键                                                       |

#### 🟡 中优先级

| 组件                            | 调查重点                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `var-bottom-navigation`         | 自定义 active 形态、徽标位置、键盘弹起隐藏行为                                     |
| `var-paper` / `var-card`        | 阴影 vs 边框风格冲突，毛玻璃支持                                                   |
| `var-dialog`（命令式 + 组件式） | 与桌面端 [`BaseDialog`](src/components/common/BaseDialog.vue) 在样式自由度上的差距 |
| `var-tabs`                      | active 指示器自定义、滚动 Tab 支持                                                 |

#### 🟢 低优先级（大概率保留）

| 组件                                                                                                                | 备注                                                         |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `var-button` / `var-input` / `var-select` / `var-switch` / `var-slider` / `var-checkbox` / `var-chip` / `var-radio` | 表单原子件，桌面端对位的 `el-*` 同样保留直用，没有理由全自研 |
| `var-collapse` / `var-result` / `var-loading`                                                                       | 工程组件，按需保留                                           |

#### ⚪ 命令式 API（不在"组件下沉"讨论范围）

| API        | 处理方式                                                               |
| ---------- | ---------------------------------------------------------------------- |
| `Snackbar` | **必做 customMessage 封装**（与桌面端对齐），但底层依然调用 `Snackbar` |
| `Dialog`   | 同上，封装为 `customDialog`                                            |

### 4.3 调查执行方式

1. **选一个真实场景做样板**：建议挑 [`ProfileEditor.vue`](mobile/src/tools/llm-api/components/ProfileEditor.vue:302)（包含 `var-popup` + `var-app-bar` + `var-cell` + 各种原子件，覆盖度最高）
2. **不改 Varlet 本身，纯靠 token 覆盖与 SCSS** 把它调到 AIO 调性
3. **逐组件对照 4.1 评估表填写结论**
4. **输出调查报告 v3.1 附录**：明确 `base/` 层的最终清单（可能是 0 个、1 个、N 个）

### 4.4 调查的可能结论谱系

| 结论档位                     | base/ 实际内容                          | 工作量                                         |
| ---------------------------- | --------------------------------------- | ---------------------------------------------- |
| **A. Varlet 容器完全够用**   | base/ 为空                              | 最小：仅做 customMessage + Avatar + 主题 token |
| **B. 个别组件需要自研**      | base/ 内有 1-3 个组件（如 `BaseSheet`） | 小                                             |
| **C. 容器层普遍不够用**      | base/ 内有 5+ 个组件                    | 中                                             |
| **D. Varlet 容器全面不合身** | 接近 v3 描绘的全套 base/                | 大                                             |

**没有调查就无法预判会落在哪一档**。咕咕个人**直觉估计在 B-C 之间**（`var-popup`、`var-app-bar` 大概率需要自研，`var-cell` 可能 token 覆盖就够，`var-tabs` 等可能完全保留），但**直觉不能代替调查**。

---

## 5. 推进路径

工时不是约束，路线按"架构完备性"组织而非"工时压缩"组织。

### Phase 0：本报告评审与决议（当前）

- 姐姐审议 v3.1 → 确认是否接受"先调查后下沉"的方法论
- 决议第 7 节决策项
- 进入 Phase 1

### Phase 1：必做基础设施 + 组件适配性调查（并行）

**已确认必做项**（不依赖调查结论）：

1. 建立 [`mobile/src/utils/customMessage.ts`](mobile/src/utils/customMessage.ts) 和 [`mobile/src/utils/customDialog.ts`](mobile/src/utils/customDialog.ts)，包装 Varlet 的 Snackbar / Dialog，API 对齐桌面端
2. 移植桌面端 [`Avatar`](src/components/common/Avatar.vue) 为 [`mobile/src/components/common/Avatar.vue`](mobile/src/components/common/Avatar.vue)（圆角矩形 ★ DNA 标识）
3. 全局 Element Plus 蓝调 token 注入 `:root`（主色 `#409eff`、状态色全套），同时评估能否绕过 [`var-style-provider`](mobile/src/App.vue:77)

**并行执行的核心调查**：

4. 按 §4 方法论对 🔴 高优先级 4 个组件（`var-popup` / `var-app-bar` / `var-cell` / `var-style-provider`）做样板验证
5. 输出"Varlet 组件适配性评估报告"（作为 v3.1 附录）
6. 据此确定 `base/` 层最终清单

**验收**：`customMessage` 可在任意位置使用 + Avatar 上线 + 主题 token 注入到位 + 调查报告产出明确的 base/ 清单

### Phase 2：按调查结论建设 base/ 层（如有需要）

**内容取决于 Phase 1 调查结论**。可能的最大清单：

- `BaseSheet.vue`（如确认 `var-popup` 在 Sheet 双形态 / 毛玻璃上不够用）
- `BaseAppBar.vue`（如确认 `var-app-bar` 沉浸式状态栏 / 大标题模式不够用）
- `BaseCell.vue`（如确认 `var-cell` 长按 / 滑动操作不够用）
- `BaseSegment.vue` / `BaseBottomNav.vue`（按需）

**验收**：所有下沉到 `base/` 的组件可被独立引用；业务代码迁移完成。

### Phase 3：默认形象重塑

**目标**：把页面骨架按 Phase 1 + Phase 2 的成果重新组装。

1. 重写 [`AppBottomNav.vue`](mobile/src/components/AppBottomNav.vue:61) 内部（根据调查决定是否吃 `BaseBottomNav`）
2. 重写 [`Settings.vue`](mobile/src/views/Settings.vue:128)（根据调查决定 `var-cell` 是保留还是改 `BaseCell`）
3. 重写 [`ProfileEditor.vue`](mobile/src/tools/llm-api/components/ProfileEditor.vue:302) / [`ModelEditorPopup.vue`](mobile/src/tools/llm-api/components/ModelEditorPopup.vue:254) / [`KeyStatusManagerPopup.vue`](mobile/src/tools/llm-api/components/KeyStatusManagerPopup.vue:127)
4. 重写 [`LogManagerView.vue`](mobile/src/tools/log-manager/views/LogManagerView.vue) / [`UiTesterView.vue`](mobile/src/tools/ui-tester/views/UiTesterView.vue)
5. 设计并实现移动端"主页 + 工具入口"页面
6. 沉浸式状态栏适配（Android / iOS）

**验收**：关闭"界面质感"系统时，移动端首屏与桌面端首屏并排，能看出明显血缘且气质统一

### Phase 4：质感系统平移

**目标**：把桌面端 [`useThemeAppearance`](src/composables/useThemeAppearance.ts) 移植过来。

1. 移植 [`useThemeAppearance.ts`](src/composables/useThemeAppearance.ts)（剥离 PC 专属部分：分离窗口透明度、`window-vibrancy` 等）
2. 移植壁纸管理（适配 Tauri 移动端文件访问 / Android Scoped Storage / iOS 沙盒）
3. 移植壁纸取色逻辑（评估是否需要 Rust 端实现以避免 CPU 占用）
4. 重做"主题壁纸外观"面板（设计语汇与桌面端 [`ThemeAppearanceSettings.vue`](src/views/Settings/general/ThemeAppearanceSettings.vue) 对齐）
5. 性能降级方案（低端 Android 设备自动关 `backdrop-filter`）

**验收**：用户打开"界面质感"后，移动端能呈现与桌面端同源的玻璃化效果；每个分项开关独立可控

### Phase 5：旗舰场景打通

1. **LLM 对话**：参考桌面端 [`LlmChat.vue`](src/tools/llm-chat/LlmChat.vue) 转化为单栏 + 抽屉（智能体抽屉 / 会话抽屉），底部输入条
2. **智能体管理**：列表 + 编辑 Sheet
3. **设置中心完整化**：覆盖桌面端所有设置项的移动端对位
4. **通知中心**：独立页面 + 角标

**验收**：日常使用的核心场景在移动端可独立完成，不需要切换回桌面端

### Phase 6：持续对齐评估

- 桌面端有新功能时，移动端能否快速跟进（验证抽象层是否有效）
- 是否有更多 Varlet 组件在使用中暴露"不够用"，需要补充下沉到 `base/`
- 视情况评估是否需要换组件库（此时业务代码已与 `base/` 解耦，迁移成本最低）

---

## 6. 关于"264 处 `var-*` 处理预案"

按角色分类的**候选**处理方式（最终方案取决于 §4 调查）：

| Varlet 组件                                                                                                         | 当前使用占比（估算） | 候选处理方式                                                          |
| ------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------- |
| `var-button` / `var-input` / `var-select` / `var-switch` / `var-slider` / `var-checkbox` / `var-chip` / `var-radio` | ~60%                 | **大概率保留**。表单原子件层，桌面端对位的 `el-*` 同样直接使用        |
| `var-popup` / `var-app-bar`                                                                                         | ~15%                 | **调查重点**。可能下沉到 `BaseSheet` / `BaseAppBar`，也可能保留       |
| `var-cell` / `var-paper` / `var-card`                                                                               | ~15%                 | **调查重点**。可能下沉到 `BaseCell` + 手写容器，也可能仅做 token 覆盖 |
| `var-bottom-navigation`                                                                                             | ~1%                  | 视调查结论。键盘弹起隐藏逻辑是关键评估点                              |
| `var-collapse` / `var-tabs` / `var-result` / `var-loading` 等                                                       | ~7%                  | **大概率保留**。工程组件                                              |
| `var-style-provider`                                                                                                | 1 处但关键           | **调查重点**。是否能改为 `:root` CSS Variables 注入                   |
| `Snackbar` / `Dialog`（命令式 API）                                                                                 | 散落各处             | **必做**：用 `customMessage` / `customDialog` 全面包装替换            |

---

## 7. 关键决策项（需姐姐拍板）

### 决策 A：导航范式

- [ ] **A1**: 底部 Tab Bar（4-5 个核心入口：首页 / 工具 / 对话 / 通知 / 我的）
- [ ] **A2**: 顶部 Segment + 抽屉式工具列表
- [ ] **A3**: 仅首页 + 全屏工具页（极简）

> 咕咕推荐 **A1**。底部 Tab 是移动端最熟的导航范式，与"工具枢纽"定位匹配。

- 我觉得底部目前用工具首页和设置页还行，其他的大部分放在工具列表中了，包括渠道、用户啥的，做的和pc不一样，更模块化，应用的主设置承担的更少

### 决策 B：组件分层方法论（v3.1 重写）

~~v3 的 "直接接受组件抽象层路线" 是武断结论~~

- [-] **B-v3.1-1**: 接受 v3.1 提出的"**先组件适配性调查，再决定下沉清单**"方法论，base/ 内容由调查结果决定
- [ ] **B-v3.1-2**: 跳过调查，直接按 v3 全量自研 base/（高确定性、高工作量、可能浪费在不需要的组件上）
- [ ] **B-v3.1-3**: 跳过调查，最小动作——只做 `customMessage` + `Avatar` + 主题 token，所有 Varlet 容器保留直接使用（高确定性、低工作量、可能后续暴露不够用要返工）

> 咕咕推荐 **B-v3.1-1**。这是最贴合桌面端"组件由实测痛点驱动"演化路径的方法论，避免主观武断。

### 决策 C：默认形象气质方向

- [ ] **C1**: 紧贴桌面端默认形象 — 干净的 Element Plus 蓝、不透明卡片、克制圆角
- [-] **C2**: 移动端有自己的默认偏好 — 默认深色 + 略大圆角（10-14px）+ 略多留白，但仍是中性色 + 无玻璃
- [ ] **C3**: 默认就开启浅玻璃 — 给用户一个"美观但克制"的初体验

> 咕咕推荐 **C2**。移动端用户对 iOS/Android 系统级深色偏好较强，完全照搬桌面端浅色蓝调可能水土不服；但也不要默认开玻璃——那是用户主动化的妆。

### 决策 D：Phase 推进顺序

- [ ] **D1**: 严格按 Phase 1 → 2 → ... 顺序推进
- [-] **D2**: Phase 1（必做项 + 调查）必须先完成，之后 Phase 2/3/4 视情况并行
- [ ] **D3**: 用 [`ProfileEditor.vue`](mobile/src/tools/llm-api/components/ProfileEditor.vue:302) 这种重灾区做样板调查，结论出来后再统一规划后续

> 咕咕推荐 **D2** 或 **D3**。Phase 1 必须先做完才能解锁后续，但 Phase 2 之后的内容可以根据调查结论并行展开。

### 决策 E：是否保留"分离窗口"概念

- [-] **E1**: 不保留
- [ ] **E2**: 用"画中画悬浮球"概念部分模拟（仅特定工具，如 LLM 对话）

> 咕咕推荐 **E1**。移动端形态本质不支持桌面端的"拖拽分离"语义，强行模拟得不偿失。

### 决策 F：移动端 Avatar / 头像形态

- [-] **F1**: 圆角矩形（与桌面端完全一致，★ DNA 标识）
- [ ] **F2**: 移动端默认圆形（贴近 iOS/Android 系统习惯），仅在用户开启"桌面端血缘模式"时切换为圆角矩形
- [ ] **F3**: 始终圆角矩形但圆角更大（如 12-14px），形成移动端自己的变体但与桌面端有血缘感

> 咕咕推荐 **F1**。圆角矩形头像是 AIO Hub 最低成本就能识别的品牌标识，没有任何牺牲它的理由。

### 决策 G：调查样板选择（v3.1 新增）

- [ ] **G1**: 用 [`ProfileEditor.vue`](mobile/src/tools/llm-api/components/ProfileEditor.vue:302)（覆盖 var-popup + var-app-bar + var-cell + 原子件，覆盖度最高）
- [ ] **G2**: 用 [`Settings.vue`](mobile/src/views/Settings.vue:128)（系统页，影响面广）
- [-] **G3**: 全部 4 个工具各取一个典型页面，平行验证

> 咕咕推荐 **G1**。覆盖度最高，单次调查信息量最大；若 G1 结论清晰，G3 的工作量可省。

---

## 8. 风险与待研究项

1. **Tauri 移动端 `backdrop-filter` 性能**：低端 Android 压测，可能需要"低性能设备自动降级"方案
2. **Tauri 移动端壁纸文件访问权限**：Android Scoped Storage / iOS 沙盒
3. **取色性能**：移动端 CPU 弱，可能需要 Web Worker 或 Rust 端实现
4. **沉浸式状态栏**：Android / iOS Tauri API 支持度调研
5. **手势冲突**：系统手势 vs 应用手势（左滑返回、底部上滑等）
6. **Element Plus 色板的移动端等价性**：直接用 `#409eff` 在移动端是否合适？建议做一次完整深浅色双模式视觉评审
7. **`var-style-provider` 与 `:root` 注入的兼容性**：是否能并存？是否会出现样式优先级冲突？（§4 调查会答复）
8. **Varlet 长期维护性**：当前版本 ^3.13.0 活跃维护中，但需关注 Tauri 移动 WebView 兼容性问题的修复速度
9. **桌面端 [`BaseDialog`](src/components/common/BaseDialog.vue) 自研的具体动因复盘**：建议姐姐 / 咕咕回顾当年决定自研的具体痛点列表，作为移动端调查的对照参考

---

## 9. 附录：参考对标

**默认形象对标**（干净专业的工具感）：

- **Linear Mobile** — 克制专业的极致
- **GitHub Mobile** — 开发者工具气质
- **Notion Mobile** — 信息工具气质

**高定制态对标**（玻璃质感方向）：

- **Raycast (iOS)** — 半透明 + 模糊
- **Things 3** — 精致细节
- **Telegram** — 高度可定制

**组件抽象层对标**（架构哲学方向）：

- **Linear 自身的 Design System** — 极度克制的 Primitive 层 + 业务层
- **Radix UI / Headless UI** — UI 库只提供行为，样式与骨架自研的极致代表
- **Notion 移动端** — 同样大量自研容器，UI 库仅在原子件层出现

---

## 10. 决议记录

| 日期 | 决议项                | 结论 | 决议人 |
| ---- | --------------------- | ---- | ------ |
| -    | A 导航范式            | 待定 | -      |
| -    | B-v3.1 组件分层方法论 | 待定 | -      |
| -    | C 默认形象气质方向    | 待定 | -      |
| -    | D Phase 推进顺序      | 待定 | -      |
| -    | E 分离窗口            | 待定 | -      |
| -    | F Avatar 形态         | 待定 | -      |
| -    | G 调查样板选择        | 待定 | -      |

---

## 11. 修订历史

| 版本     | 日期           | 变更                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1       | 2026-05-31     | 初稿。误把"用户高定制态"当作产品默认形象                                                                                                                                                                                                                                                                                                                                                                                  |
| v2       | 2026-05-31     | 重要勘误：基于 `defaultAppearanceSettings` 真实默认值重写。明确 DNA 不是"玻璃质感"而是"高度可定制的视觉系统 + 品牌一致性元素"。新增决策项 C                                                                                                                                                                                                                                                                               |
| v2.1     | 2026-05-31     | 小勘误：删除"底部 V 形品牌锚点"——实为 Vue DevTools 浮标                                                                                                                                                                                                                                                                                                                                                                   |
| v3       | 2026-05-31     | 核心命题升级：跳出"UI 库选型"框架，提出"组件抽象层"路线——但**误把桌面端 BaseDialog 类自研当作必然规律**，直接把"自研 base/" 写成了既定结论                                                                                                                                                                                                                                                                                |
| **v3.1** | **2026-05-31** | **方法论修正**：自研 `base/` 是**候选方案而非既定结论**。桌面端 [`BaseDialog`](src/components/common/BaseDialog.vue) 自研是因为 `el-dialog` 实测不够理想（毛玻璃、滚动锁定、样式束缚），移动端要走同样路径必须先做**组件适配性调查**。新增第 4 章"组件适配性调查"。Phase 重组为 6 阶段（新增调查 Phase）。第 3 章从"目标架构"改为"候选目标架构（待调查论证）"，明确"已确认必做项"vs"待调查项"。新增决策 G（调查样板选择） |
