# Mobile Documentation

移动端文档按生命周期分层：

| 目录                               | 用途                                           |
| ---------------------------------- | ---------------------------------------------- |
| [`plan/`](./plan/)                 | 仍在施工、需要持续更新的计划与剩余平台门禁     |
| [`architecture/`](./architecture/) | 已实施并需要长期维护的架构、运行契约和验证边界 |
| [`archive/`](./archive/)           | 历史盘点、调研和被当前计划取代的材料           |

工具级实现以对应的 [`ARCHITECTURE.md`](../src/tools/) 为准；项目级 UI 规范以 [`docs/guide/mobile-ui-development.md`](../../docs/guide/mobile-ui-development.md) 和 [`docs/guide/mobile-design-language.md`](../../docs/guide/mobile-design-language.md) 为准。

## 当前文档

- [`architecture/mobile-android-avd-e2e.md`](./architecture/mobile-android-avd-e2e.md)：Android Studio AVD E2E 的设备所有权、selector、运行和产物契约。
- [`plan/mobile-sqlite-migration-plan.md`](./plan/mobile-sqlite-migration-plan.md)：SQLite 与聊天附件持久化的剩余 Android 真机/iOS 门禁。
- [`plan/mobile-asset-manager-design.md`](./plan/mobile-asset-manager-design.md)：资产管理器 Android MVP 收尾范围和剩余门禁。
- [`plan/mobile-agent-manager-plan.md`](./plan/mobile-agent-manager-plan.md)：Agent 私有资源、参数和聊天协作的剩余施工。
- [`plan/mobile-token-counting-plan.md`](./plan/mobile-token-counting-plan.md)：Token 计数已落地能力与真机性能/iOS 验证门禁。

