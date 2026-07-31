# Recall 检索测试运行边界

本文记录已建立的 Recall 测试通道与数据约束，不维护功能阶段。当前功能施工顺序见 [`../Plan/recall-retrieval-pipeline-modularization-plan.md`](../Plan/recall-retrieval-pipeline-modularization-plan.md)，完整 Tauri E2E 使用说明见 [`../../../../../tests/tauri-e2e/README.md`](../../../../../tests/tauri-e2e/README.md)。

## 测试层级

| 时机               | 默认范围                                             | 约束                                                   |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------ |
| 日常开发           | 与改动直接相关的 Recall Vitest、Rust 测试            | 覆盖明确契约，不顺手扩大 fixture 或 corpus。           |
| 可运行切片交付前   | 隔离数据根中的确定性 mock smoke；必要时 curated lane | 不自动引入 Ollama、外部语料或恢复流程。                |
| 功能里程碑         | Chat 注入、二次启动恢复、curated 全流程              | 新 Runner 或 UI 接线完成后执行。                       |
| 按需、夜间、发布前 | Ollama、外部语料、真实 Chat 和 native 场景           | 显式选择 preset；前置条件缺失时必须明确 skip 或 fail。 |

## 未发布重构的 Release Gate

当改名、拆分和检索重构尚未形成任何中间发布版本时，日常开发和可运行切片的测试结论不能直接升级为发布结论。发布候选必须遵循施工计划的 `Gate 0` 至 `Gate 4`，并以最近一次正式发布版本的完整隔离 appData 副本作为迁移输入。

- debug Tauri E2E、工程 fixture、当前工作区生成的 SQLite 和已经迁移过的数据根只能证明局部契约，不能替代首次迁移、幂等重启、失败恢复、只读旧源或发布二进制验证。
- 为正式版本 appData 迁移新增的具名 preset 必须在缺少必要输入时 `fail`，不能沿用外部 corpus 的可选 `skip` 语义；发布记录须保留输入版本、脱敏 fingerprint、状态转移和报告摘要。
- 迁移后产品回归必须复用同一个已经成功迁移并重启的数据根，覆盖 Chat、Agent、占位符、管理搜索、Monitor 和 Playground，而不是只在重新播种的 fixture 中运行 pipeline。
- 发布二进制 smoke test 使用拟发布包而非 debug WebDriver binary。若发布包没有测试插件，应以隔离数据根、进程/窗口、日志和持久化结果保留等价证据。
- 外部语料和真实模型仍可保护隐私地显式选择，但若它们被列为本次发布的必要输入，缺失时必须阻断 Release Gate 并记录原因。

## 具名 Tauri E2E preset

```powershell
bun run test:tauri:e2e -- --preset recall-pipeline
bun run test:tauri:e2e -- --preset recall-vector
bun run test:tauri:e2e -- --preset recall-curated
bun run test:tauri:e2e -- --preset recall-chat
bun run test:tauri:e2e -- --preset corpus-sample
bun run test:tauri:e2e -- --preset corpus-full
bun run test:tauri:e2e -- --preset ollama-vector
bun run test:tauri:e2e -- --preset ollama-chat
```

- `recall-pipeline` 验证 pipeline 的 `compile -> prepare -> run -> trace` 链路。
- `recall-vector`、`recall-chat`、恢复与外部语料 preset 含有 legacy 路径覆盖；它们不能单独证明管线模块化完成。
- preset registry 位于 `tests/tauri-e2e/support/`。新增场景应增加具名 preset，不应把 spec、corpus、模型和恢复参数组合重新写入根 `package.json`。
- 外部语料、私有 profile 和真实模型均为显式 opt-in。测试产物只能记录脱敏元数据，不能包含消息正文、API Key、完整 profile、绝对私有路径或完整向量。
- 真实窗口验收由具名 Tauri E2E preset 驱动并保存可复核证据，不再维护要求人工打开窗口逐项勾选的平行清单。

## 管线验收约束

- 断言模块契约、artifact 传递、过滤、TopK、稳定 tie-break、trace、缓存隔离和 Embedding 调用次数。
- `algorithmic` 必须可在无模型环境运行，并证明零 Embedding 请求。
- 多个依赖模块必须共享一次查询向量；模型、算法版本、pipeline 或配置身份变化后不得命中旧缓存。
- 工程 fixture 与旧引擎输出只用于迁移排错和确定性验证，不能生成质量评分、相关性真值或默认策略优胜结论。
- 普通浏览器 mock 只覆盖纯前端状态，不能代替真实 Tauri WebView、IPC 或插件运行态。
