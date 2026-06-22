# 插件开发指南

本系列文档介绍如何为 AIO Hub 开发插件。

## 插件系统概述

AIO Hub 的插件系统基于现有的服务架构，支持三种类型的插件：

- **JavaScript 插件**: 轻量级的前端插件，运行在前端渲染进程，适用于文本处理、UI 交互、与宿主应用深度集成等场景。
- **原生插件 (Native Plugin)**: 高性能的后端插件，通过动态链接库 (DLL/SO/Dylib) 加载到主进程，实现与应用生命周期绑定的长期运行服务。
- **Sidecar 插件**: 独立的后端进程插件，语言无关，适用于计算密集型、需要隔离环境或使用 AIO Hub 未内置语言的场景。

## 文档导航

| 文档                                              | 内容                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| [JavaScript 插件开发](./js-plugin.md)             | JS 插件完整开发流程：目录结构、manifest、生命周期、Agent 暴露方法 |
| [原生插件开发](./native-plugin.md)                | Native 插件：ABI 契约、Rust 示例、内存管理、热重载                |
| [Sidecar 插件开发](./sidecar-plugin.md)           | Sidecar 插件：通信协议、持久型模式、Broker 中转                   |
| [钩子与扩展系统](./hooks-and-extensions.md)       | L1-L4 四层扩展能力：结构化钩子、UI 插槽、Service Patch、自由注入  |
| [异步任务与进度汇报](./async-tasks.md)            | 耗时操作的异步执行、进度反馈与取消支持                            |
| [插件 UI 开发](../plugin-ui-development-guide.md) | Vue 组件集成、Vite 构建配置、UI 插槽                              |
| [LLM Chat 插件开发](../llm-chat-plugin-guide.md)  | 聊天模块扩展：Context Pipeline、设置面板                          |

## Manifest 通用字段

所有类型的插件都需要一个 `manifest.json` 清单文件。以下是通用必填和可选字段。

### 必填字段

- **id**: 插件的唯一标识符（建议使用小写字母、数字和连字符）
- **name**: 插件的显示名称
- **version**: 插件版本（遵循语义化版本规范，如 `1.0.0`）
- **description**: 插件的简短描述
- **author**: 插件作者
- **host**: 主机要求
  - **appVersion**: AIO Hub 的最低版本要求（semver 格式）
  - **apiVersion**: (可选) 插件所依赖的插件系统 API 版本 (整数)。这是一个独立的版本号，仅在插件系统发生不兼容更新时才会增加。**推荐所有新插件填写此字段**，以确保兼容性。如果未提供，将跳过 API 版本检查。
  - **platforms**: (可选) 支持的系统平台列表。如果不提供，默认支持所有平台。可选值：`win32-x64`、`win32-arm64`、`darwin-x64`、`darwin-arm64`、`linux-x64`、`linux-arm64`。
- **type**: 插件类型：`javascript`、`native`、`sidecar`

### 可选字段

- **icon**: 插件图标
  - 单个 emoji 字符（如 `"🔧"`）
  - 相对于插件根目录的图片路径（如 `"icon.png"`）
  - 或 `appdata://` 协议的路径
- **tags**: 标签数组，用于插件的分类和搜索（如 `["工具", "文本处理"]`）
- **settingsSchema**: 插件配置项的定义（详见下文 [插件配置系统](#插件配置系统)）
- **dependencies**: 插件依赖的其他插件及其版本范围（如 `{"chat-core": ">=1.0.0"}`）
- **optionalDependencies**: 可选依赖的插件（如 `{"theme-manager": "*"}`）
- **incompatibleWith**: 冲突的插件 ID 数组（如 `["old-chat-plugin"]`）
- **ui**: UI 组件配置（详见 [插件 UI 开发](../plugin-ui-development-guide.md)）
- **contributions**: 插件向宿主应用声明的扩展能力数组
- **permissions**: 权限声明（未来功能）

### contributions 示例：注册 Smart OCR 引擎

`contributions` 是通用字段，不绑定某个具体模块。Smart OCR 只会消费其中 `type` 为 `ocr-engine` 的条目：

```json
{
  "contributions": [
    {
      "type": "ocr-engine",
      "id": "paddle-ocr",
      "name": "Paddle OCR",
      "description": "通过插件 sidecar 提供本地 OCR 识别",
      "method": "recognizeBatch",
      "modelProfiles": [{ "id": "ppocr-v5-mobile", "name": "PP-OCRv5 Mobile" }],
      "defaultModelProfile": "ppocr-v5-mobile"
    }
  ]
}
```

## 调用插件

所有插件的方法都会被自动发现并注册到服务注册表，可以通过统一的 `execute` 执行器调用：

```typescript
import { execute } from "@/services/executor";

const result = await execute({
  service: "my-plugin", // 插件的 id
  method: "addTimestamp", // 插件导出的方法名
  params: { text: "hello from executor" },
});

if (result.success) {
  console.log(result.data); // "[2025-12-13T...] hello from executor"
} else {
  console.error(result.error);
}
```

## 插件配置系统

AIO Hub 提供了统一、健壮且类型安全的配置管理机制。插件的所有配置需求都在 `manifest.json` 中明确声明，作为唯一的"事实来源"。

### 声明配置 Schema (`settingsSchema`)

```json
{
  "id": "my-translator-plugin",
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

#### 字段详解

- **`version` (必填)**: 配置的语义化版本号。当 `properties` 结构变化时必须提升此版本号，以触发自动迁移。
- **`properties` (必填)**: 配置项定义的键值对对象。
  - `type`: 可选值：`string`、`number`、`boolean`。
  - `default`: 默认值，类型必须与 `type` 一致。
  - `label`: 在设置 UI 中显示的友好名称。
  - `description`: UI 中显示的详细说明。
  - `secret` (可选): 若为 `true`，UI 渲染为密码输入框，值在日志中屏蔽。
  - `enum` (可选): 提供可选值列表，UI 自动渲染为下拉选择框。

### 配置存储与隔离

- **存储路径**: `{appDataDir}/plugins-config/{plugin-id}/config.json`
- **卸载清理**: 卸载插件时自动删除对应配置目录。

### 配置自动迁移

当检测到已保存配置版本低于 manifest 中的版本时，自动执行智能合并：

1. **保留用户数据**: 用户已修改的配置项值会被保留。
2. **添加新配置**: 新增的配置项及其默认值会被自动加入。
3. **移除旧配置**: 新版 Schema 中已不存在的旧配置项会被舍弃。

### 插件内部 API

通过 `PluginContext` 对象的 `settings` 属性与配置系统交互：

```typescript
// 获取配置
const apiKey = await context.settings.get("apiKey");

// 获取所有配置
const allSettings = await context.settings.getAll();

// 更新配置（自动防抖保存）
await context.settings.set("enableCache", false);
```

## 开发模式

### 自动加载与热重载 (HMR)

在开发模式下（`bun run tauri dev`），插件会自动从 `plugins/` 目录加载：

- **JavaScript 插件**: Vite 开发服务器自动处理，提供热重载。
  - **原生 TypeScript 支持**: 开发时可直接用 `.ts` 编写，Bun 原生支持。
  - **UI 组件热重载**: 推荐使用 `.vue` 单文件组件，共享 HMR 流程。
- **原生/Sidecar 插件**: 修改 `manifest.json` 会触发重载。`reloadable: true` 的原生插件无需重启。

### 调试

- **JavaScript 插件**: 日志输出到浏览器控制台。
- **原生/Sidecar 插件**: 日志输出到 AIO Hub 后端控制台。
- 推荐使用 `aiohub-sdk` 提供的 `logger`：

```typescript
import { createModuleLogger } from "aiohub-sdk";

const logger = createModuleLogger("plugins/my-plugin");
logger.info("处理输入", { input });
```

## 生产环境

### 编译与打包

- **JavaScript 插件**: 生产环境需将 TypeScript 编译为 JavaScript (ESM 格式)，推荐 Vite 库模式。
- **原生/Sidecar 插件**: 需提供预编译好的二进制文件。

所有插件最终打包为 `.zip` 文件分发：

```
my-plugin.zip
├── manifest.json
├── index.js      (编译后的插件逻辑)
├── MyUI.js       (编译后的 UI 组件)
├── style.css     (可选)
├── icon.svg      (可选)
└── README.md
```

## 示例插件仓库

| 插件               | 仓库                                                                                       | 描述                |
| ------------------ | ------------------------------------------------------------------------------------------ | ------------------- |
| 纯逻辑 JS          | [example-text-processor](https://github.com/miaotouy/aiohub-plugin-example-text-processor) | 基础 JS 插件，无 UI |
| 带 UI 的 JS        | [example-hello-world](https://github.com/miaotouy/aiohub-plugin-example-hello-world)       | Vue UI 集成示例     |
| Sidecar (Rust+Vue) | [example-file-hasher](https://github.com/miaotouy/aiohub-plugin-example-file-hasher)       | Rust 后端 + Vue UI  |
| Native (Rust)      | [native-example](https://github.com/miaotouy/aiohub-plugin-example-native)                 | 高性能原生插件      |

## 最佳实践

### 类型安全

```typescript
interface ProcessOptions {
  text: string;
  caseSensitive?: boolean;
}

async function process(options: ProcessOptions): Promise<string> {
  const { text, caseSensitive = false } = options;
  // ...
}
```

### 错误处理

```typescript
async function myMethod({ input }: MyMethodParams): Promise<string> {
  try {
    return processInput(input);
  } catch (error) {
    logger.error("处理失败", error);
    throw new Error(`处理失败: ${error.message}`);
  }
}
```

### 异步操作

所有插件方法都应该是异步的 (`async`)，返回 `Promise`。

## 注意事项

1. **插件 ID 必须唯一**: 避免与其他插件冲突。
2. **遵循语义化版本**: 使用 semver 格式（如 `1.0.0`）。
3. **完整的文档**: 提供 README.md 说明插件用途和使用方法。
4. **向后兼容**: 升级时保持 API 兼容性。

## 技术细节

### 插件加载流程

1. 应用启动时，`autoRegisterServices` 调用插件加载器。
2. 扫描 `plugins/` 目录。
3. 读取每个插件的 `manifest.json`。
4. 根据类型 (`javascript`, `native`, `sidecar`) 创建对应适配器。
5. 对于 JS 插件，动态导入默认导出对象。
6. 调用 `activate` 钩子并注入 `PluginContext`。
7. 创建插件代理对象，暴露所有导出方法。
8. 注册到服务注册表。

### 服务架构集成

插件通过 `PluginProxy` 适配器实现了 `ToolService` 接口：

- 可以通过 `serviceRegistry.getService()` 获取
- 可以通过 `execute()` 执行
- 与内置服务使用相同的调用方式

## 后续开发

- [ ] 插件权限系统
- [ ] 插件市场 UI
- [x] 插件生命周期钩子
- [ ] 插件间通信机制
