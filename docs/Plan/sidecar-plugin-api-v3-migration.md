# Sidecar Plugin API v3 发布收口计划

> 状态：主体实施与 review 修复已完成；开发模式已验证 API v3 和分批优化，待发布候选主应用与插件联合验收
>
> 最近更新：2026-07-28
>
> 首个迁移插件：`paddle-ocr` 0.8.0

## 1. 兼容边界

API v3 为长任务提供显式作业协议，不为 Paddle OCR 0.8.0 保留 v2 OCR 调用回退；新主程序仍可加载既有 API v2 插件。

| 组合                        | 结果                     |
| --------------------------- | ------------------------ |
| 新主程序 + API v2 插件      | 保持兼容                 |
| 新主程序 + Paddle OCR 0.8.0 | 使用 API v3 作业协议     |
| 旧主程序 + Paddle OCR 0.8.0 | 启动健康检查失败，不启用 |
| 新主程序 + 未知更高 API     | 标记损坏，不启用         |

API v3 插件必须校验宿主运行时注入的 `hostContext`：常驻 Sidecar 在首次启动方法中校验，一次性 Sidecar 在每次请求顶层校验。该信息不得来自 manifest。

## 2. 已落地契约

### 2.1 稳定贡献点

OCR 配置只持久化稳定事实：

```ts
interface PluginOcrEngineConfig {
  pluginId: string;
  contributionId: string;
  modelProfile?: string;
  language?: string;
}
```

`name`、`method` 和 capabilities 每次从当前 manifest 解析。找不到显式 `contributionId` 时直接失败，不按方法名回退。旧配置仅在已知映射、唯一方法或唯一 OCR contribution 时自动迁移；有歧义时要求用户重新选择。Smart OCR、实时字幕和窗口自动化共用该迁移器。

### 2.2 作业生命周期

1. 宿主生成不可复用的 `jobId` 并先订阅事件。
2. 插件提交方法立即返回 `{ accepted: true, jobId }`。
3. 插件 FIFO 分批执行，并通过 progress event 推送合法进度和局部结果。
4. completion、failure 或 cancelled event 产生唯一终态。
5. 取消通过 manifest 声明的 `cancelMethod` 执行；宿主等待取消终态后清理临时资源。
6. 超时按“无合法进度时长”计算，每次合法进度刷新计时。

`maxBatchSize` 是插件运行时能力描述，不授权宿主二次分片。job 模式必须声明流式结果和常驻事件通道。

### 2.3 进程代际

- 每次常驻进程启动生成 `generationId`，pending map 与 stdout reader 绑定同一代际。
- 插入、完成和超时清理只访问所属代际；前端忽略旧代际事件。
- 强制终止后等待子进程退出，再启动同 `pluginId` 新进程。
- Broker 转发同时校验源、目标 generation；等待 I/O 时不持有全局进程表锁。
- 旧代际不得转发、回写或完成新代际请求。

## 3. Paddle OCR 运行模型

- 协调线程持续读取 stdin，可及时处理提交、取消、健康检查和关闭。
- 单一 OCR worker 独占 `EngineHolder`，按 FIFO 执行，并在内部批次前后检查取消令牌。
- 作业表保存 `jobId -> cancellation token`，拒绝重复 ID。
- 协议输出与 `NativeStdoutSilencer` 共用 stdout 锁，避免原生输出抑制吞掉 JSONL。
- 单图识别错误保留在正常完成结果；模型加载、队列和协议错误才产生失败终态。

## 4. 已合并的 review 处理结果

原 review 跟进已合并到本文，以下问题均已关闭：

- 排队取消立即产生唯一终态；单作业取消超时不再重启共享 Sidecar 误伤其他作业。
- 消除提交前 AbortSignal 竞态，所有退出路径清理计时器。
- Paddle OCR UI 按合法进度刷新超时，不使用任务总时长超时。
- `hard-subtitle-extractor` 使用稳定 `contributionId`；AHK Automator 使用宿主 OCR facade 和 `ServiceResult`。
- 旧 OCR 配置与历史记录兼容展示；歧义配置显式降级为待选择。
- manifest job capability、`hostContext` 和 Broker 双代际均有运行时校验。
- 标准 OCR 结果保留可选行框，满足点击定位等结构化消费。
- Native / Sidecar 开发产物统一部署到 `dev-bin/<platform>/`；manifest 不再依赖 Cargo `target/` 缓存布局。
- 插件不可用状态保留结构化诊断，不覆盖协议、握手、产物或兼容性原始原因。

“通用 Sidecar 作业客户端”不再作为本轮未完成项：当前状态机先收敛在 OCR 平台，出现第二个 job contribution 后再单独评估抽取。

## 5. 当前唯一剩余门禁

- [ ] 使用主应用与 Paddle OCR 发布候选产物，在真实 Tauri WebView 完成选择、分批进度、局部结果、取消、无进度超时恢复、失败恢复、多窗口事件和进程重启后的首次调用。
- [ ] 核对主应用、插件版本、API version、最低宿主版本和 manifest 当前平台产物路径。
- [ ] 主应用与依赖 API v3 的插件安排在同一发布窗口；不得仅凭开发态成功调用宣称发布验收完成。

2026-07-25 曾因开发 manifest 指向错误的 target-triple 缓存而启动旧 API v2 二进制；构建链已统一到稳定 `dev-bin/<platform>/`。2026-07-27 已确认开发模式实际调用 API v3 并使用新的分批优化。

## 6. 非目标

- 不删除 API v2 插件加载能力。
- 不猜测有多个候选项的旧配置。
- 不自动重试已经开始执行的 OCR 作业，避免重复副作用。
- 不在本阶段把全部 Sidecar 通信迁移到命名管道；JSON Lines 仍是传输层。

## 7. 完成口径

联合验收矩阵通过并同步发布安排明确后，删除本文；稳定 API 契约继续由插件开发指南、宿主源码和插件自身文档维护。
