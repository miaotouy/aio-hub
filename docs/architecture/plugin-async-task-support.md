# 插件异步任务支持架构

## 概述

本文档描述了 AIO Hub 插件系统如何支持耗时任务的异步执行、进度汇报和取消功能。

## 架构设计

### 核心组件

1. **TaskManager** (`src/tools/tool-calling/core/async-task/task-manager.ts`)
   - 管理异步任务的生命周期
   - 提供任务提交、查询、取消接口

2. **TaskExecutor** (`src/tools/tool-calling/core/async-task/task-executor.ts`)
   - 执行异步任务
   - 注入 `AsyncTaskContext` 到方法参数中

3. **JsPluginAdapter** (`src/services/js-plugin-adapter.ts`)
   - JS 插件的适配器
   - 负责透传 `ToolContext` 参数（作为方法的第二个参数）

### 数据流

```
Agent/UI 调用
    ↓
Executor 检测 executionMode === "async"
    ↓
TaskManager.submitTask()
    ↓
TaskExecutor.execute()
    ↓
构造统一的 ToolContext
    ↓
JsPluginAdapter.callPluginMethod(methodName, params, toolContext)
    ↓
注入 context (settings) 到 params
    ↓
插件方法执行：method(params, toolContext)
    ↓
使用 toolContext.reportStatus() 汇报进度
    ↓
检查 toolContext.signal.aborted 取消状态
    ↓
返回结果或抛出错误
```

## 关键实现细节

### 1. 参数注入机制

`JsPluginAdapter.callPluginMethod` 实现了双重上下文注入：

```typescript
// 创建插件上下文，注入配置 API
const pluginContext = {
  settings: pluginConfigService.createPluginSettingsAPI(this.manifest.id),
};

// 第一个参数：业务参数（注入 context 配置访问）
const finalParams = {
  ...(params || {}),
  context: pluginContext,
};

// 第二个参数：ToolContext（由 Executor 或 TaskExecutor 提供）
return method(finalParams, toolContext);
```

**设计要点**：
- `ToolContext` 作为第二个参数注入，用于任务控制和状态汇报
- `context.settings` 由 `JsPluginAdapter` 注入，用于访问插件配置
- 两者互不干扰，插件方法可以同时使用

### 2. 元数据声明

插件通过 `getMetadata()` 声明方法的异步特性：

```typescript
{
  name: "methodName",
  executionMode: "async",  // 标记为异步方法
  asyncConfig: {
    hasProgress: true,      // 支持进度汇报
    cancellable: true,      // 支持取消
    estimatedDuration: 5000, // 预估耗时（毫秒）
  },
  // ...
}
```

### 3. 插件方法实现

```typescript
async function myAsyncMethod(
  params: { input: string },
  context?: ToolContext
) {
  // context 包含 reportStatus, signal, isAsync, taskId
  
  if (context?.isAsync) {
    // 异步模式：使用进度汇报
    context.reportStatus("开始处理...", 0);
    // ... 执行业务逻辑
    if (context.signal?.aborted) throw new Error("AbortError");
    context.reportStatus("完成", 100);
  }
  
  // 直接模式：无进度汇报（兼容性）
  return await doWork(params.input);
}
```

## 优势

1. **非侵入式设计**
   - 插件方法可以选择性支持异步模式
   - 不支持异步的方法仍可正常工作

2. **类型安全**
   - `__asyncContext` 通过参数传递，保持类型推导
   - 插件可以明确声明是否需要异步上下文

3. **统一的用户体验**
   - 所有异步任务在统一的任务管理器中展示
   - 一致的进度汇报和取消交互

4. **灵活的执行模式**
   - 同一方法可以同时支持同步和异步调用
   - 根据调用方式自动适配

## 未来扩展

- [ ] 支持任务优先级
- [ ] 支持任务依赖关系
- [ ] 支持任务结果缓存
- [ ] 支持任务重试机制