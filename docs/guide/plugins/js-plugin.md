# JavaScript 插件开发

本文档介绍如何开发 AIO Hub 的 JavaScript 插件（运行在前端渲染进程的轻量级插件）。

## 创建插件目录

在项目根目录的 `plugins/` 文件夹下创建你的插件目录：

```
plugins/
└── my-plugin/
    ├── manifest.json
    ├── index.ts
    └── README.md
```

## 编写 manifest.json

### 必填字段

对于 JS 插件，`type` 必须是 `"javascript"`，`main` 指向入口文件：

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "description": "一个演示新版插件架构的示例",
  "author": "你的名字",
  "icon": "🔧",
  "tags": ["工具", "示例"],
  "host": {
    "appVersion": ">=0.4.6",
    "apiVersion": 2
  },
  "type": "javascript",
  "main": "index.ts"
}
```

> 关于 `manifest.json` 的所有通用字段（icon、tags、host、contributions 等），请参阅 [插件开发总览](./index.md#manifest-通用字段)。

## 实现插件逻辑 (`index.ts`)

`index.ts` 是插件所有逻辑的唯一入口。你必须默认导出一个包含所有方法和生命周期钩子的对象。

### 模块导入规范

AIO Hub 建立了 ESM 模块共享机制。在插件中，你应该通过标准的 `import` 语句访问主应用提供的核心库，而无需将其打包进插件。

```typescript
// 导入 Vue 核心 API
import { ref, onMounted } from "vue";

// 导入 AIO Hub SDK (包含常用工具和 API 定义)
import { pluginManager, customMessage } from "aiohub-sdk";

// 导入类型定义 (仅用于编译时)
import type { PluginContext, ServiceMetadata } from "aiohub-sdk";
```

> **注意**: 在 `vite.config.ts` 中，你需要将这些模块配置为 `external`（详见 [插件 UI 开发](../plugin-ui-development-guide.md)）。

### 生命周期钩子

- **`activate(context: PluginContext)`**: (可选) 当插件被加载并启用时调用。这是插件初始化、注册监听器或处理器的理想位置。
- **`deactivate()`**: (可选) 当插件被禁用或卸载时调用。用于清理资源，例如注销监听器。

### 插件上下文 (PluginContext)

`activate` 钩子接收的 `context` 对象提供了与宿主应用交互的核心能力：

- **`context.settings`**: 插件配置 API（详见 [插件配置系统](./index.md#插件配置系统)）
  - `get(key)`: 获取配置项
  - `set(key, value)`: 保存配置项
  - `getAll()`: 获取所有配置
- **`context.storage`**: 插件专属文件存储 API。数据存储在 `plugins-data/{pluginId}` 中。
  - `readText(path)` / `writeText(path, data)`: 读写文本文件
  - `readBinary(path)` / `writeBinary(path, data)`: 读写二进制文件
  - `exists(path)`: 检查文件是否存在
  - `remove(path)`: 删除文件或目录
- **`context.environment`**: 宿主全局运行环境配置 API，只读访问用户在"运行环境"设置页中配置的外部依赖路径。
  - `get()`: 获取当前环境配置快照
  - `getPath("ffmpeg" | "ffprobe" | "git")`: 获取常用可执行文件路径
  - `getRuntimeCommand("javascript" | "python" | "shell" | "powershell")`: 获取脚本运行时命令
  - `getDocumentConverterPath("libreOffice" | "abiWord")`: 获取文档转换器路径

也可以从 `aiohub-sdk` 直接导入同一个只读服务：

```typescript
import { pluginEnvironmentService } from "aiohub-sdk";

const ffmpegPath = pluginEnvironmentService.getPath("ffmpeg");
const pythonCommand = pluginEnvironmentService.getRuntimeCommand("python");
```

### 暴露方法给 Agent (AI 调用)

为了让 Agent (内置 Chat) 能够发现并调用你的插件方法，你需要提供元数据声明。

**JS 插件推荐方式：在 `index.ts` 中导出 `getMetadata()`**

```typescript
import { ref } from "vue";
import type { PluginContext, ServiceMetadata } from "aiohub-sdk";

// 实际业务逻辑方法
async function addTimestamp(params: { text: string }): Promise<string> {
  return `[${new Date().toISOString()}] ${params.text}`;
}

// 暴露元数据给 Agent
function getMetadata(): ServiceMetadata {
  return {
    methods: [
      {
        name: "addTimestamp",
        displayName: "添加时间戳",
        description: "为输入的文本添加当前 ISO 格式的时间戳前缀",
        agentCallable: true,
        parameters: [
          {
            name: "text",
            type: "string",
            description: "目标文本",
            required: true,
          },
        ],
        returnType: "Promise<string>",
      },
    ],
  };
}

export default {
  activate: (context: PluginContext) => {
    console.log("插件已激活");
  },
  getMetadata,
  addTimestamp,
};
```

**Native/Sidecar 插件方式**: 由于没有 TS 代码可供扫描，必须在 `manifest.json` 中声明 `methods`，详见 [原生插件开发](./native-plugin.md#方法声明)。

#### 核心原则

1. **写一遍不写第二遍**：对于 JS 插件，尽量使用 `getMetadata()` 导出，逻辑和声明在同一个文件里。
2. **Facade 可选**：如果导出方法参数本身就是扁平对象，可以直接导出，无需额外封装。
3. **Agent 友好**：确保 `description` 清晰，`agentCallable` 为 `true`。

## 特定模块插件开发

AIO Hub 的不同模块（如 LLM Chat）提供了特定的扩展能力。

- **LLM Chat 插件**: 想要扩展聊天功能（如 Context Pipeline、聊天设置等），请参考 [LLM Chat 插件开发指南](../llm-chat-plugin-guide.md)。

## 完整示例

一个最小可用的 JS 插件完整代码：

```typescript
// plugins/hello-world/index.ts
import { ref } from "vue";
import type { PluginContext, ServiceMetadata } from "aiohub-sdk";

async function greet(params: { name: string }): Promise<string> {
  return `你好，${params.name}！来自 AIO Hub 插件`;
}

function getMetadata(): ServiceMetadata {
  return {
    methods: [
      {
        name: "greet",
        displayName: "问候",
        description: "向指定名称发送问候语",
        agentCallable: true,
        parameters: [
          { name: "name", type: "string", description: "姓名", required: true },
        ],
        returnType: "Promise<string>",
      },
    ],
  };
}

export default {
  activate(context: PluginContext) {
    console.log("hello-world 插件已激活");
  },
  deactivate() {
    console.log("hello-world 插件已停用");
  },
  getMetadata,
  greet,
};
```

## 下一步

- 想开发带 UI 的插件？请参阅 [插件 UI 开发](../plugin-ui-development-guide.md)
- 想了解更深度的扩展能力（钩子、Patch、DOM 注入）？请参阅 [钩子与扩展系统](./hooks-and-extensions.md)
- 想处理耗时任务并展示进度？请参阅 [异步任务与进度汇报](./async-tasks.md)
