# 插件配置系统设计文档

## 1. 概述

### 1.1. 设计目标

为 AIO Hub 的插件系统提供一个统一、健壮、类型安全且对开发者友好的配置管理机制。

- **统一管理**: 为所有插件提供一致的配置存储和访问API。
- **数据安全与隔离**: 保证插件配置的独立性，避免交叉感染，并在升级时保留用户数据。
- **类型安全**: 利用 TypeScript 和 JSON Schema 提供编译时和运行时的类型校验。
- **UI 自动化**: 使主应用能根据配置清单自动生成设置界面，简化开发。
- **开发者友好**: 提供极简的 API (`get`/`set`)，让插件开发者无需关心底层实现。

### 1.2. 核心原则

- **清单驱动 (Manifest-Driven)**: 插件的所有配置需求都在 `manifest.json` 中明确声明，作为唯一的“事实来源”。
- **独立存储**: 每个插件的配置都存储在独立的 `config.json` 文件中，确保数据隔离。

## 2. 架构设计

### 2.1. 存储策略

插件配置将与插件包本身分离，存储在应用的数据目录中，以确保在插件更新或重装时配置数据不会丢失。

- **存储路径**: `{appDataDir}/plugins-config/{plugin-id}/config.json`
- `plugin-id` 来自插件 `manifest.json` 中的 `id` 字段。

**理由**:
- **数据持久化**: 插件包（位于 `appDataDir/plugins/`）可能会在更新时被完全替换，将配置分离可确保数据得以保留。
- **生命周期清晰**: 卸载插件时，可以安全地删除对应的 `plugins-config/{plugin-id}` 目录，彻底清理数据。

### 2.2. 核心组件

1.  **`manifest.json`**: 扩展 `PluginManifest`，增加 `settingsSchema` 字段。
2.  **`PluginConfigService`**: 一个新的全局服务，负责所有插件配置的生命周期管理，包括加载、保存、迁移和提供 API。
3.  **`ConfigManager`**: 复用现有的 `src/utils/configManager.ts`，为每个需要配置的插件实例化一个管理器。

## 3. `settingsSchema` 规范

这是本设计的核心。插件开发者通过在 `manifest.json` 中定义 `settingsSchema` 对象来声明其配置需求。

```json
// manifest.json
{
  "id": "my-translator-plugin",
  // ... 其他字段
  "settingsSchema": {
    "version": "1.1.0",
    "properties": {
      "apiKey": {
        "type": "string",
        "secret": true,
        "default": "",
        "label": "API Key",
        "description": "请输入您的翻译服务 API Key。"
      },
      "defaultLanguage": {
        "type": "string",
        "default": "en",
        "label": "默认目标语言",
        "description": "设置默认翻译的目标语言。",
        "enum": ["en", "zh", "jp", "fr"]
      },
      "enableCache": {
        "type": "boolean",
        "default": true,
        "label": "启用缓存",
        "description": "缓存翻译结果以提高性能和节省配额。"
      }
    }
  }
}
```

### 3.1. 字段详解

- **`version` (必填)**: `string`
  - 配置的语义化版本号 (SemVer)。
  - **关键**: 当 `properties` 结构发生变化时（增/删/改），开发者 **必须** 提升此版本号，以触发自动迁移逻辑。

- **`properties` (必填)**: `object`
  - 一个对象，其 `key` 是配置项的唯一标识符，`value` 是该配置项的定义。

- **配置项定义**:
  - `type`: `string` | `number` | `boolean`。
  - `default`: 该配置项的默认值，类型必须与 `type` 匹配。
  - `label`: `string`，用于在设置 UI 中显示的友好名称。
  - `description`: `string`，在 UI 中显示的详细说明或提示。
  - `secret` (可选): `boolean`，如果为 `true`，UI应将其渲染为密码输入框，且其值在日志中应被屏蔽。
  - `enum` (可选): `string[]`，提供一个可选值列表，UI应渲染为下拉选择框。

## 4. 配置迁移与升级

这是确保用户数据在插件升级后得以保留的关键机制。

### 4.1. 触发条件

当 `PluginConfigService` 加载插件时，会进行版本比较：
`savedConfigVersion` (来自 `config.json`) < `manifestSchemaVersion` (来自 `manifest.json`)

### 4.2. 迁移流程

如果需要迁移，系统将执行以下自动化合并：

1.  **加载新默认值**: 从新版 `manifest.json` 的 `settingsSchema` 中获取所有配置项的默认值 (`newDefaults`)。
2.  **加载旧配置**: 从用户的 `config.json` 文件中加载已保存的配置 (`savedConfig`)。
3.  **智能合并**: 计算最终配置：`finalConfig = { ...newDefaults, ...savedConfig }`。
    - **保留用户数据**: `savedConfig` 中存在的键值对会覆盖 `newDefaults`。
    - **添加新配置**: `newDefaults` 中新增的配置项会被自动加入。
    - **移除旧配置**: `savedConfig` 中存在但 `newDefaults` 中已不存在的配置项会被自动舍弃。
4.  **保存新配置**: 将 `finalConfig` 和新的版本号写回 `config.json` 文件。

## 5. API 设计

### 5.1. 插件内部 API

插件逻辑将通过注入的 `context` 对象与配置系统交互，完全无需关心底层存储。

```typescript
// my-translator-plugin/index.ts

// context 会在插件被调用时由 JsPluginAdapter 注入
export default {
  async translate({ text, context }) {
    // 安全地获取配置
    const apiKey = await context.settings.get('apiKey');
    const lang = await context.settings.get('defaultLanguage');

    if (!apiKey) {
      throw new Error('API Key 未配置！');
    }
    
    // ... 调用翻译服务

    // 如果需要，也可以更新配置
    await context.settings.set('enableCache', false);

    return '...';
  }
}
```

- **`context.settings.get(key: string): Promise<T>`**: 获取单个配置项的值。
- **`context.settings.getAll(): Promise<Record<string, T>>`**: 获取所有配置项。
- **`context.settings.set(key: string, value: T): Promise<void>`**: 更新单个配置项的值。保存操作会自动进行防抖处理。

### 5.2. 主应用内部 API (`PluginConfigService`)

- **`getResolvedConfig(pluginId: string): Promise<Store<T>>`**: 获取某个插件的响应式配置存储 (Pinia Store)，供设置 UI 使用。
- **`getValue(pluginId: string, key: string): Promise<T>`**: 获取指定插件的单个配置值。
- **`setValue(pluginId: string, key: string, value: T): Promise<void>`**: 设置指定插件的单个配置值。

## 6. 实施计划

1.  **[x] 设计与文档**: 完成本文档。
2.  **[ ] 更新类型定义**: 在 `src/services/plugin-types.ts` 中为 `PluginManifest` 添加 `settingsSchema` 定义。
3.  **[ ] 创建核心服务**: 创建 `src/services/plugin-config.registry.ts`，实现上述 API 和迁移逻辑。
4.  **[ ] 集成到插件生命周期**:
    - 修改 `plugin-loader.ts`，在加载时初始化插件配置。
    - 修改 `js-plugin-adapter.ts`，向 `context` 注入 `settings` API。