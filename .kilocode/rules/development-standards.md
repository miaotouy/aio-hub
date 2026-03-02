# 核心开发规范

本文档详细说明项目的核心开发规范，包括错误处理、日志系统和 UI 组件使用规范。

## 1. 错误处理

项目采用统一的全局错误处理机制，定义于 `src/utils/errorHandler.ts`。其核心设计是**模块化**和**自动日志记录**。

### 1.1. 核心规范：必须使用模块化处理器

- 所有模块（如 `services`, `composables`, `stores`）都**必须**使用 `createModuleErrorHandler(moduleName)` 创建独立的错误处理器。这能确保错误来源清晰可追溯。
- **禁止**直接导入和使用全局的 `errorHandler` 单例。
- **示例**:
  ```typescript
  // a/b/c.ts
  import { createModuleErrorHandler } from "@/utils/errorHandler";
  const errorHandler = createModuleErrorHandler("a/b/c");
  ```

### 1.2. 使用模式一：自动包装 (推荐)

- 使用 `wrapAsync` 和 `wrapSync` 函数可以极大地简化 `try...catch` 样板代码。
- **重要**: 包装函数在捕获到错误后会返回 `null`。**调用方必须处理 `null` 返回值**，以避免后续逻辑出错。
- **示例**:

  ```typescript
  const result = await errorHandler.wrapAsync(async () => someApiCall(), {
    userMessage: "获取数据失败，请重试",
  });

  if (result === null) {
    // 错误已被自动处理（提示用户 + 记录日志），此处执行回退逻辑
    return;
  }
  // ...继续处理 result
  ```

### 1.3. 使用模式二：手动处理（快捷方法）

- 在 `try...catch` 块中，使用模块处理器的快捷方法 `.error()`, `.warn()` 等。
- **重要**: `errorHandler` **会自动调用日志系统**。因此，**严禁**在 `catch` 块中同时调用 `logger.error()` 和 `errorHandler.error()`，这会导致日志重复记录。
- **快捷方法签名**: `errorHandler.error(error, userMessage?, context?)`
  - 第二个参数为可选的用户提示消息
  - 第三个参数为可选的结构化上下文数据（用于日志调试）
- **示例**:

  ```typescript
  try {
    // ...
  } catch (error) {
    // 正确：只调用 errorHandler，它会负责提示用户和记录日志
    errorHandler.error(error, "操作失败", { attachedData: 123 });

    // 错误：重复记录
    // logger.error('操作失败', error); // 不要这样做！
  }
  ```

### 1.4. 使用模式三：手动处理（handle 方法，高级选项）

- 当需要更精细的控制时（如静默处理），使用 `.handle()` 方法。
- **示例**:

  ```typescript
  try {
    // ...
  } catch (error) {
    // 静默处理：只记录日志，不向用户显示提示
    errorHandler.handle(error, {
      userMessage: "渲染失败",
      showToUser: false,
      context: { diagramType: "mermaid" },
    });
  }
  ```

### 1.5. 关键选项（仅 `handle` 方法支持）

- `showToUser: false`: 静默处理错误，只记录日志而不向用户显示任何提示。适用于后台或非关键操作。
- `userMessage: '...'`: 自定义向用户显示的消息，覆盖默认生成的友好提示。
- `context: { ... }`: 附加的结构化数据，会一并记录到日志中，用于调试。
- `level: ErrorLevel.WARNING`: 指定错误级别（INFO/WARNING/ERROR/CRITICAL）。
- **特殊规则**: `AbortError` (通常由用户取消操作触发) 会被系统自动降级为 `INFO` 级别并且静默处理，业务代码中**无需**进行额外捕获和处理。

## 2. 日志系统

项目使用统一的日志系统，定义于 `src/utils/logger.ts`，支持结构化、分级和持久化。

### 2.1. 核心规范：必须使用模块化日志

- 所有模块都**必须**使用 `createModuleLogger(moduleName)` 创建独立的日志记录器。
- **示例**:
  ```typescript
  // a/b/c.ts
  import { createModuleLogger } from "@/utils/logger";
  const logger = createModuleLogger("a/b/c");
  ```

### 2.2. 日志记录规范

- **结构化日志**: 所有日志方法 (`.info`, `.warn` 等) 的第二个参数用于传递结构化的 `data` 对象。**禁止**将数据通过字符串拼接的方式记录在消息中。
- **错误日志**: `.error()` 方法的第二个参数应始终传递原始的 `Error` 对象，以保留完整的堆栈信息用于调试。
- **控制台折叠**: 对于包含大量数据的日志，可以传递第三个参数 `collapsed: true`，使其在开发者控制台中默认折叠，保持日志主干清晰。
- **示例**:

  ```typescript
  // 推荐做法
  logger.info("用户配置已加载", { userId: "abc", theme: "dark" });
  logger.error("API 请求失败", error, { url: "/api/data" });
  logger.debug(
    "组件状态更新",
    {
      newState: {
        /* ... */
      },
    },
    true
  ); // 折叠显示

  // 不推荐的做法
  logger.info(`用户 ${userId} 的配置已加载，主题是 ${theme}`);
  logger.error(`API 请求失败: ${error.message}`);
  ```

- **日志输出**: 日志会同时输出到开发者控制台和本地日志文件 (`appDataDir/logs/app-YYYY-MM-DD.log`)。

## 3. Element Plus 使用规范

### 3.1. Dropdown 与 Tooltip 组合使用

当需要在 `el-dropdown` 的触发器上添加 `el-tooltip` 时，**必须**使用一个包裹层（如 `div`）来包裹 `el-tooltip`，而不是直接将 `el-tooltip` 作为 `el-dropdown` 的直接子元素。

**错误示例**:

```vue
<el-dropdown trigger="click">
  <el-tooltip content="提示文字">
    <el-button>按钮</el-button>
  </el-tooltip>
  <template #dropdown>
    <!-- ... -->
  </template>
</el-dropdown>
```

**正确示例**:

```vue
<el-dropdown trigger="click">
  <div>
    <el-tooltip content="提示文字">
      <el-button>按钮</el-button>
    </el-tooltip>
  </div>
  <template #dropdown>
    <!-- ... -->
  </template>
</el-dropdown>
```

**原因**: Element Plus 的 `el-dropdown` 组件会尝试直接操作其第一个子元素来绑定事件和引用，如果直接使用 `el-tooltip` 会导致事件绑定失败或触发异常。添加包裹层可以确保 `el-dropdown` 正确识别触发器元素。
