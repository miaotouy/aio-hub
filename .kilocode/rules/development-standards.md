# 核心开发规范

本文档详细说明项目的核心开发规范，包括命令使用、错误处理、日志系统和 UI 组件使用规范。

## 0. 命令使用规范

为了确保在受限终端环境下的执行效率，所有开发任务必须遵循以下命令准则：

- **优先预设**: 必须优先使用 `package.json` 中定义的预设脚本（如 `check`, `check:frontend`, `check:backend`）。
- **拒绝造轮子**: 严禁 AI 自行发明或拼接复杂的检查/修复命令。
- **效率优先**: 预设命令已进入环境白名单，可直接执行；自定义命令会卡在“待批准”状态，浪费开发时间。

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
    true,
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

### 3.2. MessageBox (弹窗) 滚动锁定处理

在 Tauri 环境下，Element Plus 默认的滚动锁定机制（`lockScroll: true`）会导致应用布局抖动并产生意外的全局滚动条。

**核心规范**: 所有 `ElMessageBox` 的调用（包括 `confirm`, `alert`, `prompt`）都**必须**显式设置 `lockScroll: false`。

**示例**:

```typescript
import { ElMessageBox } from "element-plus";

// 正确做法
await ElMessageBox.confirm("确定要执行此操作吗？", "提示", {
  confirmButtonText: "确定",
  cancelButtonText: "取消",
  type: "warning",
  lockScroll: false, // 必须设置
});

// 错误做法：未设置 lockScroll，会导致 Tauri 窗口出现滚动条
await ElMessageBox.confirm("...");
```

## 4. Tauri 与前后端通信规范

### 4.1. 字段命名对齐

- **核心规范**: 在 Rust 后端定义的结构体，如果通过 Tauri Command 返回给前端，**必须**添加 `#[serde(rename_all = "camelCase")]` 属性。
- **原因**: Rust 习惯使用 `snake_case`，而 TypeScript/JavaScript 习惯使用 `camelCase`。如果不进行重命名，前端接收到的对象属性名将与 TS 类型定义不匹配，导致数据读取失败。
- **示例**:
  ```rust
  #[derive(Debug, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")] // 必须添加
  pub struct WellKnownPath {
      pub name: String,
      pub default_path: Option<String>, // 前端将收到 defaultPath
  }
  ```

### 4.2. Data URL 转换禁令 (CSP 合规)

- **核心规范**: **严禁**使用 `fetch()` 请求 `data:` 协议的 URL（如 `fetch(dataUrl)`）。Tauri 的 CSP `connect-src` 指令不包含 `data:` 协议，此类调用会被直接拦截并抛出 `TypeError: Failed to fetch`。
- **适用场景**: Canvas `toDataURL()` 的返回值、任何 `data:image/...;base64,...` 格式的字符串。
- **正确做法**: 使用纯 JavaScript 将 base64 data URL 解码为 `Uint8Array` / `ArrayBuffer`：

  ```typescript
  // ✅ 正确：纯 JS 解码，不触发网络请求
  const base64Data = dataUrl.split(",")[1];
  const binaryStr = atob(base64Data);
  const buffer = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    buffer[i] = binaryStr.charCodeAt(i);
  }

  // ❌ 错误：fetch data URL 会被 CSP 拦截
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const buffer = await blob.arrayBuffer();
  ```

- **原因**: 虽然在普通浏览器环境中 `fetch(dataUrl)` 是合法的快捷写法，但 Tauri 应用的 CSP 策略严格限制了 `connect-src`，`data:` 不在白名单中。这是一个**反复出现**的问题，必须从源头杜绝。

## 5. UI 交互与入口规范

### 5.1. 应用入口逻辑

- **主页 (HomePage)**: 应用的唯一工具分发中心。所有未打开的工具必须通过主页启动。
- **侧边栏 (Sidebar)**: 运行时标签页管理。侧边栏仅显示当前**已打开**的工具。
- **交互逻辑**:
- 从主页点击工具卡片 -> 调用 `toolsStore.openTool` -> 侧边栏出现标签 -> 自动导航到工具页面。
- 严禁将侧边栏描述为静态导航栏。

### 5.2. 窗口状态管理

- **内嵌模式**: 工具作为主窗口的一个标签页存在。
- **分离模式 (Detached)**: 工具被拖拽为独立的悬浮窗口。
- **主页反馈**: 已分离的工具在主页卡片上会显示“已分离”徽章。点击已分离工具的卡片应触发“聚焦窗口”操作，而非重复导航。

### 5.3. 标题栏 (TitleBar) 功能区

标题栏不仅是窗口控制工具，还是全局功能中心，包含：

- **左侧**: 应用 Logo 和名字，窄屏时会隐藏。
- **左/中侧**: 动态标题，显示当前工具名及图标。
- **右侧**:
- **用户档案**: 全局 Avatar 切换。
- **主题切换**: 动态应用外观。
- **下载/通知**: 全局状态提示。
- **设置入口**: 快速进入设置中心页面。
