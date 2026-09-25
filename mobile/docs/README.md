# Mobile Documentation

移动端文档按生命周期分层：

| 目录                               | 用途                                           |
| ---------------------------------- | ---------------------------------------------- |
| [`plan/`](./plan/)                 | 当前功能施工、后置平台验证和剩余产品队列       |
| [`architecture/`](./architecture/) | 已实施并需要长期维护的架构、运行契约和验证边界 |
| [`archive/`](./archive/)           | 历史盘点、调研和被当前计划取代的材料           |

工具级实现以对应的 [`ARCHITECTURE.md`](../src/tools/) 为准；项目级 UI 规范以 [`docs/guide/mobile-ui-development.md`](../../docs/guide/mobile-ui-development.md) 和 [`docs/guide/mobile-design-language.md`](../../docs/guide/mobile-design-language.md) 为准。

## 当前文档

- [`plan/mobile-development-checklist.md`](./plan/mobile-development-checklist.md)：狂奔施工模式下的功能队列、后置验证、依赖和延后队列；不替代模块计划。
- [`plan/mobile-media-components-plan.md`](./plan/mobile-media-components-plan.md)：移动端媒体组件边界、正式聊天接入顺序和后置设备验证。
- [`architecture/mobile-android-avd-e2e.md`](./architecture/mobile-android-avd-e2e.md)：Android Studio AVD E2E 的设备所有权、selector、运行和产物契约。
- [`plan/mobile-sqlite-migration-plan.md`](./plan/mobile-sqlite-migration-plan.md)：SQLite、聊天附件持久化和后置平台验证。
- [`plan/mobile-asset-manager-design.md`](./plan/mobile-asset-manager-design.md)：资产管理器和聊天附件的功能施工范围与后置平台验证。
- [`plan/mobile-agent-manager-plan.md`](./plan/mobile-agent-manager-plan.md)：Agent 私有资源、参数和聊天协作的剩余施工。
- [`plan/mobile-token-counting-plan.md`](./plan/mobile-token-counting-plan.md)：Token 计数已落地能力、上下文预算编排和真机性能/iOS 验证后续验证。
- [`../src/tools/rich-text-renderer/docs/Plan/rich-text-renderer-migration-plan.md`](../src/tools/rich-text-renderer/docs/Plan/rich-text-renderer-migration-plan.md)：RichTextRenderer 初版和正式聊天接入；PC 能力按需求与性能数据后置。
