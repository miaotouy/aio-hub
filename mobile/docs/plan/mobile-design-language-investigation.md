# 移动端设计语言与 Varlet 降级决议

> **状态**: Accepted v4
> **作者**: 咕咕 / Codex
> **日期**: 2026-06-09
> **前提**: 移动端尚未对外发布，仍处于内部构建阶段，**无线上兼容性债务**

---

## 版本演进

| 版本 | 核心命题                                                                                              | 状态         |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------ |
| v1   | 把"玻璃质感"当作 AIO Hub 的 DNA                                                                       | 错判         |
| v2   | DNA 修正为"高度可定制视觉系统 + 品牌一致性元素"，但仍在"换不换 UI 库"的框架里讨论                     | 不彻底       |
| v3   | 跳出"UI 库选型"框架，提出组件抽象层路线，但直接把自研 `base/` 写成既定结论                            | 武断         |
| v3.1 | 修正为"先组件适配性调查，再决定 Varlet 降级范围"                                                      | 已被 v4 覆盖 |
| v4   | **直接决议：Varlet 降级为底层组件库。移动端整体仍以 Vue 原生组件、项目 CSS token 和业务自研骨架为主** | 当前版本     |

---

## 0. 当前决议

这次不再继续围绕"Varlet 是否适合承担移动端框架"做开放式调查。实际体验已经给出结论：

> **Varlet 的默认设计语言和主题气质不适合作为 AIO Hub Mobile 的整体框架。**
>
> 它可以留下来，像桌面端的 Element Plus 一样提供底层组件能力；但不能继续决定移动端页面骨架、主题表现、容器语义和默认审美。

移动端的新定位：

```text
Tauri v2 + Vue 3 + TypeScript + Rust
  ├─ AIO Hub 自有主题 token / 质感系统 / 品牌细节
  ├─ Vue 原生组件与业务组件承担页面骨架
  ├─ mobile/src/components/common/ 沉淀跨工具通用组件
  ├─ mobile/src/components/base/ 沉淀移动端基础容器与交互骨架
  └─ Varlet 仅作为可替换的底层组件库
```

一句话：**移动端是 AIO Hub 的 Vue/Tauri 移动实现，不是 Varlet/MD3 应用。**

---

## 1. 设计 DNA

### 1.1 默认形象

桌面端默认状态的真实气质是：

| 维度   | 桌面端默认                      |
| ------ | ------------------------------- |
| 背景   | 纯色，跟随明暗主题              |
| UI 层  | 不透明卡片，无默认玻璃          |
| 主题色 | `#409eff` Element Plus 蓝       |
| 状态色 | 绿 / 橙 / 红 / 灰，克制工具色板 |
| 边框   | 1px 标准实线                    |
| 圆角   | 中等克制                        |
| 头像   | 圆角矩形，非圆形                |
| 图标   | Lucide 线性图标                 |
| 布局   | 信息密度高，偏工程工具          |

移动端允许更适合触屏的间距、字号和单栏流程，但默认气质仍应是**干净、专业、信息清楚的工具应用**，不是 Material Design 模板应用，也不是一套 Varlet 主题样板。

### 1.2 高定制态

质感系统是 AIO Hub 的能力，而不是默认妆效：

- 壁纸基底
- 半透明层
- `backdrop-filter: blur(var(--ui-blur))`
- 主题色自动取色
- 卡片/弹层/导航透明度分层
- 性能降级策略

移动端后续应移植这套能力，但默认不把玻璃、MD3 动态色或 Varlet 主题当作产品识别本身。

### 1.3 架构 DNA

桌面端的真实分层是：

```text
页面骨架 / 业务容器 / 复杂交互  -> 自研 Vue 组件
通用能力组件                  -> src/components/common/
按钮 / 输入 / 选择等原子件     -> Element Plus
命令式消息与弹窗              -> customMessage / BaseDialog 等项目封装
```

移动端应对齐这套思想：

```text
页面骨架 / 工具容器 / 移动交互  -> 自研 Vue 组件
移动端基础组件                -> mobile/src/components/base/
跨工具通用组件                -> mobile/src/components/common/
按钮 / 输入 / 选择等原子件     -> Varlet 可用但不主导
命令式消息与弹窗              -> customMessage / customDialog 项目封装
```

---

## 2. Varlet 新定位

### 2.1 可以保留的范围

Varlet 可以继续用于：

- `var-button`
- `var-input`
- `var-select`
- `var-switch`
- `var-slider`
- `var-checkbox`
- `var-radio`
- `var-chip`
- `var-loading`
- 其他低风险、叶子节点级组件
- `Snackbar` / `Dialog` 的底层实现，但必须经项目封装后调用

这些组件的角色与桌面端的 `<el-button>`、`<el-input>`、`<el-select>` 类似：**省实现成本，但不定义产品骨架。**

### 2.2 不应继续承担的范围

以下组件不应作为新增页面或重构后的主结构来源：

- `var-app-bar`
- `var-popup`
- `var-cell`
- `var-card`
- `var-paper`
- `var-bottom-navigation`
- `var-style-provider` 对项目主题的主导权

已有代码可以渐进迁移，但新增代码不要继续扩大这些组件的结构性占比。

### 2.3 命令式 API

业务代码不应继续散落：

```ts
import { Snackbar, Dialog } from "@varlet/ui";
```

目标是统一替换为：

```ts
import { customMessage } from "@/utils/customMessage";
import { customDialog } from "@/utils/customDialog";
```

底层仍可调用 Varlet，但调用点必须收敛，API 与桌面端习惯对齐。

---

## 3. 目标分层

```text
mobile/src/
├── components/
│   ├── base/
│   │   ├── BaseSheet.vue          # 底部 / 全屏弹层骨架
│   │   ├── BaseAppBar.vue         # 顶部栏 / 大标题 / 安全区
│   │   ├── BaseList.vue           # 分组列表容器
│   │   ├── BaseListItem.vue       # 列表项 / 操作槽
│   │   ├── BaseBottomNav.vue      # 底部导航
│   │   └── BasePage.vue           # 页面基础布局
│   ├── common/
│   │   ├── Avatar.vue             # 圆角矩形头像，必须移植
│   │   ├── DynamicIcon.vue
│   │   ├── IconPresetSelector.vue
│   │   ├── AvatarSelector.vue
│   │   └── ...
│   └── AppBottomNav.vue
├── tools/
│   └── {toolId}/
│       ├── views/
│       ├── components/
│       └── {toolId}.registry.ts
├── stores/
│   └── theme.ts                   # 输出 AIO token，兼容写入 Varlet 变量
└── utils/
    ├── customMessage.ts
    ├── customDialog.ts
    ├── errorHandler.ts
    ├── logger.ts
    └── ...
```

`base/` 不需要一口气做完，但新增移动端结构性需求应优先进入这里，而不是继续直接套 Varlet 容器。

---

## 4. 主题规则

### 4.1 主从关系

主题主从关系必须明确：

```text
AIO Hub token -> 移动端 Vue/CSS 组件 -> Varlet 兼容变量
```

不能倒过来：

```text
Varlet / MD3 token -> AIO Hub 主题
```

### 4.2 必备项目 token

移动端至少应稳定维护下列项目级变量：

| 类型   | 变量示例                                                                  |
| ------ | ------------------------------------------------------------------------- |
| 品牌色 | `--primary-color`                                                         |
| 状态色 | `--success-color` / `--warning-color` / `--danger-color` / `--info-color` |
| 背景   | `--bg-color` / `--card-bg` / `--container-bg` / `--input-bg`              |
| 文本   | `--text-color` / `--text-secondary-color`                                 |
| 边框   | `--border-color` / `--border-width`                                       |
| 圆角   | `--app-radius-sm` / `--app-radius-md` / `--app-radius-lg`                 |
| 质感   | `--ui-blur` / `--card-opacity`                                            |
| 安全区 | `--app-safe-area-top` / `--app-top-offset`                                |

Varlet 变量只能作为适配输出，用于让保留的 `var-*` 原子件不突兀。

### 4.3 视觉禁区

- 不要把 Material Design 3 当作移动端视觉基准。
- 不要让大面积 `var-card` / `var-paper` 形成统一的 Varlet 味。
- 不要用 Varlet 默认圆角、阴影、surface 分层决定 AIO 的默认观感。
- 不要把 `StyleProvider` 的主题输出当成唯一主题源。

---

## 5. 迁移路线

### Phase 0：规范落地

- 更新 `AGENTS.md`，明确移动端 UI 分层。
- 更新 README、架构概览、用户指南和工具开发指南里的 Varlet 表述。
- 将本文件作为移动端设计语言的当前决议。

### Phase 1：收敛全局调用

1. 建立 `mobile/src/utils/customMessage.ts`，包装 Varlet `Snackbar`。
2. 建立 `mobile/src/utils/customDialog.ts`，包装 Varlet `Dialog`。
3. 替换业务代码里散落的 `Snackbar` / `Dialog` 直接调用。
4. 保留 Varlet 底层实现，但让业务层只看项目 API。

### Phase 2：建立基础骨架

优先补齐：

- `BasePage.vue`
- `BaseAppBar.vue`
- `BaseSheet.vue`
- `BaseList.vue`
- `BaseListItem.vue`
- `BaseBottomNav.vue`

这些组件应使用 Vue 原生模板与项目 CSS 实现，只有叶子操作控件可以使用 Varlet。

### Phase 3：重构重灾区

优先迁移直接决定气质的页面：

- `mobile/src/components/AppBottomNav.vue`
- `mobile/src/views/Settings.vue`
- `mobile/src/tools/llm-api/components/ProfileEditor.vue`
- `mobile/src/tools/llm-api/components/ModelEditorPopup.vue`
- `mobile/src/tools/llm-api/components/KeyStatusManagerPopup.vue`
- `mobile/src/tools/log-manager/views/LogManagerView.vue`
- `mobile/src/tools/ui-tester/views/UiTesterView.vue`

目标是让页面骨架不再依赖 `var-app-bar`、`var-popup`、`var-cell`、`var-card` 这类 Varlet 容器。

### Phase 4：主题系统反转

1. 将主题 store 调整为输出 AIO Hub 项目 token。
2. 把 Varlet HSL / 组件变量改为派生兼容层。
3. 补齐桌面端质感系统的移动端等价能力。
4. 针对低端 Android 设备保留 `backdrop-filter` 降级策略。

### Phase 5：旗舰场景重塑

LLM 对话、LLM 服务、日志管理和设置中心按新分层重做主体验：

- 单栏主流程
- 抽屉 / Sheet 使用 `BaseSheet`
- 顶部栏使用 `BaseAppBar`
- 列表使用 `BaseList` / `BaseListItem`
- 头像使用圆角矩形 `Avatar`
- 原子输入控件可继续用 Varlet

---

## 6. 新增代码规则

新增移动端页面时遵循：

- 优先写语义清楚的 Vue 结构，不用 Varlet 容器搭页面。
- 页面级组件放 `views/`，工具内部业务组件放 `tools/{toolId}/components/`。
- 跨工具可复用的移动端骨架进 `components/base/`。
- 跨工具品牌/通用组件进 `components/common/`。
- Varlet 只在叶子节点使用；如果必须用作结构容器，代码注释或 PR 说明里写明这是临时兼容。
- 不新增裸 `Snackbar` / `Dialog` 业务调用。
- 不新增以 MD3 / Varlet 变量为主语的主题设计。

---

## 7. 当前债务清单

| 债务                                 | 处理方向               |
| ------------------------------------ | ---------------------- |
| Varlet 引用点较多                    | 渐进迁移，不一次性硬拆 |
| `Snackbar` / `Dialog` 散落           | 先封装再替换           |
| `var-popup` 承担编辑器骨架           | 迁入 `BaseSheet`       |
| `var-app-bar` 承担页面顶部栏         | 迁入 `BaseAppBar`      |
| `var-cell` 承担设置/列表信息架构     | 迁入 `BaseListItem`    |
| `var-bottom-navigation` 承担底部导航 | 迁入 `BaseBottomNav`   |
| 主题仍有 MD3/Varlet 主导痕迹         | 反转为 AIO token 主导  |

---

## 8. 决议记录

| 日期       | 决议项         | 结论                                               | 决议人 |
| ---------- | -------------- | -------------------------------------------------- | ------ |
| 2026-06-09 | Varlet 定位    | 降级为类似桌面端 Element Plus 的底层组件库         | 用户   |
| 2026-06-09 | 移动端整体实现 | 以 Vue 原生组件、项目 CSS token 和自研业务骨架为主 | 用户   |
| 2026-06-09 | 主题方向       | AIO Hub token 主导，Varlet 变量只是兼容输出        | 用户   |

---

## 9. 修订历史

| 版本 | 日期       | 变更                                                                                      |
| ---- | ---------- | ----------------------------------------------------------------------------------------- |
| v1   | 2026-05-31 | 初稿，误把"用户高定制态"当作产品默认形象                                                  |
| v2   | 2026-05-31 | 修正 DNA 为"高度可定制视觉系统 + 品牌一致性元素"                                          |
| v2.1 | 2026-05-31 | 删除错误的底部 V 形品牌锚点                                                               |
| v3   | 2026-05-31 | 提出组件抽象层路线，但把全量自研写得过早                                                  |
| v3.1 | 2026-05-31 | 改为先组件适配性调查，再决定下沉清单                                                      |
| v4   | 2026-06-09 | 根据实际体验直接决议：Varlet 降级为底层组件库，移动端回到 Vue 原生组件和 AIO 自有主题主导 |

