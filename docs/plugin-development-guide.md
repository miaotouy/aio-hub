# AIO Hub 插件开发指南

本文档介绍如何为 AIO Hub 开发插件。

## 插件系统概述

AIO Hub 的插件系统基于现有的服务架构，支持两种类型的插件：

- **JavaScript 插件**: 轻量级的前端插件，适用于文本处理、UI交互等场景
- **Sidecar 插件**: 独立的后端进程插件，适用于计算密集型、需要原生依赖的场景（待实现）

## 开发 JavaScript 插件

### 1. 创建插件目录

在项目根目录的 `plugins/` 文件夹下创建你的插件目录：

```
plugins/
└── my-plugin/
    ├── manifest.json
    ├── index.ts
    └── README.md
```

### 2. 编写 manifest.json

插件清单定义了插件的元数据和接口：

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "description": "插件描述",
  "author": "你的名字",
  "host": {
    "appVersion": ">=2.0.0"
  },
  "type": "javascript",
  "main": "index.js",
  "methods": [
    {
      "name": "myMethod",
      "description": "方法描述",
      "parameters": [
        {
          "name": "input",
          "type": "string",
          "required": true,
          "description": "参数描述"
        }
      ],
      "returnType": "Promise<string>"
    }
  ]
}
```

### 3. 实现插件逻辑

在 `index.ts` 中实现插件的具体功能：

```typescript
interface MyMethodParams {
  input: string;
}

async function myMethod({ input }: MyMethodParams): Promise<string> {
  // 实现你的逻辑
  return `处理结果: ${input}`;
}

// 导出插件接口
export default {
  myMethod,
};
```

### 4. 调用插件

插件会自动注册到服务注册表，可以通过统一的执行器调用：

```typescript
import { execute } from '@/services/executor';

const result = await execute({
  service: 'my-plugin',
  method: 'myMethod',
  params: { input: 'hello' }
});

if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

## 开发模式

### 自动加载

在开发模式下（`npm run dev`），插件会自动从 `plugins/` 目录加载：

- 支持 TypeScript 热重载（HMR）
- 修改代码后立即生效
- 无需编译和打包

### 调试

1. 插件的日志会输出到浏览器控制台
2. 使用 `logger` 模块记录日志：

```typescript
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('plugins/my-plugin');

async function myMethod({ input }: MyMethodParams): Promise<string> {
  logger.info('处理输入', { input });
  // ...
  return result;
}
```

## 最佳实践

### 1. 类型安全

为插件参数和返回值定义 TypeScript 接口：

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

### 2. 错误处理

使用 try-catch 处理异常：

```typescript
async function myMethod({ input }: MyMethodParams): Promise<string> {
  try {
    // 可能出错的代码
    return processInput(input);
  } catch (error) {
    logger.error('处理失败', error);
    throw new Error(`处理失败: ${error.message}`);
  }
}
```

### 3. 异步操作

所有插件方法应该是异步的：

```typescript
async function fetchData({ url }: FetchParams): Promise<Data> {
  const response = await fetch(url);
  return await response.json();
}
```

## 生产环境

### 编译插件

生产环境下需要将 TypeScript 编译为 JavaScript：

```bash
# 在插件目录下
tsc index.ts --outFile index.js
```

### 打包插件

创建 `.zip` 包用于分发：

```
my-plugin.zip
├── manifest.json
├── index.js
└── README.md
```

## 插件市场（未来功能）

- 将插件发布到官方市场
- 按平台智能分发
- 一键安装和更新

## 示例插件

参考 `plugins/example-text-processor/` 查看完整的示例插件实现。

## 注意事项

1. **插件 ID 必须唯一**: 避免与其他插件冲突
2. **遵循语义化版本**: 使用 semver 格式（如 `1.0.0`）
3. **完整的文档**: 提供 README.md 说明插件用途和使用方法
4. **类型定义**: 在 manifest.json 中准确定义方法签名
5. **向后兼容**: 升级时保持 API 兼容性

## 技术细节

### 插件加载流程

1. 应用启动时，`autoRegisterServices` 会调用插件加载器
2. 插件加载器扫描 `plugins/` 目录
3. 读取每个插件的 `manifest.json`
4. 动态导入插件模块
5. 创建插件代理对象
6. 注册到服务注册表

### 服务架构集成

插件通过 `PluginProxy` 适配器实现了 `ToolService` 接口，因此：

- 可以通过 `serviceRegistry.getService()` 获取
- 可以通过 `execute()` 执行
- 与内置服务使用相同的调用方式

## 后续开发

- [ ] Sidecar 插件支持
- [ ] 插件权限系统
- [ ] 插件市场 UI
- [ ] 插件生命周期钩子
- [ ] 插件间通信机制