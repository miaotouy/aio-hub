# 移动端 UI 开发指南

本文是移动端新增和修改 UI 的当前规范。历史调查、迁移理由与决议记录见 [`mobile-design-language-investigation.md`](../../mobile/docs/plan/mobile-design-language-investigation.md)。

## 1. 分层原则

AIO Hub Mobile 是 Tauri v2、Vue 3 和 TypeScript 应用。页面结构与视觉语言由项目自身控制，Varlet 的角色类似桌面端的 Element Plus，只提供可替换的底层控件。

```text
AIO Hub token
  -> 原生 Vue 页面和工具业务组件
  -> mobile/src/components/base 与 common
  -> Varlet 原子组件适配
```

主题和组件依赖不得反向由 Varlet 或 Material Design 3 决定。

## 2. 页面与组件

- 页面、导航容器、列表信息架构、弹层骨架、聊天输入区和设置分组优先使用语义明确的原生 Vue 结构与项目 CSS。
- 工具内部组件放在 `mobile/src/tools/{toolId}/components/`；只有出现真实跨工具复用时才沉淀到 `mobile/src/components/base/` 或 `common/`。
- Varlet 可用于按钮、输入、选择器、开关、加载态等叶子控件。
- 新页面不要直接用 `var-app-bar`、`var-cell`、`var-card`、`var-paper`、`var-popup` 或 `var-bottom-navigation` 搭建主结构。
- 维护旧页面时按实际痛点渐进替换，不要求为了形式统一一次性重写可用组件。

## 3. 主题与反馈

- 颜色、边框、圆角、间距、阴影、字体和模糊效果以移动端 AIO Hub token 为准。
- Varlet CSS 变量只能由项目 token 派生，用于适配保留的原子控件。
- 业务提示与确认通过 `mobile/src/utils/feedback.ts` 导出的 `customMessage` 和 `customDialog`；不要在业务代码中直接调用 Varlet `Snackbar` 或 `Dialog`。
- 新增界面需要同时检查明暗主题、安全区、键盘避让、触控目标、长文本和窄屏布局。

## 4. 新增工具检查

1. 使用 `{toolId}.registry.ts` 注册工具、路由和语言包。
2. 页面级组件放在工具的 `views/`，业务组件放在 `components/`。
3. 优先复用现有主题 token、反馈封装和移动端通用组件。
4. 对核心逻辑补充 Vitest；Tauri API 使用 mock 只能验证调用契约，不能代替真机或真实 WebView。
5. 完成类型检查和移动端 Vite 构建后，再按功能范围决定是否需要 Android/iOS 真机验收。
