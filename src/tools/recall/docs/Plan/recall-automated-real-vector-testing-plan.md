# Recall 自动化测试、精简 OAI 渠道与真实向量请求实施计划

**状态**: 已完成（Phase 1、Phase 2、Phase 3、Phase 4、Phase 5 完成）

**创建日期**: 2026-07-20  
**最近修订**: 2026-07-20  
**适用范围**: `src/tools/recall/`、`src-tauri/src/recall/`、`src/tools/agent-manager/`、`src/tools/llm-chat/`、`tests/tauri-e2e/`

关联文档：

- [Recall 架构说明](../../ARCHITECTURE.md)
- [Recall 检索管线模块化设计与实施计划](./recall-retrieval-pipeline-modularization-plan.md)
- [工具测试指南](../../../../../docs/guide/tool-testing-guide.md)
- [Tauri E2E 说明](../../../../../tests/tauri-e2e/README.md)

> 本文解决的是测试装配与自动化覆盖问题，不改变 Recall / Knowledge 领域边界，也不把本机 Ollama 变成默认测试依赖。确定性本地 OpenAI-compatible 测试渠道同时承担 Chat 与 Embedding，是每次必跑的主通道；真实 Ollama 是显式启用的集成通道。

### 实施进度

2026-07-20 已完成 Phase 1：

- 建立版本化 Recall Chat scenario manifest，覆盖正向召回、空结果、binding 禁用、非流式响应，并为既有 Knowledge E2E 请求提供显式场景；
- OpenAI mock 已改为主题向量 + 未知输入稳定 hash，Embedding 默认输出归一化 8 维向量并保留批量顺序；
- Chat mock 已按最后一条用户 marker 唯一选场景，排除该定位消息后验证 required/forbidden evidence，缺失、冲突、未知场景和 stream 模式不符统一返回 422；
- `embedding-requests.jsonl` / `chat-requests.jsonl` 只落盘 hash、长度、topic/scenario、匹配状态和请求结果，原始 messages 只保留在 server 进程内；
- 新增独立 E2E support Vitest 配置和脚本，7 个 case 覆盖批量顺序、evidence 防伪、depth injection、SSE/JSON、fail-closed 与脱敏；
- 为 `core/embedding.ts`、`logic/orchestrator.ts`、`utils/vectorCache.ts` 新增 14 个定向 case；当前 Recall 定向 suite 为 12 个文件、45 个 case。
- 新增统一 Recall workflow manifest 与 seeder，预置稳定 Agent、空会话和历史会话；首次写入拒绝覆盖差异，重启 verify 只读核验引用并允许运行态消息与时间戳增长；
- 从显式 `.aio-kb` source allowlist 派生 12 条版本化 curated 技术语料，覆盖四个目标主题、近邻负例、hard negative 和同标题异内容，并以 archive/source/content hash、禁止词、绝对路径和长度测试约束更新；
- runner 已复用 `aiohub.llm-profiles@1` parser，实现显式 profile/Chat/Embedding 角色选择与脱敏 metadata；私有配置不会因文件存在而自动启用；
- 新增 Ollama `/api/tags` + `/v1/embeddings` 预检，动态记录模型维度，并区分默认 skip 与 `AIO_E2E_REQUIRE_OLLAMA=1` failure；本机首选模型预检得到 768 维；
- runner 已支持 `--vector-mode`、`--corpus-mode`、`--llm-profile`，默认 mock、Ollama mixed lane 和私有 lane 均生成显式角色与运行元数据；
- Phase 2 的 23 个稳定 Recall / Agent Recall / Chat selector 已补齐，并通过前端类型检查和 Vite build。
- 新增 lane-aware `recall-runtime-fixture.spec.ts`：按 `smoke` / `curated` 选择真实语料，通过正式 `recall_initialize`、`recall_save_base_meta`、`recall_upsert_entry`、`recall_load_base_meta` IPC 写入回读，并从 Recall UI 验证集合与条目可见；非默认 lane 不再执行硬编码 deterministic mock 的 Knowledge spec。
- `external-full` 现已通过显式 backup import 实现：未指定 `AIO_E2E_RECALL_SOURCE` 时明确 skip，指定后必须完成真实 inspect/import、UI 向量化和重启回读；runner 资源在正常退出、信号和启动期异常路径统一清理。
- Phase 2 新增独立 `recall-vector-workflow.spec.ts` 与 `test:tauri:e2e:recall(:curated)`：从可见 UI 触发全量向量化和 vector search，并交叉断言脱敏 HTTP request、IPC coverage、实际维度、entry model 状态、trace 与 UI 排名；smoke 6 条和 curated 18 条真实窗口流程均已通过。
- fixture seeder 现预置 lane-specific Recall workspace 模型与活动集合，verify 模式只核验引用；deterministic topic vector 同时覆盖 curated 标签与两类 hard negative 独立轴，稳定保留同标题异 ID 并阻止 hard negative 占据第一名。
- Phase 3 新增 `recall-chat-injection.spec.ts` 与 `recall-session-recovery.spec.ts`：从预置会话发送消息，交叉验证 query embedding、预期 top entry、Chat evidence、SSE UI 完成态和 session detail；显式空集合覆盖 no-result，故意缺失 evidence 时 mock 返回 422 且 UI/session 不得出现伪成功回复。
- runner 支持 `--restart-spec` 和必跑 scenario 清单：首个 WDIO 退出后以同一数据根、`AIO_E2E_FIXTURE_MODE=verify` 启动第二个 Tauri 进程；恢复用例回读 workspace 模型、向量 coverage/维度、Agent binding 和首启消息后再次完成 Recall Chat。
- `scenario-results.json` 已汇总四个必跑场景的 query embedding、top entry、Chat evidence、UI 回复和 session 回读；runner 会拒绝未消费场景、未知/意外 Chat 请求以及状态或 mismatch reason 不符。

Phase 4 已新增显式 `external-full` lane：runner 只接受 `AIO_E2E_RECALL_SOURCE` 指定的 `.aio-kb`，启动前只校验文件、SHA-256 与 ZIP 白名单；未指定源时明确 skip。首次 Tauri 进程使用正式 `recall_inspect_backup` / `recall_import_backup`，从可见 Recall UI 启动全量向量化，回读条目与向量覆盖；第二个同数据根进程回读集合、向量与维度且不重复导入。`recall-external-corpus.json` 只记录 hash、条目/进度/请求计数、耗时和状态，不记录路径、库名、正文或向量。

对已复核的 473 条样本，runner 会额外校验 archive hash、总条目数与少量 source entry ID 的导入/向量状态；它们用于防止导入漏项，不把外部语料的精确相似度或固定批次时序当作完成条件。

Phase 5 已完成：runner 新增 Chat `/v1/chat/completions` 预检与显式 full lane；Chat 使用真实 Ollama + Tauri Rust proxy，Embedding 使用真实 Ollama + 脱敏本地 JSON proxy，两个角色保持独立 Profile。真实 lane 使用 response-present / state-based 断言，不静默回退 mock；本机 `lmstudio-nomic-embed-text:q4_k_m`（768 维）与 `mxbai-embed-large:latest`（1024 维）均已完成向量化、Recall Chat、会话持久化和二次进程恢复。

---

## 1. 调研结论

### 1.1 当前已有能力

仓库已经具备可复用的真实窗口 E2E 基础设施：

- `tests/tauri-e2e/run.ts` 会生成隔离的 `AIO_DATA_DIR`，启动 Vite、debug Tauri binary 和本地 OpenAI-compatible HTTP mock。
- runner 已能在启动前写入 `llm-service/profiles.json`，同时提供 Chat 与 Embedding 模型。
- `tests/tauri-e2e/support/openai-mock.ts` 已实现 `/v1/models`、`/v1/embeddings` 和 `/v1/chat/completions`；Chat 同时支持普通 JSON 与 SSE 流式响应，并把请求摘要写入产物目录。
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
4. 现有 7 个 Tauri E2E case 没有覆盖 Recall；`knowledge-workflow.spec.ts` 只验证 mock 模型可见，没有验证应用实际发送过 embedding 或 Chat 请求。
5. E2E runner 只预置模型 Profile，没有统一的 Agent、Recall binding 和会话 fixture 契约。测试仍需逐项点击创建，耗时且难以复用。
6. 没有“同一隔离数据根二次启动”的恢复用例，无法自动证明 Agent binding、会话、条目向量和活动模型在重启后仍可用。
7. 现有 Chat mock 只是把最后一条消息截断后回显；即使 Recall 没有注入、注入了错误条目或请求走错 Agent，测试仍可能看到一条“成功回复”。请求摘要也只记录 `messageCount`，不能证明召回证据进入模型上下文。
8. 计划中的 3 至 5 条合成语料只能覆盖最小排序，尚未覆盖真实中文长文本、Markdown、重复标题、标签、批量向量化和旧 `.aio-kb` 导入。

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

### 1.5 “咕咕” `.aio-kb` 样本审计

已检查 `E:\rc20\allinweb\test\咕咕_f6e7dcb3-e996-4bc9-8db7-b8d7fb431617_2026-07-17.aio-kb`：

- 文件为 593,161 bytes 的 ZIP，包含 `manifest.json` 与 `library.json`；
- manifest 为 `aiohub.knowledge-library` v1，由 AIO Hub `0.6.6-beta.2` 导出；当前文件 SHA-256 为 `aac7dcae4edc1a7551bed31c51b7f42c66b7a2c37bc0a96fbb96902a1c29f5a0`；
- `library.json` 同时保存条目索引与正文，共 473 条，当前备份未包含已生成向量；
- 内容包含中文长文本、Markdown、标签、重复标题和多类主题，适合验证导入、批量向量化、语义区分与重启恢复；
- 可作为精选 fixture 来源的技术条目包括“渲染引擎 V2”“工具目录结构重构”“内存计算加速层”和“Base64 图片解码故障”等，主题之间既有关联又有可辨识差异。

该文件位于仓库外，且可能包含不适合直接提交的个人内容，因此不能成为默认 CI 的硬依赖。默认通道只提交经过人工复核、最小化和脱敏的派生条目；完整 473 条语料仅在显式本地 corpus lane 中从原文件通过正式导入 command 加载。

---

## 2. 目标与非目标

### 2.1 目标

1. 每次 Tauri E2E 都通过真实 HTTP 和 Tauri native network 发起确定性的 embedding 与 Chat 请求。
2. 用预设响应验证 `用户输入 -> Recall 检索 -> 上下文注入 -> Chat completion -> 流式 UI -> 会话落盘` 的完整链路，而不是只验证模型 endpoint 可达。
3. 可选地让同一套 Recall 场景转接到本机 Ollama，验证真实模型推理、输出维度和语义排序。
4. 启动前预置稳定 ID 的模型 Profile、Agent、Recall binding、会话和多层语料，减少重复 UI 装配。
5. 通过正式 Recall commands 准备集合与条目或导入 `.aio-kb`，不直接拼 SQLite schema，也不恢复旧 Knowledge 目录作为测试捷径。
6. 自动覆盖建集、条目写入、向量化、查询向量、检索、Agent 注入、Chat 回复、会话恢复和重启持久化。
7. 失败时保留可诊断但不泄露密钥/正文的请求摘要、截图、前后端日志和运行元数据。

### 2.2 非目标

- 不让 PR 测试依赖开发者已安装 Ollama、GPU 或某个远程 API Key。
- 不在测试启动时自动 `ollama pull`；下载模型是有副作用且耗时的显式准备动作。
- 不通过直接写 `recall.db` / `recall-vectors.db` 绕开 repository 和 migration。
- 不把仓库外的“咕咕”备份复制进仓库，也不把其中未经复核的个人正文上传为 CI artifact。
- 不把 deterministic mock 的排序结果称为模型质量结论。
- 不把根据最后一条用户消息直接返回固定文本当成 Recall 注入已通过；预设回复必须有可验证的请求匹配条件。
- 不要求用一个大 E2E case 覆盖所有错误分支；超时、重试、批量降级等仍由 Vitest 负责。

---

## 3. 测试通道设计

### 3.1 通道 A：精简 OpenAI-compatible 测试渠道，默认必跑

保留现有 `E2E Local Mock` Profile 和单个 localhost server，但把它从“模型列表 smoke + 回显”提升为同时服务 Embedding 与 Chat 的场景驱动测试渠道：

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

Chat UI
  -> RecallProcessor / resolvePlaceholderRetrieval
  -> 把命中条目渲染进模型上下文
  -> @aiohub/llm-core request builder
  -> desktopLlmTransport
  -> Tauri native HTTP command
  -> 127.0.0.1 /v1/chat/completions
  -> 预设 SSE chunks
  -> Chat 消息树与 session detail 落盘
```

mock 向量不能继续只依赖字符串长度。应为固定 fixture 主题生成可区分、归一化的 8 或 16 维向量，并对未知输入使用稳定 hash，确保：

- “Rust ownership / borrow checker” 查询稳定命中 Rust 条目第一名；
- “banana bread” 不会排到 Rust 条目前面；
- 批量输入的返回顺序与 `index` 正确；
- 文档向量请求和查询向量请求都能从请求摘要中区分。

此通道证明真实 transport、endpoint、IPC、持久化和检索流程可用，但不证明真实模型质量。

### 3.2 Chat 预设响应契约

`openai-mock.ts` 不继续扩展成按条件散落 `if` 的脚本。新增版本化 `tests/tauri-e2e/fixtures/recall-scenarios.ts`，server 启动时读取场景定义，并为每个 Chat 请求选择且只选择一个匹配场景：

```typescript
interface RecallChatScenario {
  id: string;
  userMarker: string;
  expectedStream?: boolean;
  requiredEvidence?: Array<{
    entryId: string;
    contentMarker: string;
  }>;
  requiredContextMarkers?: string[];
  forbiddenEvidence?: string[];
  response: {
    chunks: string[];
    finishReason: "stop";
  };
  expected: {
    embeddingRequests: number;
    topEntryId?: string;
  };
}
```

匹配和失败规则：

1. E2E 用户输入包含不展示给普通用户的稳定 marker，例如 `[e2e:recall-renderer-v2]`；mock 用 marker 定位场景，但不能仅凭 marker 判定成功。
2. mock 必须在 Recall processor 处理后的上下文消息中找到每项 `requiredEvidence.contentMarker`，但用于定位场景的最后一条用户消息不得参与 evidence 匹配，避免用户直接复述 marker 造成假通过。不能简单限定为 `role !== "user"`：当前 `RecallProcessor` 在没有可复用 system message 时会把自动占位符插入为最后一条用户消息之前的 `depth_injection` user message。默认 Recall 注入格式不包含 entry ID，因此 `entryId` 用于把 matcher 结果与 Recall 搜索回读的实际 top entry 交叉关联，不能要求它出现在 Chat prompt 中。
3. 请求出现 `forbiddenEvidence`、缺少必需证据、命中多个场景或没有命中场景时，返回结构化 422，并把 mismatch 原因写入脱敏日志；禁止回退到通用成功回复。
4. 场景可用 `expectedStream` 约束请求模式；正常路径按 2 至 4 个 SSE delta 返回固定答案，覆盖流式拼接，另保留一个 `expectedStream: false` 场景覆盖普通 Chat completion。请求模式不匹配时返回 422，不能由 server 自动改写请求语义。
5. 预设答案要引用一个只有召回条目中存在的事实，例如“重型组件初始化是停顿点”，UI 断言完整答案，不能只断言出现 Assistant 气泡。
6. mock 收到的原始 messages 只保存在进程内供当前 spec 断言；落盘证据仅记录 role、content hash、content length、命中的 scenario ID、关联的 expected entry IDs、content marker 命中结果和 SSE chunk 数，不保存完整私有正文。

首批预设场景至少包括：

| 场景                  | 请求条件                                                     | 预设响应重点                           | 证明内容                      |
| --------------------- | ------------------------------------------------------------ | -------------------------------------- | ----------------------------- |
| `renderer-positive`   | 命中渲染引擎条目，禁止 Base64 故障条目                       | 停顿点来自重型组件初始化               | 正向检索、排他注入、SSE       |
| `base64-positive`     | 命中 Base64 故障条目，禁止渲染架构条目                       | 检查畸形 data URL 与原始请求体         | 近邻技术主题仍能正确区分      |
| `memory-ownership`    | 命中内存计算加速条目                                         | 前端持有数据，Rust 副本用于计算加速    | 中文问法与长正文注入          |
| `no-result`           | 上下文包含 fixture 的固定 `emptyText`，且不含任何条目 marker | 明确回答没有可用召回内容               | 空结果不是假命中              |
| `binding-disabled`    | 禁止所有 Recall marker                                       | 明确回答本轮未注入 Recall              | Agent binding 开关生效        |
| `non-stream-response` | 命中工具目录结构条目，且 `stream: false`                     | 返回 core/logic/config/stores 拆分摘要 | 非流式 Chat completion 与落盘 |

测试通过必须同时具备四类证据：query embedding 请求、预期条目排名、Chat 请求 evidence match、最终 Assistant 文本与 session detail 一致。任意一项缺失都不能由其他项替代。

### 3.3 通道 B：真实 Ollama，显式 opt-in

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

### 3.4 私有开发渠道：从 Git 忽略配置注入

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

### 3.5 所有通道必须共享场景

mock、Ollama 和私有渠道只替换 Profile、角色模型与期望策略，不复制多套业务脚本。共享场景参数至少包括：

```typescript
interface RecallE2eLane {
  chatProfileId: string;
  chatModelId: string;
  embeddingProfileId: string;
  embeddingModelId: string;
  embeddingModelCombo: string;
  expectedDimension: number;
  rankingMode: "exact" | "relative";
  chatExpectation: "preset-exact" | "response-present";
  requestEvidence: "mock-log" | "proxy-log-and-state" | "tauri-log-and-state";
  corpusMode: "smoke" | "curated" | "external-full";
}
```

默认 mock lane 使用 `preset-exact`，从而精确证明注入；真实 Chat 模型只使用 `response-present`，因为不能要求其逐字输出预设答案。若 Ollama lane 只配置 Embedding，则 runner 同时写入 Ollama Embedding profile 与本地 mock Chat profile，Agent 和 Recall workspace 分别引用对应 profile；run metadata 必须记录为 mixed lane，不能把 mock Chat 误报为真实模型验证。单个 profile 只有一个 `baseUrl`，不得用一个 profile ID 表示指向两个 endpoint 的 mixed lane。

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

- Recall 集合元数据、分层语料引用、查询、期望排名和 evidence marker；
- Agent 的 `profileId` / `modelId`、`recallConfig.bindings`、`recallSettings`；
- 至少一个包含 `{{recall}}` 的 preset message；
- 至少两个 Chat 场景：命中召回后的预设回复、无结果时的预设回复；
- 一个可恢复的空会话，以及一个包含既有用户/助手节点的会话；
- fixture schema version，供格式变化时显式迁移。

fixture 只能写入 runner 已解析并校验过的隔离 `AIO_E2E_DATA_DIR`。显式数据目录仍沿用 `AIO_E2E_SEED_FIXTURES=1` 的 opt-in 保护。

### 4.2 分层 Recall 语料

不要让一个语料集同时承担最小链路、真实文本和压力测试。fixture 分为三层：

| 层级            | 内容                                                                 | 用途                                           | 默认执行 |
| --------------- | -------------------------------------------------------------------- | ---------------------------------------------- | -------- |
| `smoke`         | 6 至 8 条短合成语料，主题词与向量完全可控                            | 精确排序、空结果、禁用条目、模型隔离           | 是       |
| `curated`       | 10 至 16 条从“咕咕”备份精选、复核并脱敏的中文 Markdown 技术语料      | 真实长度、近义主题、标签、重复标题、Chat 注入  | 是       |
| `external-full` | 从显式 `AIO_E2E_RECALL_SOURCE` 导入完整 `.aio-kb`，当前样本为 473 条 | 批量向量化、旧格式导入、进度、持久化和性能基线 | opt-in   |

`curated` 首批建议覆盖以下主题，不直接把整份原文复制进 fixture：

- 渲染引擎 V2：查询“复杂 Markdown 流式渲染为何停顿”，预期召回“重型组件初始化”事实；
- 工具目录结构重构：查询“工具模块的 core/logic/config/stores 如何拆分”；
- 内存计算加速层：查询“Rust 内存副本和前端数据所有权的关系”；
- Base64 图片故障：查询“markdown base64 image data failed 的排查”；
- 至少两个非 AIO Hub 主题作为 hard negative；
- 保留一组同标题不同内容的条目，验证 ID 与 content hash，而不是按标题误判。

派生流程使用一个独立 Bun 脚本读取 ZIP/JSON，按允许列表提取指定 source entry ID，移除称谓、个人标识、绝对路径和无关段落，再生成稳定的新 fixture ID。脚本测试必须验证源条目数量、派生内容 hash、禁止词和最大字符数；版本化 fixture 不携带原备份路径。原文件更新不会自动改写 fixture，必须经过显式 review。

`external-full` 先调用 `recall_inspect_backup`，再使用 `recall_import_backup` 与 `{ conflictStrategy: "cancel" }`，不得由测试代码自行解压并直接写库。runner 在启动前只校验文件存在、扩展名、SHA-256 和 ZIP entry 白名单；应用启动后以 inspect command 的结果作为格式、条目数和冲突判断真源。导入后记录条目数、耗时与派生状态，不记录正文。二次启动不重复导入，只回读首次导入返回的 collection ID。没有设置 `AIO_E2E_RECALL_SOURCE` 时明确 skip，此 lane 不进入 PR 必跑集合。

### 4.3 启动前写入文件型配置

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
- Ollama 快捷模式：runner 根据预检结果生成 Ollama Embedding profile；若 Chat 仍使用 mock，则同时保留独立的 mock Chat profile。
- 私有渠道模式：runner 从 `aiohub.llm-profiles@1` 渠道包读取并校验显式选择的 profile，只复制该 profile。

Agent 的 Chat profile/model、Recall workspace 的 Embedding profile/model combo 和预期维度必须从 runner 解析后的角色模型派生，不能在 Agent/session fixture 中再次硬编码。

不要手写散落的 JSON 字符串。新增 `support/fixture-seeder.ts`，用共享 builder 生成索引项与详情，并增加 Vitest schema/round-trip 测试，确保：

- index 与 detail ID 一致；
- Agent 引用的 Profile、模型和 Recall ID 都存在于 manifest；
- session 的 `displayAgentId` 和消息节点 Agent ID 可解析；
- 时间戳固定，测试不依赖 `Date.now()` 排序；
- 写盘内容不包含 API Key、用户默认数据或绝对开发路径。

### 4.4 启动后通过正式 IPC 准备 Recall

Recall 使用 SQLite 真源，fixture setup 应在 Tauri 已启动后调用正式 production commands：

1. `recall_initialize`
2. `recall_save_base_meta`
3. 对每条 fixture 调用 `recall_upsert_entry`
4. `recall_load_base_meta` 回读并核对 ID/条目数

WDIO 封装一个 `invokeTauriCommand()` helper 作为测试 setup 和持久化断言入口。setup 可以直接调用 command；真正待验收的向量化、搜索和 Chat 注入必须从可见 UI 触发，不能用 command 冒充用户流程。

`smoke` / `curated` 逐条使用正式 commands 写入，以便稳定控制 ID；`external-full` 调用 `recall_import_backup`，并使用返回的实际 collection ID 更新本次 Agent binding。三种模式都必须从 command 回读数据，不能假设写入成功。

不直接写 SQLite 的原因：

- 避免复制 schema、BLOB 编码和 migration 版本；
- setup 本身也能覆盖 command 参数 camelCase 与 repository warmup；
- 后续 schema 演进时 fixture 不需要同步 SQL。

### 4.5 重启恢复

至少增加一个二阶段场景：

1. 第一次启动完成条目向量化，并在预置会话发送一次带 Recall 的消息，收到场景匹配的流式预设回复。
2. 结束应用但保留本次隔离 `dataDir`。
3. 第二次启动时关闭 fixture 重置，只允许幂等校验。
4. 断言预置 Agent、当前会话、Recall binding、条目 `vectorizedModels`、活动模型、检索结果、用户消息和完整 Assistant 回复仍存在。

重启用例要区分“刷新 WebView”和“重启 Tauri 进程”。前者可作为快速 case，后者才是 SQLite warmup 与文件持久化发布门槛。

---

## 5. 自动化场景矩阵

| 层级             | 场景                                   | 核心断言                                  | 默认执行 |
| ---------------- | -------------------------------------- | ----------------------------------------- | -------- |
| Vitest           | `generateVectors` 单条/批量            | request、顺序、usage 映射                 | 是       |
| Vitest           | retry/timeout/exponential backoff      | 次数、延迟、最终错误                      | 是       |
| Vitest           | 批量 400 降级单条                      | 成功项保留、失败项可诊断                  | 是       |
| Vitest           | IndexingOrchestrator                   | hash、cache、vector IPC、维度             | 是       |
| Vitest           | SearchOrchestrator / `searchWithCache` | query vector、模型隔离、cache key         | 是       |
| Rust             | repository vector round-trip           | BLOB、dimension、tokens、content hash     | 是       |
| Rust             | command + warmup                       | 保存后搜索、重启加载、模型隔离            | 是       |
| Tauri E2E mock   | 条目向量化                             | UI 成功、HTTP 请求、vectorized 状态       | 是       |
| Tauri E2E mock   | semantic search                        | 相关条目第一、trace/结果可见              | 是       |
| Tauri E2E mock   | 预置 Agent + 会话                      | 无需手建即可加载、binding 可见            | 是       |
| Tauri E2E mock   | Chat Recall 注入 + SSE                 | query embedding、evidence match、预设回复 | 是       |
| Tauri E2E mock   | 无召回 / 错误证据 fail-closed          | 空结果回复；缺证据时 mock 返回 422        | 是       |
| Tauri E2E mock   | curated 中文 Markdown corpus           | 近义主题、重复标题、hard negative         | 是       |
| Tauri E2E mock   | 二次启动恢复                           | Agent/session/vector/search/回复全部恢复  | 发布门槛 |
| Tauri E2E corpus | 外部 `.aio-kb` 全量导入与批量向量化    | 473 条样本导入、进度、重启、性能摘要      | opt-in   |
| Tauri E2E Ollama | 真实模型全流程                         | 实际维度、相对排名、持久化                | opt-in   |

建议把 Tauri E2E 拆成独立 spec，避免依赖 `knowledge-workflow.spec.ts` 的内存变量和执行顺序：

```text
tests/tauri-e2e/specs/recall-vector-workflow.spec.ts
tests/tauri-e2e/specs/recall-chat-injection.spec.ts
tests/tauri-e2e/specs/recall-session-recovery.spec.ts
tests/tauri-e2e/specs/recall-external-corpus.spec.ts
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
chat-message-role
chat-message-status
```

动态项同时提供稳定数据属性，例如 `data-recall-id`、`data-entry-id`、`data-agent-id`、`data-message-id`、`data-message-role` 和 `data-message-status`。selector 不依赖中文文案、Element Plus 内部 class、列表序号或屏幕坐标。现有消息组件已有 `data-message-id`，实现时优先扩展该节点，不新增平行 wrapper。

---

## 7. 请求证据与产物

每次运行在 artifact 目录保留：

```text
e2e-run.json
embedding-requests.jsonl
chat-requests.jsonl
scenario-results.json
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

`chat-requests.jsonl` 只记录：

- request ID、model、stream、message role 序列和每段 content 的 hash/length；
- 匹配的 scenario ID、required/forbidden evidence 命中结果；
- HTTP status、SSE chunk 数、finish reason 和耗时。

`scenario-results.json` 汇总每个场景的 query embedding、top entry、Chat evidence、UI 回复和 session 回读五项状态。测试结束时 server 还必须断言不存在未消费的必跑场景，也不存在意外 Chat 请求。

禁止记录 Authorization、API Key、完整私有 profile 和完整向量。mock 通道直接由本地 server 产出证据；Ollama/私有渠道至少记录 runner 预检、应用请求关联 ID 和应用回读状态。若后续需要证明应用请求确实到达目标端点，可在 runner 中增加仅监听本机的转发记录器，再把 Profile base URL 指向该转发器。包含 `profiles.json` 的完整隔离 dataDir 不能作为 CI artifact 上传，只允许上传经过白名单筛选和脱敏的 artifact 目录。

---

## 8. 脚本与执行策略

建议新增脚本：

```json
{
  "test:tauri:e2e:recall": "bun tests/tauri-e2e/run.ts --spec tests/tauri-e2e/specs/recall-vector-workflow.spec.ts",
  "test:tauri:e2e:recall:chat": "bun tests/tauri-e2e/run.ts --spec tests/tauri-e2e/specs/recall-chat-injection.spec.ts --restart-spec tests/tauri-e2e/specs/recall-session-recovery.spec.ts --required-scenarios renderer-positive,no-result,missing-evidence-fail-closed,memory-ownership",
  "test:tauri:e2e:recall:corpus": "bun tests/tauri-e2e/run.ts --corpus-mode external-full --spec tests/tauri-e2e/specs/recall-external-corpus.spec.ts",
  "test:tauri:e2e:ollama": "bun tests/tauri-e2e/run.ts --vector-mode ollama --spec tests/tauri-e2e/specs/recall-vector-workflow.spec.ts",
  "test:tauri:e2e:real": "bun tests/tauri-e2e/run.ts --llm-profile"
}
```

根 Vitest 配置当前排除 `tests/tauri-e2e/**`。Phase 1 的 support/fixture 纯逻辑测试必须使用独立 `tests/tauri-e2e/vitest.config.ts` 与单独脚本入口，或移动到根配置会收集的测试目录；禁止只新增测试文件却让默认配置静默跳过。

执行分层：

- PR / 常规本地检查：Recall Vitest + Rust 定向测试 + smoke/curated deterministic Tauri E2E，包括预设 Chat 回复。
- 夜间或自托管机器：追加 Ollama lane；有显式 corpus 文件时再运行 external-full lane。
- 发布前：deterministic lane 的二次启动恢复必须通过；有 Ollama 的发布机再运行真实 lane。

不要让 Ollama lane 静默改用 mock。真实通道被请求后只能明确通过、明确跳过或明确失败，产物中必须写出最终模式和原因。

---

## 9. 分阶段实施

### Phase 1：测试装配与纯逻辑补齐

- 提取 fixture manifest、Agent/session builder 和 seeder。
- 建立 scenario manifest；把 OpenAI mock 改成 Chat/Embedding 共用的 fail-closed 场景服务，覆盖 JSON 与 SSE。
- 从“咕咕”备份提取并人工复核首批 curated 技术语料，增加脱敏、hash 和禁止词测试。
- 为 `core/embedding.ts`、`logic/orchestrator.ts`、vector cache 增加定向测试。
- 改进 OpenAI mock 的确定性主题向量、evidence matcher 与脱敏请求摘要。
- 复用 `aiohub.llm-profiles@1` parser，增加显式 profile / 角色模型选择和日志脱敏测试。
- 为 runner 增加 vector/channel mode 解析、预检结果和 run metadata。

完成门槛：无需打开应用即可验证 fixture round-trip、场景唯一匹配、缺失/错误 evidence 返回 422、SSE chunk 拼装以及 curated corpus 派生结果；关键 embedding/orchestrator 正常与失败分支可重复运行。

### Phase 2：Recall 真实窗口主流程

- 增加 Recall 稳定 selectors。
- 使用正式 IPC 完成 Recall fixture setup。
- 从 UI 触发向量化与 semantic search。
- 先跑 smoke 再跑 curated 语料，断言文档 embedding、query embedding、向量状态、稳定排名、重复标题 ID 和 hard negative。

完成门槛：`test:tauri:e2e:recall` 在全新隔离数据根中无需人工点击即可通过。

### Phase 3：预置 Agent、Chat 与会话恢复

- 预置带 Recall binding 的 Agent 和 session。
- 验证 Agent 编辑器回读 binding。
- 从预置会话发送消息，验证 Recall 注入 evidence、预设 SSE 回复、UI 完成态和 session detail 回读。
- 增加无结果预设回复和故意缺失 evidence 的 fail-closed 用例。
- 增加同数据根二次 Tauri 启动。

完成门槛：首次运行和重启恢复都不依赖测试间共享内存变量；仅有 Assistant 气泡但缺少请求 evidence 或 session 落盘时必须失败。

### Phase 4：外部完整 corpus lane

- 增加 `--corpus-mode external-full` 和 `AIO_E2E_RECALL_SOURCE` 显式参数。
- 通过 `recall_import_backup` 导入 `.aio-kb`，回读并核对 inspect/import report 与实际条目数。
- 从完整语料选择少量稳定 source entry ID 做检索断言，其余条目只参与批量向量化与压力覆盖。
- 记录总条目数、成功/失败数、批次、耗时、峰值进度与重启回读，不记录正文或完整向量。

完成门槛：当前“咕咕”样本可导入 473 条，批量流程无静默漏项；未提供外部文件时明确 skip，默认 lane 不受影响。

### Phase 5：真实 Ollama lane

- 增加 `/api/tags` + `/v1/embeddings` 预检。
- 增加 OpenAI-compatible `/v1/chat/completions` 非空响应预检，并允许显式选择 Chat 模型。
- 动态写入模型 ID 和维度。
- 复用 Phase 2/3 场景，以相对排名断言替代 mock 精确分数。
- Chat 与 Embedding 使用独立 Ollama Profile；Chat 通过 Tauri Rust proxy 验证真实请求，Embedding 通过脱敏 JSON proxy 记录 hash、长度、状态和维度。
- 在 README 中记录显式安装/运行前提、模型冷启动限制和 skip/fail 规则。

完成门槛：本机 `lmstudio-nomic-embed-text:q4_k_m` 与 `mxbai-embed-large:latest` 已各完成一次全流程记录；常规测试在无 Ollama 环境仍完全可运行。

---

## 10. 完成定义

本计划完成时必须同时满足：

1. Recall 关键路径不再依赖人工建 Agent、选模型、建会话和重复录入语料。
2. 默认 E2E 能拿出应用实际发送 `/v1/embeddings` 与 `/v1/chat/completions` 的请求证据，而不只是对 mock server 自行 `fetch`。
3. 向量写入、查询向量、检索结果、Chat evidence match、SSE 回复、UI 完成态和 session 落盘形成一条可追踪链路。
4. Chat mock 对缺失/错误召回证据 fail closed，不存在通用回显造成的假通过。
5. Agent/session/scenario/corpus fixture 有版本、builder、校验和重启 round-trip。
6. 默认测试含经过复核的真实中文派生语料；完整 `.aio-kb` 只通过显式外部 corpus lane 使用，仓库和 artifact 不泄露原始正文。
7. 真实 Ollama lane 与 deterministic lane 明确分离，不发生静默降级。
8. 私有渠道文件保持 Git ignored；未显式选择 channel 时不会发起任何真实或付费请求。
9. 前端改动通过 Recall Vitest、类型检查和 Vite build；Rust 改动通过定向单测与 backend check；真实流程通过 Tauri WebView 验证。
