# Recall 自动化测试、真实向量请求与预置会话实施计划

**状态**: 调研完成，待实施  
**创建日期**: 2026-07-20  
**最近修订**: 2026-07-20  
**适用范围**: `src/tools/recall/`、`src-tauri/src/recall/`、`src/tools/agent-manager/`、`src/tools/llm-chat/`、`tests/tauri-e2e/`

关联文档：

- [Recall 架构说明](../../ARCHITECTURE.md)
- [Recall 检索管线模块化设计与实施计划](./recall-retrieval-pipeline-modularization-plan.md)
- [工具测试指南](../../../../../docs/guide/tool-testing-guide.md)
- [Tauri E2E 说明](../../../../../tests/tauri-e2e/README.md)

> 本文解决的是测试装配与自动化覆盖问题，不改变 Recall / Knowledge 领域边界，也不把本机 Ollama 变成默认测试依赖。确定性本地 mock 是每次必跑的主通道；真实 Ollama 是显式启用的集成通道。

---

## 1. 调研结论

### 1.1 当前已有能力

仓库已经具备可复用的真实窗口 E2E 基础设施：

- `tests/tauri-e2e/run.ts` 会生成隔离的 `AIO_DATA_DIR`，启动 Vite、debug Tauri binary 和本地 OpenAI-compatible HTTP mock。
- runner 已能在启动前写入 `llm-service/profiles.json`，同时提供 Chat 与 Embedding 模型。
- `tests/tauri-e2e/support/openai-mock.ts` 已实现真实 HTTP `/v1/embeddings`，并把脱敏请求摘要写入产物目录。
- `knowledge-workflow.spec.ts` 已覆盖通过真实 UI 创建 Agent、建立 Knowledge 授权、创建会话和触发工具事件。
- Agent 与会话都使用“索引 + 独立文件”存储，天然适合在隔离数据根中预置：
  - `agent-manager/agents-index.json`
  - `agent-manager/agents/{agentId}/agent.json`
  - `llm-chat/sessions-index.json`
  - `llm-chat/sessions/{sessionId}.json`
- Recall 源数据与向量数据分别以 `recall/recall.db`、`recall/recall-vectors.db` 为真源，前端通过正式 `recall_*` commands 访问。

### 1.2 当前缺口

截至 2026-07-20，Recall 自动化存在以下关键空白：

1. Recall 有 31 个 Vitest case，但没有真实请求穿过 `callEmbeddingApi -> desktopLlmTransport -> Tauri HTTP -> Embedding endpoint`。
2. 定向覆盖率命令 `bun run test:coverage -- --run src/tools/recall` 虽然 9 个测试文件、31 个 case 全部通过，但关键文件覆盖很低：
   - `core/embedding.ts`: statements 1.42%
   - `logic/orchestrator.ts`: statements 2.36%
   - `stores/recallCollectionStore.ts`: statements 10.47%
   - `services/api.ts`: statements 32.11%
   - `src/tools/recall` 汇总: statements 13.20%，lines 14.58%
3. `src/tools/recall/**/*.vue` 当前没有稳定的 `data-testid`，WDIO 无法可靠驱动建集、录入、向量化、搜索和查看结果。
4. 现有 7 个 Tauri E2E case 没有覆盖 Recall；`knowledge-workflow.spec.ts` 只验证 mock 模型可见，没有验证应用实际发送过 embedding 请求。
5. E2E runner 只预置模型 Profile，没有统一的 Agent、Recall binding 和会话 fixture 契约。测试仍需逐项点击创建，耗时且难以复用。
6. 没有“同一隔离数据根二次启动”的恢复用例，无法自动证明 Agent binding、会话、条目向量和活动模型在重启后仍可用。

覆盖率数字只能说明风险集中位置，不能单独作为完成标准。Recall 的验收必须同时断言 HTTP 请求、Tauri IPC、SQLite 持久化、检索排序和 Chat 注入结果。

### 1.3 AIO Hub 当前 Ollama 调用契约

`src/llm-apis/adapters/index.ts` 当前把 `ollama` 映射到 `openAiAdapter`，Embedding 最终由 `@aiohub/llm-core` 的 `openAiEmbeddingAdapter` 构造请求。未配置自定义 endpoint 时，请求地址是：

```text
{baseUrl}/v1/embeddings
```

因此测试不能只探测 Ollama 原生 `/api/embed`。真实 AIO Hub 通道必须验证 `/v1/embeddings`；`/api/embed` 只作为 Ollama 服务自身的辅助诊断。

### 1.4 本机 Ollama 实测

2026-07-20 在 `http://127.0.0.1:11434` 实测：

| 模型                               | Ollama capability | `/v1/embeddings`    | 输出维度 | 建议                               |
| ---------------------------------- | ----------------- | ------------------- | -------: | ---------------------------------- |
| `lmstudio-nomic-embed-text:q4_k_m` | `embedding`       | 通过，批量输入 3 条 |      768 | 首选，体积约 84 MB，冷启动约 28 秒 |
| `mxbai-embed-large:latest`         | `embedding`       | 通过，批量输入 3 条 |     1024 | 备用，体积约 670 MB                |

同一组中英语义/无关文本探针结果：

| 模型                               | 中英语义相似度 | 无关文本相似度 |
| ---------------------------------- | -------------: | -------------: |
| `lmstudio-nomic-embed-text:q4_k_m` |       0.700497 |       0.333768 |
| `mxbai-embed-large:latest`         |       0.733473 |       0.298082 |

本机还有名称包含 `Embedding` 的 Qwen 模型，但 `/api/tags` 当前把它们标为 `completion`，不能仅凭名称加入测试候选。真实通道只接受 Ollama 明确声明 `embedding` capability 且预检请求成功的模型。

---

## 2. 目标与非目标

### 2.1 目标

1. 每次 Tauri E2E 都通过真实 HTTP 和 Tauri native network 发起确定性的 embedding 请求。
2. 可选地让同一套 Recall 场景转接到本机 Ollama，验证真实模型推理、输出维度和语义排序。
3. 启动前预置稳定 ID 的模型 Profile、Agent、Recall binding 和会话，减少重复 UI 装配。
4. 通过正式 Recall commands 准备集合与条目，不直接拼 SQLite schema，也不恢复旧 Knowledge 目录作为测试捷径。
5. 自动覆盖建集、条目写入、向量化、查询向量、检索、Agent 注入、会话恢复和重启持久化。
6. 失败时保留可诊断但不泄露密钥/正文的请求摘要、截图、前后端日志和运行元数据。

### 2.2 非目标

- 不让 PR 测试依赖开发者已安装 Ollama、GPU 或某个远程 API Key。
- 不在测试启动时自动 `ollama pull`；下载模型是有副作用且耗时的显式准备动作。
- 不通过直接写 `recall.db` / `recall-vectors.db` 绕开 repository 和 migration。
- 不把 deterministic mock 的排序结果称为模型质量结论。
- 不要求用一个大 E2E case 覆盖所有错误分支；超时、重试、批量降级等仍由 Vitest 负责。

---

## 3. 测试通道设计

### 3.1 通道 A：确定性本地 HTTP mock，默认必跑

保留现有 `E2E Local Mock`，但把它从“模型列表 smoke”提升为完整 Recall workflow：

```text
Recall UI
  -> callEmbeddingApi
  -> @aiohub/llm-core request builder
  -> desktopLlmTransport
  -> Tauri native HTTP command
  -> 127.0.0.1 /v1/embeddings
  -> deterministic vector response
  -> recall_update_entry_vector
  -> recall-vectors.db / in-memory vector matrix
  -> recall_search
```

mock 向量不能继续只依赖字符串长度。应为固定 fixture 主题生成可区分、归一化的 8 或 16 维向量，并对未知输入使用稳定 hash，确保：

- “Rust ownership / borrow checker” 查询稳定命中 Rust 条目第一名；
- “banana bread” 不会排到 Rust 条目前面；
- 批量输入的返回顺序与 `index` 正确；
- 文档向量请求和查询向量请求都能从请求摘要中区分。

此通道证明真实 transport、endpoint、IPC、持久化和检索流程可用，但不证明真实模型质量。

### 3.2 通道 B：真实 Ollama，显式 opt-in

新增独立入口，建议环境变量：

```powershell
$env:AIO_E2E_VECTOR_MODE = "ollama"
$env:AIO_E2E_OLLAMA_BASE_URL = "http://127.0.0.1:11434"
$env:AIO_E2E_OLLAMA_MODEL = "lmstudio-nomic-embed-text:q4_k_m"
bun run test:tauri:e2e:ollama
```

runner 启动应用前执行以下预检：

1. `GET /api/tags`，确认服务在线且模型存在。
2. 确认目标模型 capability 包含 `embedding`。
3. `POST /v1/embeddings`，输入两条短文本，确认返回数量、有限数值和统一维度。
4. 把探测到的维度写入本次 Recall workspace fixture，不硬编码 768/1024。
5. 将 profile 类型写为 `ollama`、`baseUrl` 指向实测地址、模型 capability 写为 `embedding: true`。

默认行为是 Ollama 不可用时把此专用 suite 标记为 skipped 并写明原因；在自托管 CI 或发布机上设置 `AIO_E2E_REQUIRE_OLLAMA=1` 后，预检失败必须使任务失败。

真实通道使用小型固定语料，断言相关条目排名高于无关条目，不断言跨模型相同的绝对 score。首次请求超时至少允许 90 秒，以覆盖模型冷加载；后续请求仍使用产品正常 timeout。

### 3.3 私有开发渠道：从 Git 忽略配置注入

LLM 设置页已提供版本化 `aiohub.llm-profiles@1` 渠道包的导入导出能力。开发者可以在图形界面编辑渠道，再导出当前或全部渠道；默认导出会移除 API Key、鉴权请求头和凭据字段，显式开启后可包含真实凭据。

runner 应直接消费这一产品格式，不再维护另一套测试专用 channels schema。建议把包含测试渠道的导出文件保存到：

```text
.dev-data/e2e-llm-channels.aio-llm.json
```

`.dev-data/` 已被根 `.gitignore` 忽略，不需要再维护一份容易遗漏的密钥文件规则。渠道包结构由 `src/utils/llm-profile-transfer.ts` 校验，核心形式为：

```jsonc
{
  "format": "aiohub.llm-profiles",
  "formatVersion": 1,
  "containsSecrets": true,
  "redactedPaths": [],
  "profiles": [
    {
      "id": "e2e-real-ollama",
      "name": "E2E Real Ollama",
      "type": "ollama",
      "baseUrl": "http://127.0.0.1:11434",
      "apiKeys": [],
      "enabled": true,
      "networkStrategy": "native",
      "models": [],
    },
  ],
}
```

Chat 与 Embedding 的角色选择不是渠道自身属性，由 runner 参数指定，避免把测试语义写回普通用户配置。

启动方式建议为：

```powershell
$env:AIO_E2E_LLM_CONFIG = ".dev-data\e2e-llm-channels.aio-llm.json"
$env:AIO_E2E_LLM_PROFILE_ID = "e2e-real-ollama"
$env:AIO_E2E_CHAT_MODEL_ID = "qwen3.5:9b"
$env:AIO_E2E_EMBEDDING_MODEL_ID = "lmstudio-nomic-embed-text:q4_k_m"
bun run test:tauri:e2e:recall
```

选择优先级和安全边界：

1. CLI `--llm-profile` 高于 `AIO_E2E_LLM_PROFILE_ID`。
2. 未显式选择 profile 时继续使用 deterministic mock，不能因为本地文件存在就自动调用真实或付费端点。
3. 选择真实 profile 后，本次 Recall fixture 只能引用显式指定的 Chat / Embedding 模型，不能静默回退到 mock。
4. runner 复用原生渠道包 parser，校验 profile ID、角色模型 ID、模型 capability、URL 协议和字段类型，再把选中 profile 写入隔离 `{dataDir}/llm-service/profiles.json`。
5. runner 不读取用户默认 appData 中的 `profiles.json`，也不修改私有源配置。
6. `e2e-run.json` 只记录 profile ID、模型 ID 和 endpoint origin；不得记录 API Key、自定义鉴权 header 或完整配置。

这条通道验证的是完整真实链路：私有渠道配置只负责装配，实际请求仍由应用的 `useLlmProfiles -> provider adapter -> desktopLlmTransport -> Tauri native HTTP` 发出。不能在 runner 中直接请求目标 endpoint 后就把场景判定为通过。

### 3.4 所有通道必须共享场景

mock、Ollama 和私有渠道只替换 Profile、角色模型与期望策略，不复制多套业务脚本。共享场景参数至少包括：

```typescript
interface RecallVectorScenario {
  profileId: string;
  chatModelId: string;
  modelId: string;
  modelCombo: string;
  expectedDimension: number;
  rankingMode: "exact" | "relative";
  requestEvidence: "mock-log" | "ollama-preflight-and-state";
}
```

---

## 4. Fixture 与预置 Agent / 会话

### 4.1 统一 fixture manifest

新增 `tests/tauri-e2e/fixtures/recall-workflow.ts` 或等价 JSON + 类型定义，集中声明稳定 ID：

```text
profile: e2e-vector-profile
chat model: e2e-chat
embedding model: 由测试通道注入
recall: 10000000-0000-4000-8000-000000000001
entries: 20000000-0000-4000-8000-000000000001..003
agent: e2e-recall-agent
session: e2e-recall-session
```

manifest 包含：

- Recall 集合元数据、3 至 5 条小型语料和期望主题；
- Agent 的 `profileId` / `modelId`、`recallConfig.bindings`、`recallSettings`；
- 至少一个包含 `{{recall}}` 的 preset message；
- 一个可恢复的空会话，以及一个包含既有用户/助手节点的会话；
- fixture schema version，供格式变化时显式迁移。

fixture 只能写入 runner 已解析并校验过的隔离 `AIO_E2E_DATA_DIR`。显式数据目录仍沿用 `AIO_E2E_SEED_FIXTURES=1` 的 opt-in 保护。

### 4.2 启动前写入文件型配置

runner 在应用启动前生成：

```text
{dataDir}/llm-service/profiles.json
{dataDir}/agent-manager/agents-index.json
{dataDir}/agent-manager/agents/e2e-recall-agent/agent.json
{dataDir}/llm-chat/sessions-index.json
{dataDir}/llm-chat/sessions/e2e-recall-session.json
```

其中 `profiles.json` 的来源按当前测试模式确定：

- 默认模式：runner 生成 `E2E Local Mock`。
- Ollama 快捷模式：runner 根据预检结果生成 Ollama profile。
- 私有渠道模式：runner 从 `aiohub.llm-profiles@1` 渠道包读取并校验显式选择的 profile，只复制该 profile。

Agent 的 Chat 模型、Recall workspace 的 Embedding 模型和预期维度必须从 runner 解析后的角色模型派生，不能在 Agent/session fixture 中再次硬编码。

不要手写散落的 JSON 字符串。新增 `support/fixture-seeder.ts`，用共享 builder 生成索引项与详情，并增加 Vitest schema/round-trip 测试，确保：

- index 与 detail ID 一致；
- Agent 引用的 Profile、模型和 Recall ID 都存在于 manifest；
- session 的 `displayAgentId` 和消息节点 Agent ID 可解析；
- 时间戳固定，测试不依赖 `Date.now()` 排序；
- 写盘内容不包含 API Key、用户默认数据或绝对开发路径。

### 4.3 启动后通过正式 IPC 准备 Recall

Recall 使用 SQLite 真源，fixture setup 应在 Tauri 已启动后调用正式 production commands：

1. `recall_initialize`
2. `recall_save_base_meta`
3. 对每条 fixture 调用 `recall_upsert_entry`
4. `recall_load_base_meta` 回读并核对 ID/条目数

WDIO 封装一个 `invokeTauriCommand()` helper 作为测试 setup 和持久化断言入口。setup 可以直接调用 command；真正待验收的向量化、搜索和 Chat 注入必须从可见 UI 触发，不能用 command 冒充用户流程。

不直接写 SQLite 的原因：

- 避免复制 schema、BLOB 编码和 migration 版本；
- setup 本身也能覆盖 command 参数 camelCase 与 repository warmup；
- 后续 schema 演进时 fixture 不需要同步 SQL。

### 4.4 重启恢复

至少增加一个二阶段场景：

1. 第一次启动完成条目向量化并在预置会话发送一次带 Recall 的消息。
2. 结束应用但保留本次隔离 `dataDir`。
3. 第二次启动时关闭 fixture 重置，只允许幂等校验。
4. 断言预置 Agent、当前会话、Recall binding、条目 `vectorizedModels`、活动模型和检索结果仍存在。

重启用例要区分“刷新 WebView”和“重启 Tauri 进程”。前者可作为快速 case，后者才是 SQLite warmup 与文件持久化发布门槛。

---

## 5. 自动化场景矩阵

| 层级             | 场景                                   | 核心断言                                     | 默认执行 |
| ---------------- | -------------------------------------- | -------------------------------------------- | -------- |
| Vitest           | `generateVectors` 单条/批量            | request、顺序、usage 映射                    | 是       |
| Vitest           | retry/timeout/exponential backoff      | 次数、延迟、最终错误                         | 是       |
| Vitest           | 批量 400 降级单条                      | 成功项保留、失败项可诊断                     | 是       |
| Vitest           | IndexingOrchestrator                   | hash、cache、vector IPC、维度                | 是       |
| Vitest           | SearchOrchestrator / `searchWithCache` | query vector、模型隔离、cache key            | 是       |
| Rust             | repository vector round-trip           | BLOB、dimension、tokens、content hash        | 是       |
| Rust             | command + warmup                       | 保存后搜索、重启加载、模型隔离               | 是       |
| Tauri E2E mock   | 条目向量化                             | UI 成功、HTTP 请求、vectorized 状态          | 是       |
| Tauri E2E mock   | semantic search                        | 相关条目第一、trace/结果可见                 | 是       |
| Tauri E2E mock   | 预置 Agent + 会话                      | 无需手建即可加载、binding 可见               | 是       |
| Tauri E2E mock   | Chat Recall 注入                       | embedding query 已发送、回答上下文含目标条目 | 是       |
| Tauri E2E mock   | 二次启动恢复                           | Agent/session/vector/search 全部恢复         | 发布门槛 |
| Tauri E2E Ollama | 真实模型全流程                         | 实际维度、相对排名、持久化                   | opt-in   |

建议把 Tauri E2E 拆成独立 spec，避免依赖 `knowledge-workflow.spec.ts` 的内存变量和执行顺序：

```text
tests/tauri-e2e/specs/recall-vector-workflow.spec.ts
tests/tauri-e2e/specs/recall-session-recovery.spec.ts
```

---

## 6. UI 可测试性改造

只为稳定语义元素添加 `data-testid`，不暴露实现细节。第一批至少包括：

```text
recall-workspace
recall-collection-row
recall-create-collection
recall-entry-row
recall-create-entry
recall-entry-key
recall-entry-content
recall-entry-save
recall-default-embedding-model
recall-detect-dimension
recall-vectorize-entry
recall-vectorize-all
recall-vector-progress
recall-search-query
recall-search-engine
recall-search-submit
recall-search-result
recall-search-result-score
agent-recall-enabled
agent-recall-binding
chat-message
```

动态项同时提供稳定数据属性，例如 `data-recall-id`、`data-entry-id`、`data-agent-id`。selector 不依赖中文文案、Element Plus 内部 class、列表序号或屏幕坐标。

---

## 7. 请求证据与产物

每次运行在 artifact 目录保留：

```text
e2e-run.json
embedding-requests.jsonl
recall-fixture-manifest.json
recall-state-summary.json
screenshots/
wdio.log
frontend.log
backend.log
```

`embedding-requests.jsonl` 记录：

- 时间、endpoint、model、input count；
- 输入 hash 或 fixture label，不记录完整用户正文；
- 响应数量、维度、耗时、HTTP status；
- request ID，用于关联前后端日志。

禁止记录 Authorization、API Key、完整私有 profile 和完整向量。mock 通道直接由本地 server 产出证据；Ollama/私有渠道至少记录 runner 预检、应用请求关联 ID 和应用回读状态。若后续需要证明应用请求确实到达目标端点，可在 runner 中增加仅监听本机的转发记录器，再把 Profile base URL 指向该转发器。包含 `profiles.json` 的完整隔离 dataDir 不能作为 CI artifact 上传，只允许上传经过白名单筛选和脱敏的 artifact 目录。

---

## 8. 脚本与执行策略

建议新增脚本：

```json
{
  "test:tauri:e2e:recall": "bun tests/tauri-e2e/run.ts --spec tests/tauri-e2e/specs/recall-vector-workflow.spec.ts",
  "test:tauri:e2e:ollama": "bun tests/tauri-e2e/run.ts --vector-mode ollama --spec tests/tauri-e2e/specs/recall-vector-workflow.spec.ts",
  "test:tauri:e2e:real": "bun tests/tauri-e2e/run.ts --llm-profile"
}
```

执行分层：

- PR / 常规本地检查：Recall Vitest + Rust 定向测试 + deterministic Tauri E2E。
- 夜间或自托管机器：追加 Ollama lane。
- 发布前：deterministic lane 的二次启动恢复必须通过；有 Ollama 的发布机再运行真实 lane。

不要让 Ollama lane 静默改用 mock。真实通道被请求后只能明确通过、明确跳过或明确失败，产物中必须写出最终模式和原因。

---

## 9. 分阶段实施

### Phase 1：测试装配与纯逻辑补齐

- 提取 fixture manifest、Agent/session builder 和 seeder。
- 为 `core/embedding.ts`、`logic/orchestrator.ts`、vector cache 增加定向测试。
- 改进 OpenAI mock 的确定性主题向量与请求摘要。
- 复用 `aiohub.llm-profiles@1` parser，增加显式 profile / 角色模型选择和日志脱敏测试。
- 为 runner 增加 vector/channel mode 解析、预检结果和 run metadata。

完成门槛：无需打开应用即可验证 fixture round-trip；关键 embedding/orchestrator 正常与失败分支可重复运行。

### Phase 2：Recall 真实窗口主流程

- 增加 Recall 稳定 selectors。
- 使用正式 IPC 完成 Recall fixture setup。
- 从 UI 触发向量化与 semantic search。
- 断言至少一次文档 embedding、一次 query embedding、向量状态和稳定排名。

完成门槛：`test:tauri:e2e:recall` 在全新隔离数据根中无需人工点击即可通过。

### Phase 3：预置 Agent、Chat 与会话恢复

- 预置带 Recall binding 的 Agent 和 session。
- 验证 Agent 编辑器回读 binding。
- 从预置会话发送消息，验证 Recall 注入和模型请求。
- 增加同数据根二次 Tauri 启动。

完成门槛：首次运行和重启恢复都不依赖测试间共享内存变量。

### Phase 4：真实 Ollama lane

- 增加 `/api/tags` + `/v1/embeddings` 预检。
- 动态写入模型 ID 和维度。
- 复用 Phase 2/3 场景，以相对排名断言替代 mock 精确分数。
- 在 README 中记录显式安装/运行前提和 skip/fail 规则。

完成门槛：本机 `lmstudio-nomic-embed-text:q4_k_m` 与 `mxbai-embed-large:latest` 至少各完成一次全流程记录；常规测试在无 Ollama 环境仍完全可运行。

---

## 10. 完成定义

本计划完成时必须同时满足：

1. Recall 关键路径不再依赖人工建 Agent、选模型、建会话和重复录入语料。
2. 默认 E2E 能拿出应用实际发送 `/v1/embeddings` 的请求证据，而不只是对 mock server 自行 `fetch`。
3. 向量写入、查询向量、检索结果和 Chat 注入形成一条可追踪链路。
4. Agent/session fixture 有版本、builder、校验和重启 round-trip。
5. 真实 Ollama lane 与 deterministic lane 明确分离，不发生静默降级。
6. 私有渠道文件保持 Git ignored；未显式选择 channel 时不会发起任何真实或付费请求。
7. 前端改动通过 Recall Vitest、类型检查和 Vite build；Rust 改动通过定向单测与 backend check；真实流程通过 Tauri WebView 验证。
