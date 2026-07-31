# Mobile Workspace Instructions

本文件是 `mobile/` 子树的局部指引。仓库级约束仍以根目录 [`AGENTS.md`](../AGENTS.md) 为准；本文件只补充移动端特有的文档入口、验证边界和实现约定。

## 文档入口

- 当前 UI 规范：[`docs/guide/mobile-ui-development.md`](../docs/guide/mobile-ui-development.md)
- 设计语言决议：[`docs/guide/mobile-design-language.md`](../docs/guide/mobile-design-language.md)
- 模块架构：`mobile/src/tools/{toolId}/ARCHITECTURE.md`
- 仍在施工的跨模块计划：`mobile/docs/plan/`
- 已完成或稳定的移动端架构：`mobile/docs/architecture/`
- 历史调查与盘点：`mobile/docs/archive/`

## 移动端约束

- 包管理器使用 Bun；前端改动至少运行 `bun run build`，需要时再运行 `bun run test:run`、后端检查和真实 Tauri/Android 验收。
- 普通浏览器只能验证明确提供 mock 或 fallback 的纯前端行为，不能代替 Tauri WebView、IPC、原生文件选择器、Android/iOS 或平台服务验证。
- 工具使用 `{toolId}.registry.ts` 注册；页面放在工具 `views/`，业务组件放在 `components/`，跨工具复用才沉淀到 `mobile/src/components/`。
- UI 页面骨架优先使用原生 Vue 与 AIO Hub token；Varlet 只作为可替换的叶子控件。反馈使用 `mobile/src/utils/feedback.ts`。
- Rust 返回前端的结构体使用 `#[serde(rename_all = "camelCase")]`，新增 Tauri command 必须注册到 `mobile/src-tauri/src/lib.rs`。
- 全局资产与 Agent 私有资产分离；聊天只保存 `assetId +` 轻量快照，不把路径或系统 URI 写入业务数据。

## 文档维护

施工完成后，将稳定的边界、数据流、已验证行为和剩余平台门禁同步到对应模块的 `ARCHITECTURE.md` 或 `mobile/docs/architecture/`；`mobile/docs/plan/` 只保留仍有明确待办或平台验收门禁的计划。

