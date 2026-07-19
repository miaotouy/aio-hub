# 配置管理指南

本文说明桌面端和移动端 `ConfigManager` 的适用边界。配置 API 的具体签名以 `src/utils/configManager.ts` 与 `mobile/src/utils/configManager.ts` 为准。

## 1. 何时使用

以下数据优先使用 `createConfigManager`：

- 开关、字号、API Key、筛选条件等扁平设置。
- 规模可控的对象或简单列表。
- 需要默认值合并、版本字段和防抖保存的工具配置。

以下场景不应把完整数据塞进 ConfigManager：

- 需要索引、分页、事务或全文检索的数据。
- 多文件关联、内容寻址资产、二进制内容或大文件分片。
- 高频追加且不能每次重写整个对象的日志、会话和任务记录。

这些场景应使用领域数据库、独立文件存储或已有 repository/service。

## 2. 基本用法

```typescript
import { createConfigManager } from "@/utils/configManager";

interface MyToolConfig {
  version: string;
  enabled: boolean;
  fontSize: number;
}

export const configManager = createConfigManager<MyToolConfig>({
  moduleName: "my-tool",
  version: "1.0.0",
  createDefault: () => ({
    version: "1.0.0",
    enabled: true,
    fontSize: 14,
  }),
});
```

- 初始化时调用 `load()`，并处理它返回的完整配置。
- 明确的低频操作可以调用 `save()` 或 `update()`。
- 文本实时输入、滑块、拖拽尺寸等高频变化调用 `saveDebounced()`；默认延迟为 500ms。
- 不要再额外实现一套定时器、默认值补齐和配置路径管理。

## 3. 默认值与迁移

桌面端默认使用浅合并，移动端默认使用深层默认值合并。跨端共享配置或存在嵌套结构时，应提供显式 `mergeConfig(defaultConfig, loadedConfig)`，避免两端产生不同结果。

配置结构变化时：

1. 更新 `version` 和 `createDefault()`。
2. 在 `mergeConfig` 中处理字段重命名、删除和类型变化。
3. 保留未知字段还是清理旧字段，应根据导入兼容性明确决定，不能依赖对象展开的偶然行为。
4. 为旧版本、缺失字段和损坏配置补充测试。

## 4. 错误与测试

- ConfigManager 内部已经使用模块级 logger 和 error handler；调用方只处理业务失败结果，不要对同一个异常重复记录。
- 桌面端在非 Tauri 环境会降级到进程内存储，适合 Vitest 和 Bun 脚本测试。
- 移动端基于 `@tauri-apps/plugin-store`，纯前端测试需要按测试环境 mock 插件调用。
- `saveDebounced()` 是异步触发，不能把它当成需要立即持久化完成的事务边界。
