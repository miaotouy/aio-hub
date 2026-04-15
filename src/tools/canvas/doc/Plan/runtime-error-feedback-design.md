# Canvas 运行时错误反馈机制设计

**状态**: Draft  
**创建时间**: 2026-04-15  
**作者**: 咕咕 (Kilo 版)  
**关联 issue**: 画布预览错误无法反馈给 Agent

---

## 1. 背景与目标

### 1.1 当前问题

目前 Canvas 工具在 Agent 修改代码后，无法自动获知代码在预览环境中的运行状态。如果 Agent 生成的代码存在 JavaScript 运行时错误，这些错误信息只会静默地出现在浏览器的控制台中，Agent 完全无法感知。

这导致：

- Agent 无法形成 **Edit → Preview → Error → Fix** 的自动化闭环
- 用户需要手动查看控制台并告知 Agent 错误所在
- 降低了 Agent 自主修复代码的能力

### 1.2 设计目标

借鉴 VSCode 插件的诊断信息（diagnostics）自动包含机制，将 Canvas 预览的运行时错误作为 **Agent 上下文的一部分自动注入**。

核心原则：

1. **自动化**: Agent 无需主动调用"查询错误"工具，错误信息会在下一轮对话中自动出现
2. **持续性**: 错误信息会持续存在于上下文中，直到被解决或清除
3. **优先级控制**: 可配置最大错误数量，避免过多错误信息污染上下文
4. **时序解耦**: 错误捕获与工具调用解耦，通过上下文注入实现异步反馈

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     Canvas Preview Window                        │
│  ┌─────────────┐                                                │
│  │   iframe    │  ← 注入错误捕获脚本                             │
│  │  (预览内容)  │                                                │
│  └──────┬──────┘                                                │
│         │ postMessage { type: 'canvas-runtime-error', ... }     │
│         ▼                                                       │
│  ┌─────────────┐                                                │
│  │ CanvasWindow │  ← 监听 postMessage                           │
│  └──────┬──────┘                                                │
│         │ canvasStore.addRuntimeError(...)                       │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        canvasStore.ts                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  runtimeErrors: RuntimeError[]                          │    │
│  │  - addRuntimeError(error)                               │    │
│  │  - clearRuntimeErrors(canvasId)                         │    │
│  │  - markErrorsAsStale(canvasId)                          │    │
│  │  - getActiveRuntimeErrors(canvasId)                     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
          │
          │ getExtraPromptContext()
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     canvas.registry.ts                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Runtime Errors in Preview (3):                         │    │
│  │  1. [ERROR] Uncaught ReferenceError: foo is not defined │    │
│  │     at app.js:15:3                                      │    │
│  │  2. [ERROR] ...                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│         │                                                        │
│         ▼ 注入到 Agent 上下文                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Agent Prompt                          │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心设计

### 3.1 错误捕获层 (Capture Layer)

**文件**: `src/tools/canvas/composables/useCanvasPreview.ts`

在注入到 iframe 的脚本中，增强错误捕获逻辑：

```typescript
const errorCaptureScript = `
  <script>
    (function() {
      // 1. 全局错误捕获
      window.addEventListener('error', function(event) {
        const errorData = {
          type: 'canvas-runtime-error',
          level: 'error',
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
          timestamp: Date.now()
        };
        window.parent.postMessage(errorData, '*');
      });

      // 2. 未处理的 Promise Rejection
      window.addEventListener('unhandledrejection', function(event) {
        const reason = event.reason;
        const errorData = {
          type: 'canvas-runtime-error',
          level: 'error',
          message: reason?.message || String(reason),
          stack: reason?.stack || 'No stack trace available',
          timestamp: Date.now()
        };
        window.parent.postMessage(errorData, '*');
      });

      // 3. 控制台错误 (可选，避免重复)
      const originalError = console.error;
      console.error = function(...args) {
        originalError.apply(console, args);
        window.parent.postMessage({
          type: 'canvas-console-error',
          level: 'error',
          args: args.map(arg => {
            try { return typeof arg === 'object' ? JSON.stringify(arg) : String(arg); }
            catch(e) { return '[Unserializable]'; }
          }),
          timestamp: Date.now()
        }, '*');
      };
    })();
  </script>
`;
```

### 3.2 状态管理层 (State Layer)

**文件**: `src/tools/canvas/stores/canvasStore.ts`

#### 3.2.1 数据结构

```typescript
interface RuntimeError {
  id: string; // 唯一标识
  canvasId: string; // 所属画布 ID
  message: string; // 错误消息
  filename?: string; // 出错文件名
  lineno?: number; // 行号
  colno?: number; // 列号
  stack?: string; // 堆栈信息
  timestamp: number; // 发生时间戳
  stale: boolean; // 是否过期（文件已修改但预览未刷新）
}
```

#### 3.2.2 新增状态

```typescript
// 运行时错误列表
const runtimeErrors = ref<RuntimeError[]>([]);

// 配置选项
const maxRuntimeErrors = ref(10); // 最大错误数量
const autoIncludeErrors = ref(true); // 是否自动包含到上下文
```

#### 3.2.3 新增方法

```typescript
/**
 * 添加运行时错误
 */
function addRuntimeError(error: Omit<RuntimeError, "id" | "stale">) {
  const newError: RuntimeError = {
    ...error,
    id: Math.random().toString(36).slice(2),
    stale: false,
  };

  // 检查是否已存在相同错误（避免重复）
  const exists = runtimeErrors.value.some(
    (e) => e.message === newError.message && e.filename === newError.filename && e.lineno === newError.lineno,
  );

  if (!exists) {
    runtimeErrors.value.push(newError);

    // 超出限制时，移除最旧的错误
    if (runtimeErrors.value.length > maxRuntimeErrors.value) {
      runtimeErrors.value.shift();
    }
  }
}

/**
 * 清空指定画布的错误
 */
function clearRuntimeErrors(canvasId: string) {
  runtimeErrors.value = runtimeErrors.value.filter((e) => e.canvasId !== canvasId);
}

/**
 * 标记指定画布的错误为过期（文件修改后调用）
 */
function markErrorsAsStale(canvasId: string) {
  runtimeErrors.value.forEach((e) => {
    if (e.canvasId === canvasId) {
      e.stale = true;
    }
  });
}

/**
 * 获取指定画布的活跃错误（未过期）
 */
function getActiveRuntimeErrors(canvasId: string): RuntimeError[] {
  return runtimeErrors.value.filter((e) => e.canvasId === canvasId && !e.stale);
}

/**
 * 获取格式化后的错误信息（用于上下文注入）
 */
function getFormattedErrorContext(canvasId: string, limit = 10): string {
  const errors = getActiveRuntimeErrors(canvasId);

  if (errors.length === 0) {
    return "";
  }

  let context = `\n\n⚠️ Runtime Errors in Preview (${errors.length}):\n`;

  errors.slice(0, limit).forEach((err, idx) => {
    context += `${idx + 1}. [${err.level.toUpperCase()}] ${err.message}\n`;
    if (err.filename) {
      context += `   at ${err.filename}:${err.lineno}:${err.colno}\n`;
    }
    if (err.stack) {
      context += `   Stack: ${err.stack.split("\n").slice(0, 2).join("\n   ")}\n`;
    }
    context += `   Time: ${new Date(err.timestamp).toLocaleString()}\n\n`;
  });

  if (errors.length > limit) {
    context += `... and ${errors.length - limit} more errors.\n`;
  }

  context += `(Note: These errors occurred in the live preview. Please fix them before proceeding.)\n`;

  return context;
}
```

### 3.3 上下文注入层 (Context Injection Layer) ⭐核心

**文件**: `src/tools/canvas/canvas.registry.ts`

修改 `CanvasRegistry.getExtraPromptContext()` 方法：

```typescript
async getExtraPromptContext(): Promise<string> {
  const canvasStore = useCanvasStore();
  const canvasId = canvasStore.activeCanvasId;

  if (!canvasId) {
    return '';
  }

  // 1. 获取基础上下文（文件树、变更信息等）
  let baseContext = await this.buildBaseContext(canvasId);

  // 2. 注入运行时错误信息
  if (canvasStore.autoIncludeErrors.value) {
    const errorContext = canvasStore.getFormattedErrorContext(
      canvasId,
      canvasStore.maxRuntimeErrors.value
    );
    baseContext += errorContext;
  }

  return baseContext;
}
```

### 3.4 生命周期管理 (Lifecycle Management)

#### 3.4.1 文件修改时

在 `canvasStore.writeFilePhysical` 和 `canvasStore.applyDiff` 中：

```typescript
async function writeFilePhysical(canvasId: string, filepath: string, content: string) {
  await storage.writePhysicalFile(canvasId, filepath, content);
  emitFileChanged(canvasId, filepath);

  // 标记错误为过期（等待预览刷新后清除）
  markErrorsAsStale(canvasId);

  await refreshGitStatus(canvasId);
}
```

#### 3.4.2 预览刷新时

在 `useCanvasPreview.refreshPreview` 的 `onLoad` 回调中：

```typescript
const onLoad = () => {
  loading.value = false;
  // 预览加载完成后，清除过期错误
  canvasStore.clearStaleRuntimeErrors(canvasId.value);
};
```

#### 3.4.3 手动清除工具（可选）

在 `canvas.registry.ts` 中新增：

```typescript
async clear_runtime_errors(args: { canvasId?: string }): Promise<string> {
  const canvasStore = useCanvasStore();
  const canvasId = args.canvasId || canvasStore.activeCanvasId;
  if (!canvasId) return "No active canvas.";

  canvasStore.clearRuntimeErrors(canvasId);
  return "Runtime errors cleared.";
}
```

### 3.5 跨窗口同步 (Cross-Window Sync)

**文件**: `src/tools/canvas/components/window/CanvasWindow.vue`

```typescript
const handleMessage = (event: MessageEvent) => {
  if (event.data?.type === "canvas-runtime-error") {
    const errorData = event.data;
    canvasStore.addRuntimeError({
      canvasId: activeCanvasId.value,
      ...errorData,
    });
  }

  // 原有的 console-message 处理保持不变
  if (event.data?.type === "canvas-console") {
    emit("console-message", event.data);
  }
};
```

---

## 4. 配置选项

在 `canvas.registry.ts` 的 `settingsSchema` 中新增：

```typescript
public readonly settingsSchema: SettingItem[] = [
  // ... 现有的画布绑定 ID 配置 ...

  {
    id: "canvas-max-runtime-errors",
    label: "最大运行时错误数",
    component: "ElInputNumber",
    modelPath: "maxRuntimeErrors",
    hint: "上下文中包含的最大错误数量（值越大消耗 token 越多）",
    keywords: "画布 错误 限制 runtime errors",
    defaultValue: 10,
    props: { min: 0, max: 50, step: 1 }
  },
  {
    id: "canvas-auto-include-errors",
    label: "自动包含运行时错误",
    component: "ElSwitch",
    modelPath: "autoIncludeErrors",
    hint: "启用后，预览中的运行时错误将自动包含在 Agent 上下文中",
    keywords: "画布 错误 上下文 runtime errors context",
    defaultValue: true
  }
];
```

---

## 5. UI 层同步（可选增强）

### 5.1 状态栏错误指示器

**文件**: `src/tools/canvas/components/window/CanvasStatusBar.vue`

在状态栏右侧添加错误计数器：

```vue
<template>
  <div class="canvas-status-bar">
    <!-- 左侧：当前文件 -->
    <div class="status-left">...</div>

    <!-- 中间：文件数量 -->
    <div class="status-center">...</div>

    <!-- 右侧：未提交更改 + 运行时错误 -->
    <div class="status-right">
      <div v-if="pendingCount > 0" class="pending-badge">...</div>

      <!-- 新增：运行时错误计数器 -->
      <el-popover v-if="errorCount > 0" placement="top-end" :width="400" trigger="click">
        <template #reference>
          <div class="error-badge">
            <AlertCircle :size="12" />
            <span>{{ errorCount }}</span>
          </div>
        </template>

        <!-- 错误详情列表 -->
        <div class="error-details">
          <div v-for="err in errors" :key="err.id" class="error-item">
            <div class="error-msg">{{ err.message }}</div>
            <div class="error-location">{{ err.filename }}:{{ err.lineno }}</div>
            <div class="error-time">{{ formatTime(err.timestamp) }}</div>
          </div>
        </div>
      </el-popover>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AlertCircle } from "lucide-vue-next";
import { useCanvasStore } from "../../stores/canvasStore";

const props = defineProps<{
  /* ... */
}>();
const canvasStore = useCanvasStore();
const errorCount = computed(() => canvasStore.getActiveRuntimeErrors(canvasId).length);
const errors = computed(() => canvasStore.getActiveRuntimeErrors(canvasId));
</script>
```

---

## 6. 完整工作流示例

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Agent 修改代码                                           │
├─────────────────────────────────────────────────────────────────┤
│ Agent: apply_canvas_diff({                                       │
│   path: "app.js",                                                │
│   diff: "<<<<<<< SEARCH\\nfunction foo() {...}\\n======="        │
│ })                                                               │
│                                                                  │
│ → 返回："Successfully applied diff to app.js"                    │
│ → 副作用：markErrorsAsStale(canvasId)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: 预览自动刷新，捕获错误                                    │
├─────────────────────────────────────────────────────────────────┤
│ CanvasWindow: 监听 postMessage                                   │
│   → 收到：{ type: 'canvas-runtime-error',                        │
│            message: 'foo is not defined',                        │
│            lineno: 15, ... }                                     │
│                                                                  │
│ canvasStore.addRuntimeError(...)                                 │
│   → runtimeErrors 数组更新                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Agent 下一轮对话，自动看到错误                            │
├─────────────────────────────────────────────────────────────────┤
│ System Prompt (getExtraPromptContext 返回):                      │
│                                                                  │
│ Canvas Project: My Project                                       │
│ Project Files:                                                   │
│ - index.html                                                     │
│ - app.js (modified)                                              │
│                                                                  │
│ ⚠️ Runtime Errors in Preview (1):                                │
│ 1. [ERROR] Uncaught ReferenceError: foo is not defined           │
│    at app.js:15:3                                                │
│    Time: 2026-04-15 17:20:15                                     │
│                                                                  │
│ (Note: These errors occurred in the live preview...)             │
│                                                                  │
│ Agent: "我注意到代码中存在一个错误，让我修复它..."                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. 待办事项

### 7.1 核心实现

- [ ] `canvasStore.ts`: 添加 `runtimeErrors` 状态和相关方法
- [ ] `useCanvasPreview.ts`: 增强错误捕获脚本
- [ ] `CanvasWindow.vue`: 监听 `canvas-runtime-error` 消息
- [ ] `canvas.registry.ts`: 修改 `getExtraPromptContext()` 注入错误信息

### 7.2 配置支持

- [ ] `canvas.registry.ts`: 添加配置选项到 `settingsSchema`
- [ ] `canvasStore.ts`: 读取配置并应用到错误管理逻辑

### 7.3 UI 增强（可选）

- [ ] `CanvasStatusBar.vue`: 添加错误计数器和 Popover
- [ ] `canvas.registry.ts`: 添加 `clear_runtime_errors` 工具方法

### 7.4 测试验证

- [ ] 手动测试：创建一个有 JS 错误的 HTML 文件，观察错误是否出现在 Agent 上下文中
- [ ] 自动化测试：模拟 Agent 修改代码 → 产生错误 → 修复错误的完整流程

---

## 8. 参考设计

- VSCode Roo 插件：诊断信息自动包含机制
- `HtmlInteractiveViewer.vue`: iframe 错误捕获与日志同步
- `window-sync-architecture.md`: 跨窗口通信机制

---

## 9. 修订历史

| 日期       | 版本         | 修改内容     | 作者 |
| ---------- | ------------ | ------------ | ---- |
| 2026-04-15 | v0.1 (Draft) | 初始设计草案 | 咕咕 |
