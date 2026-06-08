# 移动端主题自定义系统分段落地计划

## 状态概览

- 当前阶段：阶段 1 已完成，准备进入阶段 2。
- 自动检查：阶段 1 完成后运行 `cd mobile ; bun run check:frontend`。
- 人工验证：移动端真实运行态由模拟器统一验证；本计划不使用普通浏览器替代 Tauri mobile。

## 首版范围

- 建立 AIO 语义 token 底座，让移动端主题模型先服务 AIO 自身。
- 将 Varlet 作为原子组件库适配层，而不是主题模型本体。
- 覆盖主题色、明暗模式、字体缩放、透明度、模糊、边框、圆角、常用层级变量。
- 解耦核心弹层和表单设置数据流，避免直接依赖 Varlet 的事件与内部结构。
- 不做壁纸、壁纸取色、壁纸轮播、拼贴和移动端文件权限规划。

## 阶段计划

### 阶段 1：文档计划

- 状态：已完成。
- 提交：`mobile: document theme customization plan`
- 内容：
  - 创建 `docs/Plan/mobile-theme-customization.md`。
  - 记录首版范围、分阶段实现方式、检查方式和人工验证边界。

### 阶段 2：外观设置与主题 token

- 状态：待完成。
- 提交：`mobile: add appearance theme tokens`
- 内容：
  - 扩展 `mobile/src/types/settings.ts` 的 `AppearanceSettings` 与默认值。
  - 新增移动端主题 token 生成模块。
  - 输出 AIO 语义变量、RGB 变量、Varlet 适配变量。
  - 保留旧配置兼容，依靠现有 `defaultsDeep` 补齐新增字段。

### 阶段 3：主题应用集中化

- 状态：待完成。
- 提交：`mobile: centralize theme application`
- 内容：
  - 重构 `mobile/src/stores/theme.ts`。
  - 集中处理明暗模式、系统主题监听、根 CSS 变量注入、`StyleProvider` 调用。
  - 将 `App.vue` 中字体缩放同步迁入主题系统。
  - 保持 `isDark`、`themeVars`、`initTheme`、`toggleTheme` 对外兼容。

### 阶段 4：Varlet 原子组件适配

- 状态：待完成。
- 提交：`mobile: adapt varlet atoms to aio theme`
- 内容：
  - 调整 `mobile/src/assets/styles/theme.css`。
  - 建立 AIO token 基础层和 Varlet 覆盖层。
  - 覆盖常用原子组件：popup、dialog、paper、cell、input、select、button、bottom-navigation。
  - 新增通用 class：`aio-sheet`、`aio-dialog-panel`、`aio-field`、`aio-action-button`。

### 阶段 5：外观设置 UI 解耦

- 状态：待完成。
- 提交：`mobile: decouple appearance settings ui`
- 内容：
  - 新增外观设置 draft composable。
  - 重构 `Settings.vue` 外观区，不再直接深层 `v-model` store。
  - 重构 `ThemeColorSettings.vue`，通过 props/action 或 composable 操作主题色。
  - 确保 popup 取消、关闭、切换不会产生半提交状态。

### 阶段 6：最终状态更新

- 状态：待完成。
- 提交：`mobile: update theme plan status`
- 内容：
  - 更新本文档的最终完成状态。
  - 列出模拟器人工测试清单。

## 自动检查

- 每阶段运行：`cd mobile ; bun run check:frontend`
- 涉及 Rust/Tauri 配置时运行：`cd mobile ; bun run check:backend`
- 不启动普通浏览器验证真实 Tauri mobile 运行态。

## 待人工验证清单

- light/dark/auto 切换。
- 主题色切换。
- 字体缩放。
- 透明度、模糊、边框、圆角。
- 弹层、输入框、底部导航视觉一致性。
- 旧配置升级。
