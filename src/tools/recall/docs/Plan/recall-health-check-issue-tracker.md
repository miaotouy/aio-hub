# Recall 与 Chat 关联已知问题跟踪

## 1. 用途

本文档跟踪 2026-07-18 对 `src/tools/recall` 及其与 `llm-chat` 关联路径体检发现的已知问题。每个问题必须独立实现、验证和提交；不在同一提交中夹带无关重构。

状态定义：

- `待处理`：尚未开始修复。
- `处理中`：已开始施工，尚未完成验收。
- `已验证`：代码和定向验证完成，尚未形成独立提交。
- `已完成`：已验证并形成独立提交。

## 2. 问题清单

| ID | 优先级 | 问题 | 状态 | 提交 |
| --- | --- | --- | --- | --- |
| RCL-001 | P1 | Recall 数据库和内存读模型依赖前端页面冷启动 | 已完成 | `fix(recall): 将数据库初始化纳入后端启动周期` |
| RCL-002 | P1 | `static` 模式可绕过 Agent Recall binding 授权 | 已完成 | `fix(recall): 收紧静态占位符的集合授权` |
| RCL-003 | P1 | Recall 检索结果缓存不随源数据变更失效 | 待处理 | - |
| RCL-004 | P1 | gate/turn 激活上下文被占位符和预设消息污染 | 待处理 | - |
| RCL-005 | P2 | 最近一次 AI 回复未参与 Recall 双查询融合 | 待处理 | - |
| RCL-006 | P2 | 单个非法 Recall 占位符会中止整个 Recall processor | 待处理 | - |
| RCL-007 | P2 | `loadBases()` 重复注册模型变更 watcher | 待处理 | - |
| RCL-008 | P3 | `fusionWeights` 未纳入 Recall 检索缓存键 | 待处理 | - |

## 3. 验收条件

### RCL-001 后端启动生命周期

- Tauri `setup` 在主窗口创建前建立 Recall SQLite repository 并 warmup 内存读模型。
- 初始化由 `RecallState` 串行化且幂等，前端页面不再拥有数据库生命周期。
- 保留兼容 command，但重复调用不替换已就绪的 repository。

### RCL-002 static 授权边界

- `entries=all` 只能读取占位符目标中已启用的 binding。
- 显式 entry ID 必须属于已授权集合，且不注入已禁用条目。
- 增加跨集合 entry ID 与 `all` 场景测试。

### RCL-003 缓存一致性

- 所有会改变检索内容、过滤或排序的后端写路径在成功后使检索缓存失效。
- 失败的写入不得提前清缓存。
- 增加条目新增、修改、禁用和删除的失效测试。

### RCL-004 激活上下文

- gate 只扫描最近的 `session_history` 文本，不能命中占位符自身。
- turn 只计算会话历史中的用户轮次，不受预设或深度注入影响。

### RCL-005 双查询上下文

- 主查询使用最后一条会话用户消息。
- 次查询使用该用户消息之前最近的 AI 回复。
- 普通发送和无 AI 历史两种场景都有测试。

### RCL-006 占位符错误隔离

- 逐个解析 Recall 占位符，单个配置错误只产生可定位诊断。
- 同一上下文中的其他合法占位符仍正常执行。

### RCL-007 watcher 生命周期

- 模型变更 watcher 在 store 生命周期内最多注册一次。
- 反复刷新集合后，一次模型变更只触发一次状态校验。

### RCL-008 缓存键完整性

- 融合权重影响向量时，必须参与后端缓存键。
- 不同权重的相同查询不得命中同一缓存项。

## 4. 通用验证

每个问题至少运行相关定向测试。全部问题完成后统一运行：

- `bun run check:frontend`
- `bun run build:vite`
- `bun run check:backend`
- Recall 和 Chat 关联的 Vitest 定向测试
- `cargo test --manifest-path src-tauri/Cargo.toml recall:: --lib`
