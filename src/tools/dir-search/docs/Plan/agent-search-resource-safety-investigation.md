# 目录搜索 Agent 宽范围扫描资源占用调查与加固计划

> 状态：调查完成，待实施
>
> 调查日期：2026-07-25
>
> 范围：桌面端 `dir-search` Agent 搜索/替换、Rust 目录遍历、Tool Calling 与 VCP 分布式超时链路
>
> 关联文档：[目录搜索架构](../../ARCHITECTURE.md)、[Tool Calling 架构](../../../tool-calling/ARCHITECTURE.md)、[VCP Connector 架构](../../../vcp-connector/ARCHITECTURE.md)

## 1. 结论摘要

2026-07-24 晚间出现过一次整机 CPU 满载、桌面交互近乎停滞的现象。现有证据不足以对单一进程做法证式归因：当时还有 Codex 和其他程序运行，Windows 事件日志也没有记录 AIO Hub 的资源耗尽或应用无响应事件。

但目录搜索存在一条足以解释该现象的完整故障链，并且应用日志证明该链路在事发时实际发生：

1. Agent 连续以较宽的 `E:\rc20` 为根目录执行文件内容搜索。
2. 稀有或不存在的匹配无法触发 `maxResults` 提前终止，搜索会继续扫描整棵目录树。
3. 一次搜索在 VCP 调用层等待 115 秒后超时，但底层 Tauri/Rust 搜索没有收到取消信号。
4. 超时后的旧搜索仍未完成时，又启动了一次新搜索。
5. 当前 `ignore 0.4.25` 每次并行遍历默认最多使用 12 个 worker；事发机器有 24 个逻辑处理器，两次重叠搜索可形成约 24 个 walker worker，再叠加协调线程和其他程序负载。

因此，本次应按高概率资源耗尽事故处理。只给 Agent 增加深度限制是必要措施，但不足以单独关闭风险；还必须覆盖扫描文件数、执行期限、总并发、线程预算和超时取消传播。

## 2. 证据与边界

### 2.1. 应用日志时间线

证据来自本机 `AppData/Roaming/com.mty.aiohub/logs/` 下的前后端日志。日志不纳入仓库，下面保留足以复核的时间和请求 ID。

| 时间     | 请求 ID            | 调用                                                             | 结果                                               |
| -------- | ------------------ | ---------------------------------------------------------------- | -------------------------------------------------- |
| 22:19:50 | `mrz11b7k-wt048w5` | 在 `E:\rc20` 搜索普通文本，无 include glob                       | 约 8.7 秒后进入“格式化结果”                        |
| 22:24:31 | `mrz17cnx-cl16phi` | 再次在 `E:\rc20` 搜索普通文本，无 include glob                   | 约 86 秒后进入“格式化结果”                         |
| 22:27:57 | `mrz1br6s-l5mna44` | 将一个长文件名作为内容 pattern，在 `E:\rc20` 搜索                | 22:29:52 达到 VCP 115 秒超时；没有后续“格式化结果” |
| 22:30:37 | `mrz1f72e-44w05lh` | 在 `E:\rc20` 启动第四次普通文本搜索                              | 没有完成记录                                       |
| 22:30:51 | -                  | Rust 依赖日志仍在遍历 `E:\rc20\vcp\...`、`E:\rc20\ToolsRC20\...` | 证明超时后仍有目录 walker 活跃                     |
| 22:33:33 | -                  | AIO Hub 后端重新启动                                             | 只能证明此前进程已结束，不能单独证明退出原因       |

第三次调用在外层超时后仍未出现完成进度，第四次调用又已进入搜索阶段，因此两次遍历存在重叠的证据较强。

### 2.2. 机器与依赖事实

- 事发机器：24 个逻辑处理器。
- `src-tauri/Cargo.lock`：`ignore 0.4.25`。
- `ignore 0.4.25` 在 `WalkBuilder.threads(0)` 时使用 `min(available_parallelism, 12)`。
- 当前 [`dir_search`](../../../../../src-tauri/src/commands/dir_search.rs) 未调用 `threads()`，所以单次搜索在该机器上使用 12 个 walker worker。
- `dir_search` 外部还启动一个 `std::thread::spawn` 协调 walker；两个重叠搜索不止产生 24 个执行线程。

### 2.3. 不能确认的事项

- 没有事发时的逐进程 CPU 采样，无法给出 AIO Hub、Codex 和其他程序各自的 CPU 百分比。
- Windows Application 事件日志没有 AIO Hub hang/resource exhaustion 记录。
- 22:17 至 22:18 有 ImageGlass 崩溃记录，但发生在上述目录搜索前，不能解释 22:30 后仍活跃的目录遍历。
- 应用重启与搜索之间存在时间相关性，但没有崩溃转储证明搜索直接导致进程退出。

## 3. 当前实现中的风险点

### 3.1. `maxResults` 不是扫描预算

[`SearchRequest.max_results`](../../../../../src-tauri/src/commands/dir_search.rs) 只统计已经找到的匹配项。默认 200 对高频关键词可能较快停止，但对稀有词、不存在的内容或“把文件名误作内容 pattern”的调用几乎没有保护作用。

后端目前没有：

- 最大遍历深度；
- 最大扫描文件数；
- 最大读取字节数总量；
- 搜索 deadline；
- 全局并发预算。

### 3.2. 默认并行度偏向吞吐，不适合交互式桌面负载

后端使用 `WalkBuilder.build_parallel()`，但未设置线程数。依赖库的 12 worker 上限适合独占式批处理，不适合作为 Agent 可远程触发的桌面后台操作。

每个候选文件会执行 metadata、整文件读取、二进制检查、UTF-8/GBK 解码和内容匹配。虽然单文件限制为 5 MiB，但没有总读取量限制，多线程仍可持续占用 CPU 和磁盘。

### 3.3. 隐藏目录默认纳入扫描

后端固定使用 `hidden(false)`，即不忽略隐藏文件和目录。宽根路径可能进入 `.git`、`.venv`、缓存目录等高条目数区域；是否最终排除取决于各层 ignore 规则，不能作为稳定资源保护。

### 3.4. 超时不等于取消

VCP 的 [`withDistributedTimeout`](../../../vcp-connector/services/vcpNodeProtocol.ts) 只 reject 外层 Promise。原始 `service[method](...)` Promise 会继续运行，Tauri command 和 Rust walker 不会停止。

本地 Tool Calling 的 `withTimeout()` 具有相同的外层超时语义。现有 [`ToolContext`](../../../../../src/services/types.ts) 已定义可选 `signal?: AbortSignal`，但同步 Tool Calling 和 VCP 分布式调用没有在超时时创建并触发 AbortController；VCP 创建的 context 也没有填入 `requestId`。

### 3.5. 取消状态和事件缺少搜索身份

Rust 端所有搜索共享一个 `DirSearchCancellation.cancelled: AtomicBool`：

- 新搜索开始时无条件 `reset()`；
- 任意 `dir_search_cancel` 会取消所有正在使用该状态的搜索；
- 新搜索可能在旧搜索完全退出前把取消标志重新置回 `false`。

前端结果事件同样使用全局 `dir-search-result-batch` 和 `dir-search-progress` 名称，载荷中没有 `searchId`。多个 [`actions.ts`](../../actions.ts) 监听器并存时会收集彼此的结果。

### 3.6. Agent 批量替换风险更高

[`replaceInDirectory()`](../../actions.ts) 的预搜索固定传入 `maxResults: 0`，即无限匹配数，因为它需要获得完整影响范围。该行为没有深度、文件数或 deadline 保护。

未来增加资源上限后，替换流程不能拿被截断的预搜索结果继续执行部分替换；只要预搜索因扫描预算、deadline、取消或错误而不完整，就必须拒绝进入写入阶段。

### 3.7. Agent 方法描述容易诱发误用

[`dir-search.registry.ts`](../../dir-search.registry.ts) 将方法描述为“搜索目录内容”，但没有强调：

- 只搜索文件内容，不按文件名查找；
- 应优先给出仓库或具体子目录，而不是工作盘/工作区上层目录；
- 宽范围调用应提供 include/exclude glob；
- `maxResults` 不限制实际扫描文件数。

事发日志中已经出现把目标文件名作为内容 pattern 的实际误用。

## 4. 加固目标

### 4.1. 必须满足

1. Agent 对宽根路径或无匹配 pattern 的调用必须在有限资源预算内停止。
2. 调用层超时、用户取消和任务取消必须最终停止对应 Rust walker，而不是只停止等待结果。
3. 同时到达的搜索不能各自占用默认 12 worker，也不能串收结果。
4. 搜索停止原因必须可观察，Agent 不能把被截断结果误报为完整结果。
5. 批量替换只有在预搜索完整结束时才能写盘。
6. UI 搜索现有交互可以保留显式无限深度能力，但仍受后端线程和总并发硬上限保护。

### 4.2. 非目标

- 本轮不重写内容匹配器；`memchr`/`regex` 快速路径不是主要问题。
- 不以字符串路径长度判断“目录是否宽泛”；短路径也可能是合理仓库根目录。
- 不依赖 `.gitignore` 作为安全边界。
- 不通过提高 VCP 超时时间掩盖底层无取消问题。

## 5. 建议方案

以下数值是第一轮保守默认值，需要通过基准校准，但不应在没有替代保护时改回无限制。

| 保护项            | Agent 建议默认值 | 后端硬约束/语义                                             |
| ----------------- | ---------------- | ----------------------------------------------------------- |
| `maxDepth`        | `5`              | `1..20`；Agent 不接受 `0`，UI 可显式用 `0` 表示无限         |
| `maxFilesScanned` | `50_000`         | 原子计数达到上限后停止；不能由 Agent 提高到后端硬上限以上   |
| `maxBytesRead`    | `2 GiB`          | 按实际读取字节累计；与文件数限制共同约束大量中等文件        |
| `deadlineMs`      | `30_000`         | walker 每个 entry 前检查 deadline；VCP 115 秒只作为外层兜底 |
| walker threads    | 不暴露给 Agent   | 后端固定初始值 `4`，后续按基准调整                          |
| 同时搜索数        | 不暴露给 Agent   | 初始全局上限 `1`；取消后必须等旧 worker 退出才释放生命周期  |
| 隐藏目录          | 默认不搜索       | Agent 默认 `includeHidden=false`；UI 保留现有显式行为       |

深度限制解决“路径短且递归过深”，文件数和 deadline 解决“目录很浅但非常宽”。线程与并发上限负责保证系统仍有交互余量。这些保护必须组合使用。

### 5.1. 请求身份和结果契约

为每次搜索生成 `searchId`，贯穿以下边界：

- `SearchRequest.searchId`；
- `SearchResultBatch.searchId`；
- `SearchProgress.searchId`；
- `SearchSummary.searchId`；
- `dir_search_cancel(searchId)`。

Rust 状态改为按 `searchId` 管理取消 token 和生命周期，不再使用单个全局 AtomicBool。前端监听器只接收与本次调用一致的事件。

`SearchSummary` 增加明确的终止信息：

```text
stopReason: completed | matchLimit | fileLimit | deadline | cancelled | busy
truncated: boolean
filesScanned: number
bytesRead: number
```

`matchLimit`、`fileLimit` 和 `deadline` 都不能继续使用模糊的“搜索完成”表述。

### 5.2. 统一超时取消传播

复用现有 `ToolContext.signal`，不新增另一套取消接口：

1. Tool Calling executor 和 `VcpNodeProtocol` 在调用工具前创建 AbortController。
2. 将 `signal`、`requestId` 注入 `ToolContext`。
3. 超时处理先 `controller.abort()`，再返回超时错误。
4. `dir-search/actions.ts` 监听 `signal.abort`，调用带 `searchId` 的 `dir_search_cancel`。
5. action 在 `finally` 中移除 abort listener 和 Tauri event listener。
6. 后端退出 walker、join 协调线程并清理 search state 后，Tauri command 才真正 settle。

其他长耗时工具可以逐步接入同一 signal 语义，但本计划先以 `dir-search` 闭环验证。

### 5.3. 并发策略

第一阶段优先保证桌面响应，后端只允许一个活动搜索。新的搜索到达时：

- UI 已明确取消旧搜索：等待旧搜索释放生命周期后开始新搜索；
- Agent/VCP 并发请求：返回结构化 `busy`，由调用方缩小范围或稍后重试；
- 不允许通过新调用的 `reset()` 复活旧搜索。

后续只有在基准证明 4 worker 单搜索仍有足够余量时，才评估全局 worker budget，而不是简单把并发数改成 2。

### 5.4. Agent 契约与提示

更新 `searchDirectory` 元数据：

- 明确该方法只搜索文件内容；
- 要求优先使用最具体的已知目录；
- 搜索代码或文档时建议提供 `includeGlobs`；
- 暴露 `maxDepth`，默认 5；
- 返回结果注明是否因资源上限截断。

文件名查找如果是稳定需求，应新增独立方法或复用目录树能力，不再暗示 Agent 用内容搜索代替。

`replaceInDirectory` 应采用更严格契约：预搜索只要 `truncated=true` 就返回拒绝信息，不执行任何替换，并提示缩小目录或增加 include glob。

### 5.5. 可观测性

每次搜索至少记录：

- `searchId`、调用来源（UI/Agent/VCP）；
- root、include/exclude glob 数量、maxDepth、文件上限、deadline、worker 数；
- 开始/结束时间、filesScanned、bytesRead、matches；
- stopReason 和是否成功完成 worker join。

搜索 pattern 可能包含敏感文本。INFO 日志只记录长度、是否正则和可选 hash，不记录完整 pattern；完整值仅在显式 debug 模式考虑输出。

## 6. 实施批次

### 批次 A：搜索身份与资源硬限制

- [ ] 扩展 Rust/TypeScript 搜索类型，加入 `searchId`、深度、文件数、deadline、隐藏目录和终止原因。
- [ ] 对 `WalkBuilder` 设置 `max_depth`、`threads(4)` 和隐藏目录策略。
- [ ] 增加 files/bytes/deadline 原子预算检查。
- [ ] 将取消状态改为按 `searchId` 管理。
- [ ] 为 batch/progress 事件增加 `searchId` 并在所有消费者过滤。
- [ ] 增加全局活动搜索上限，确保 worker 完全退出后再释放。

### 批次 B：Agent、Tool Calling 与 VCP 取消闭环

- [ ] Agent `searchDirectory` 默认 `maxDepth=5`、`maxFilesScanned=50_000`、`maxBytesRead=2 GiB`、`deadlineMs=30_000`、`includeHidden=false`。
- [ ] Tool Calling executor 在超时时 abort `ToolContext.signal`。
- [ ] VCP context 补入 `requestId` 和 `signal`，115 秒超时时 abort。
- [ ] `actions.ts` 将 abort 转换为按 searchId 取消，并保证监听器清理。
- [ ] 更新 Agent 方法描述，明确内容搜索边界与缩小范围要求。
- [ ] 替换预搜索遇到不完整结果时禁止写盘。

### 批次 C：观测、文档和基准

- [ ] 增加结构化开始/结束日志与 stopReason。
- [ ] 更新 [`ARCHITECTURE.md`](../../ARCHITECTURE.md) 中的并行、取消、性能和 Agent 契约说明。
- [ ] 在 24 逻辑处理器机器上记录修改前后 CPU、线程数、扫描量、取消延迟和 UI 响应。
- [ ] 根据基准决定是否调整 4 worker、5 层、50,000 文件和 30 秒默认值。

## 7. 验证计划

### 7.1. Rust 单元/集成测试

使用临时目录构造确定性目录树，覆盖：

- `maxDepth` 边界及 root depth 语义；
- 文件数上限停止和 `stopReason=fileLimit`；
- deadline 停止；
- 单 searchId 取消不影响其他状态；
- 取消后 worker 已 join，活动搜索槽位才释放；
- 并发请求返回 `busy` 或按约定等待；
- 隐藏目录默认排除、显式包含；
- 匹配上限在并行竞争下只允许有限、已记录的超出量；
- 不完整预搜索不能进入替换写入。

### 7.2. 前端测试

扩展现有 `src/tools/dir-search/__tests__/actions.test.ts`，覆盖：

- Agent 默认资源参数映射；
- 非法、NaN、负数和超大参数的归一化；
- 事件 searchId 隔离；
- AbortSignal 触发对应 searchId 的取消；
- 超时、取消、busy 和 truncated 结果格式；
- 替换在预搜索截断时零写入。

为 Tool Calling 与 VCP 增加超时测试，断言不仅返回 timeout，还实际触发 context signal。

### 7.3. 工程检查

实施代码后至少执行当前仓库脚本：

```powershell
bun run test:run -- src/tools/dir-search/__tests__/actions.test.ts
bun run build:tsc
bun run build:vite
bun run check:backend
```

涉及 Rust 测试时，再运行 `cargo test --manifest-path src-tauri/Cargo.toml` 的目标测试。前端构建不能由类型检查替代。

### 7.4. 真实 Tauri 验收

普通浏览器不能验证 Tauri IPC、Rust walker、事件隔离和原生进程资源占用。真实窗口至少覆盖：

1. 在测试根目录搜索不存在的 pattern，确认按 deadline 或文件数上限停止。
2. 搜索期间连续发起第二次调用，确认不会出现两个 12 worker 扫描。
3. 从 VCP 发起长搜索并触发超时，确认后端日志随后出现对应 searchId 的 cancelled/end，而不是继续遍历。
4. 搜索期间打开资源管理器、拖动窗口并操作 AIO Hub，确认桌面仍可交互。
5. 对替换流程制造截断预搜索，确认磁盘文件没有任何修改。

## 8. 完成标准

- Agent 宽范围无匹配搜索不会无限遍历，也不会默认占用 12 worker。
- 任意超时/取消都能在有界时间内停止对应 walker 并完成 join。
- 不存在两个搜索各自创建完整 worker 池的情况。
- 并发搜索结果不会串流。
- 搜索结果明确标识完整、截断及终止原因。
- 截断的替换预搜索不会产生部分写入。
- 定向测试、前端类型检查、Vite 构建、Rust 检查和真实 Tauri 验收全部通过。

## 9. 当前决策记录

- 深度限制：采纳，但作为组合资源预算的一部分。
- 单纯依赖 `maxResults`：拒绝，因为无匹配时没有保护。
- 单纯延长 VCP 超时：拒绝，因为会延后暴露问题且不停止底层工作。
- 立即替换搜索引擎：不采用，当前风险来自资源生命周期和并发边界。
- 第一阶段 worker 数：建议 4，实施后以真实机器基准校准。
- 第一阶段并发数：建议 1，优先确保桌面可响应。
