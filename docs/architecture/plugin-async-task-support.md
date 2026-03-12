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
   - 负责透传 `__asyncContext` 参数

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
注入 __asyncContext 到参数
    ↓
JsPluginAdapter.callPluginMethod()
    ↓
透传 __asyncContext + 注入 context (settings)
    ↓
插件方法执行
    ↓
使用 __asyncContext.reportProgress() 汇报进度
    ↓
使用 __asyncContext.checkCancellation() 检查取消
    ↓
返回结果或抛出错误
```

## 关键实现细节

### 1. 参数注入机制

`JsPluginAdapter.callPluginMethod` 实现了双重上下文注入：

```typescript
// 提取异步任务上下文（如果存在）
const { __asyncContext, ...restParams } = params || {};

// 创建插件上下文，注入配置 API
const context = {
  settings: pluginConfigService.createPluginSettingsAPI(this.manifest.id),
};

// 合并参数：保留 __asyncContext（用于异步任务），同时注入 context（用于配置访问）
const finalParams = {
  ...restParams,
  context,
  ...(__asyncContext && { __asyncContext }),
};

return method(finalParams);
```

**设计要点**：
- `__asyncContext` 由 `TaskExecutor` 注入，用于异步任务控制
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
async function myAsyncMethod(params: {
  // 业务参数
  input: string;
  // 异步任务上下文（可选）
  __asyncContext?: any;
}) {
  const context = params.__asyncContext;
  
  if (context) {
    // 异步模式：使用进度汇报
    context.reportProgress(0, "开始处理...");
    // ... 执行业务逻辑
    context.checkCancellation(); // 检查取消
    context.reportProgress(100, "完成");
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