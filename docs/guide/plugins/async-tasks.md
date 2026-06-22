# 异步任务与进度汇报

对于可能需要较长时间执行的操作（如文件上传、数据处理、网络请求等），插件可以利用 AIO Hub 的异步任务系统来提供更好的用户体验。

## 异步任务的优势

- **非阻塞执行**: 不会阻塞 UI 线程，用户可以继续使用应用
- **进度反馈**: 实时向用户展示任务进度
- **可取消**: 用户可以随时取消正在执行的任务
- **任务管理**: 统一的任务列表和状态查询

## 声明异步方法

在 `getMetadata()` 中，通过 `executionMode` 和 `asyncConfig` 标记方法为异步：

```typescript
export function getMetadata(): ServiceMetadata {
  return {
    methods: [
      {
        name: "processLargeFile",
        displayName: "处理大文件",
        description: "处理大型文件，支持进度汇报和取消",
        agentCallable: true,
        executionMode: "async", // 标记为异步方法
        asyncConfig: {
          hasProgress: true, // 支持进度汇报
          cancellable: true, // 支持取消
          estimatedDuration: 30000, // 预估耗时 30 秒（毫秒）
        },
        parameters: [
          {
            name: "filePath",
            type: "string",
            description: "文件路径",
            required: true,
          },
          {
            name: "options",
            type: "object",
            description: "处理选项",
            required: false,
          },
        ],
        returnType: "Promise<ProcessResult>",
      },
    ],
  };
}
```

## 实现异步方法

异步方法会通过方法的第二个参数 `context` (类型为 `ToolContext`) 接收任务上下文，包含以下能力：

```typescript
export interface ToolContext {
  reportStatus: (message: string, progress?: number) => void; // 汇报状态与进度 (0-100)
  signal?: AbortSignal; // 标准的 AbortSignal 对象，用于取消监听
  isAsync: boolean; // 是否处于异步任务模式
  taskId?: string; // 任务 ID（仅异步模式）
}
```

**完整示例**：

```typescript
async function processLargeFile(
  args: { filePath: string; options?: any },
  context?: ToolContext
) {
  // 如果没有上下文，说明是普通同步调用
  const isAsync = context?.isAsync ?? false;

  try {
    // 步骤 1: 读取文件
    context?.reportStatus("正在读取文件...", 0);
    const fileContent = await readFile(args.filePath);

    // 检查是否被取消
    if (context?.signal?.aborted) throw new Error("AbortError");

    // 步骤 2: 解析数据
    context?.reportStatus("正在解析数据...", 30);
    const parsedData = await parseData(fileContent);

    if (context?.signal?.aborted) throw new Error("AbortError");

    // 步骤 3: 处理数据（模拟耗时操作）
    context?.reportStatus("正在处理数据...", 50);
    for (let i = 0; i < 100; i++) {
      // 定期检查取消状态
      if (i % 10 === 0) {
        if (context?.signal?.aborted) throw new Error("AbortError");
        context?.reportStatus(`处理进度: ${i}%`, 50 + i / 2);
      }
      await processChunk(parsedData[i]);
    }

    // 步骤 4: 保存结果
    context?.reportStatus("正在保存结果...", 95);
    const result = await saveResult(parsedData);

    context?.reportStatus("处理完成", 100);
    return result;
  } catch (error) {
    // AbortError 会被系统自动处理，无需特殊处理
    if (error.name === "AbortError") {
      throw error;
    }
    // 其他错误正常抛出
    throw new Error(`处理失败: ${error.message}`);
  }
}
```

## 最佳实践

1. **合理的进度粒度**: 不要过于频繁地汇报进度（建议间隔至少 100ms），避免性能开销
2. **有意义的进度消息**: 提供清晰的状态描述，让用户了解当前在做什么
3. **定期检查取消**: 在循环或长时间操作中定期检查 `signal?.aborted`
4. **优雅降级**: 支持无异步上下文时的直接调用（用于测试或内部调用）
5. **准确的预估时间**: `estimatedDuration` 应尽量接近实际耗时，帮助用户判断是否等待

## 注意事项

- `executionMode: "async"` 的方法会返回任务 ID 而非实际结果，调用方需要通过任务管理器查询结果
- 抛出 `AbortError` 后，系统会自动捕获并标记任务为已取消
- 进度值范围为 0-100，超出范围会被自动限制
- 异步任务系统会自动记录日志和错误，插件无需额外处理

## 相关链接

- 想了解 JS 插件的基础结构？请参阅 [JavaScript 插件开发](./js-plugin.md)
- 想了解通用的元数据声明？请参阅 [JavaScript 插件开发 - 暴露方法给 Agent](./js-plugin.md#暴露方法给-agent-ai-调用)
