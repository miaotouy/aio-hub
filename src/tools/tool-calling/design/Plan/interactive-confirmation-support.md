# 工具调用：交互式确认与异步反馈支持方案

## 1. 背景

在某些场景下（如 Canvas 画布修改），工具调用不应直接产生物理副作用，而是先进入“预览/待定”状态。用户在 UI 上预览效果后，决定“确认”还是“拒绝”。

目前的 `tool-calling` 引擎在 `onBeforeExecute` 阶段仅支持同步/简单的异步拦截，缺乏与工具实例的深度闭环反馈。

## 2. 核心设计

### 2.1 工具实例扩展 (ToolRegistry Extension)

为了支持“拒绝”后的清理工作，`ToolRegistry` 接口（或具体的工具实现类）应支持可选的清理钩子：

```typescript
// src/services/types.ts (概念性修改)
export interface ToolRegistry {
  // ... 现有成员
  /**
   * 当用户在 UI 上明确拒绝某个工具调用请求时触发
   * 用于清理内存缓冲区、撤销临时状态等
   */
  onToolCallDiscarded?: (requestId: string, methodName: string, args: Record<string, any>) => void | Promise<void>;
}
```

### 2.2 执行器增强 (Executor Enhancement)

`src/tools/tool-calling/core/executor.ts` 需要处理以下逻辑：

1.  **挂起执行**：在 `onBeforeExecute` 期间，执行器处于等待状态。
2.  **拒绝处理**：如果 `onBeforeExecute` 返回 `rejected`：
    - **通知工具**：执行器查找对应的工具实例，如果存在 `onToolCallDiscarded` 方法，则调用它。
    - **反馈 LLM**：返回 `status: "denied"`，结果内容为“用户已拒绝此更改”。

### 2.3 UI 交互流 (Auto-Preview Flow)

1.  **LLM 发出请求**：`update_file(path, content)`。
2.  **静默分发与自动预览**：执行器在进入 `onBeforeExecute` 挂起状态前，允许工具实例先接收到“预览数据”。Canvas 模块收到数据后更新内存缓冲区，Canvas 窗口**自动刷新**展示效果。
3.  **UI 挂起状态**：聊天界面展示工具卡片，显示“待定更改”状态，并提供“确认/拒绝”按钮。用户无需点击，只需侧头看一眼 Canvas 窗口即可看到结果。
4.  **用户操作**：
    - **确认 (Commit)**：`onBeforeExecute` 解析为 `approved`，执行器正式触发工具的持久化逻辑。
    - **拒绝 (Discard)**：`onBeforeExecute` 解析为 `rejected`，执行器调用工具的 `onToolCallDiscarded`（清理内存），并向 LLM 返回“用户已拒绝此更改”。

## 3. 实施步骤

1.  **协议层增强**：确保 `ToolApprovalResult` 能够承载更多上下文信息。
2.  **执行器逻辑重构**：在 `executeSingleRequest` 中添加对 `onToolCallDiscarded` 的调用逻辑。
3.  **Canvas 适配**：在 `CanvasRegistry` 中实现 `onToolCallDiscarded`。

## 4. 优势

- **安全性**：敏感操作（如文件修改、删除）有了真正的“后悔药”。
- **闭环感**：LLM 能够感知到用户的“拒绝”动作，并尝试生成更符合要求的代码，而不是在错误的基础上继续堆砌。
