# Sidecar Plugin API v3 不兼容迁移计划

> 状态：主体实施完成，待真实 Tauri E2E  
> 创建日期：2026-07-24  
> 首个迁移插件：`paddle-ocr` 0.8.0

## 1. 背景

当前 Sidecar Plugin API v2 将短命令调用、长任务、业务进度和进程恢复混在同一套请求模型中：

- `sidecar_send_command` 持有请求直到插件返回最终结果，长 OCR 任务受固定 300 秒超时约束。
- OCR 配置同时持久化 `pluginId`、`contributionId`、`method` 和 `name`，同一事实存在多个来源。
- `contributionId` 不存在时会回退到同名 `method`，插件升级后可能静默选择错误贡献点。
- stdout 读取任务按 `pluginId` 查询当前进程的 pending request；进程重启并重置请求 ID 后，旧进程的迟到响应可能进入新进程请求。
- `AbortSignal` 只能阻止前端继续合并结果，无法通知插件停止推理。
- manifest 兼容性校验只产生警告，不能阻止不兼容插件被旧主程序启用。

API v3 选择显式不兼容，不为 Paddle OCR 0.8.0 保留 v2 OCR 调用回退。主程序仍可加载既有 API v2 插件。

## 2. 兼容边界

### 2.1 版本声明

- 主程序将 `CURRENT_API_VERSION` 提升到 `3`。
- Paddle OCR manifest 声明 `host.apiVersion: 3`，最低主程序版本为首个包含 API v3 的版本。
- Paddle OCR 插件版本提升到 `0.8.0`。
- 新主程序对高于自身能力的插件 API 版本执行硬门禁，将插件标记为损坏且不启用。
- API v3 插件启动时必须收到由宿主运行时注入的 `hostContext`。常驻 Sidecar 在首次 `startupMethod` 的 `params.hostContext` 中校验；一次性 Sidecar 在每次请求的顶层 `hostContext` 中校验。该字段不能来自 manifest，避免旧宿主原样转发 manifest 参数后伪装成兼容宿主。

### 2.2 旧版本行为

| 组合                           | 结果                         |
| ------------------------------ | ---------------------------- |
| 新主程序 + API v2 插件         | 保持兼容                     |
| 新主程序 + Paddle OCR 0.8.0    | 使用 API v3 作业协议         |
| 旧主程序 + Paddle OCR 0.8.0    | 启动健康检查失败，插件不启用 |
| 新主程序 + 未知的更高 API 版本 | 加载为损坏状态，不启用       |

## 3. API v3 契约

### 3.1 稳定贡献点标识

Smart OCR 只持久化以下插件配置：

```ts
interface PluginOcrEngineConfig {
  pluginId: string;
  contributionId: string;
  modelProfile?: string;
  language?: string;
}
```

`name`、`method` 和 capabilities 每次从当前 manifest 的贡献点解析。显式 `contributionId` 未找到时直接失败，不按方法回退。加载 API v2 本地配置时只执行确定性迁移：已知 Paddle 映射、唯一方法匹配或插件唯一 OCR contribution 可以自动补齐；存在歧义时保留空 `contributionId`，要求用户重新选择。Smart OCR、实时字幕和窗口自动化共用同一个迁移器。

### 3.2 作业生命周期

API v3 长任务采用确认与完成分离的作业协议：

1. 宿主生成不可复用的 `jobId`，订阅贡献点声明的作业事件。
2. 宿主调用贡献点 `method` 提交完整任务，插件立即返回 `{ accepted: true, jobId }`。
3. 插件在内部 FIFO 队列中分片执行，通过 `progressEvent` 推送部分结果。
4. 插件通过 `completionEvent`、`failureEvent` 或 `cancelledEvent` 结束作业。
5. 取消时宿主调用 `cancelMethod({ jobId })`，等待插件发出取消终态后再清理临时图片。
6. 宿主使用无进度超时；每次收到合法进度事件后刷新计时，不再使用任务总时长作为超时依据。

贡献点能力声明：

```ts
capabilities: {
  batch: true,
  batchMode: "plugin",
  executionMode: "job",
  streamingResults: true,
  maxBatchSize: 4,
  progressEvent: "ocrJobProgress",
  completionEvent: "ocrJobCompleted",
  failureEvent: "ocrJobFailed",
  cancelledEvent: "ocrJobCancelled",
  cancelMethod: "cancelOcrJob",
  idleTimeoutMs: 300000
}
```

`maxBatchSize` 是插件运行时能力描述，不授权宿主再次分片。Paddle OCR 的实际值由 Rust 常量生成健康检查能力并接受 manifest 一致性测试，避免无约束的双事实来源。

### 3.3 进程代际

每次启动常驻进程时由主程序生成 `generationId`：

- `ResidentProcess` 的 pending map 使用独立 `Arc`，stdout 读取任务只访问自己所属代际的 map。
- `sidecar_send_command` 的插入、完成和超时清理都使用同一代际 map。
- Tauri 转发事件携带 `generationId`，前端适配器忽略非当前代际事件。
- 强制终止后等待子进程退出，再允许相同 `pluginId` 的新进程启动。
- Broker 转发同时捕获源、目标进程 generation；转发前和回写前都校验两个 generation。目标已重启时丢弃旧响应，并向仍处于当前代际的源进程返回明确错误。目标 I/O 与等待过程不持有全局进程表锁。

## 4. Paddle OCR 运行模型

Paddle OCR sidecar 拆分为协调线程和单个 OCR worker：

- 协调线程持续读取 stdin，可立即处理提交、取消、健康检查和关闭命令。
- OCR worker 独占 `EngineHolder`，按 FIFO 顺序处理作业，并在每个内部批次前后检查取消令牌。
- 作业注册表保存 `jobId -> cancellation token`，重复 `jobId` 被拒绝。
- 所有协议输出与 `NativeStdoutSilencer` 共用进程级 stdout 锁，防止原生推理重定向期间吞掉 JSONL。
- 单个图片的识别错误保留在正常完成结果中；模型加载、队列和协议错误才产生作业失败终态。

## 5. 实施阶段

### 阶段 A：契约与进程安全

- [x] 增加 API v3 常量与宿主启动上下文。
- [x] 对不支持的插件 API 执行硬门禁。
- [x] Smart OCR 使用严格贡献点配置。
- [x] pending request 与 stdout reader 按进程代际隔离。
- [x] 补充兼容门禁、贡献点选择和重启竞态测试。
- [x] 迁移 Smart OCR、实时字幕、窗口自动化和相关插件的旧 OCR 配置。

### 阶段 B：OCR 作业协议

- [x] 扩展 OCR contribution 作业能力声明。
- [x] Smart OCR 实现提交、事件终态、取消和无进度超时。
- [x] Paddle OCR 实现协调线程、FIFO worker 和取消令牌。
- [x] stdout 协议写入与原生输出抑制共享锁。
- [x] 补充宿主作业状态机和插件协议测试。

### 阶段 C：验证与发布

- [x] 同步插件指南、Smart OCR 架构和 Paddle OCR README。
- [x] 运行主程序类型检查、Vite 构建、相关 Vitest 与 Tauri Rust 测试。
- [x] 运行 Paddle OCR Rust/UI 构建和直接 JSON Lines 协议测试。
- [x] 修复开发 manifest 直接引用 Cargo target 缓存造成的旧二进制误启动；Rust 构建现在部署到稳定 `dev-bin/<platform>/` 并校验路径一致性。
- [ ] 在真实 Tauri WebView 中验证选择、进度、取消、超时恢复和重启后的首次调用。

2026-07-25 首次真实联调发现宿主调用 `submitOcrJob` 时启动了旧 API v2 二进制。根因是 `build:rust` 生成 `target/debug`，开发 manifest 却引用 `target/<target-triple>/debug`。该构建链已统一，真实 Tauri 验收需基于 manifest 指向的 `dev-bin` 产物重新执行，原验收项保持未完成。

## 6. 非目标

- 不在 API v3 中删除 API v2 插件加载能力。
- 不猜测存在多个候选项的旧 OCR 插件配置；歧义配置必须由用户重新选择。
- 不自动重试已经开始执行的 OCR 作业，避免重复副作用和结果混淆。
- 本阶段不把所有 Sidecar 通信迁移到命名管道；JSON Lines 仍为传输层，但严格串行化协议输出。
