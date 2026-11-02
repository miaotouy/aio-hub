# Retrieval（统一检索门面）架构说明

> 状态：Active | 最后更新：2026-10-18
> 关联模块：`src/tools/retrieval`、`src/services/retrievalRouter`、`src/tools/recall`、`src/tools/knowledge-base`
> 相关架构：[Recall（思绪）架构](../recall/ARCHITECTURE.md)、[Knowledge（知识资料库）架构](../knowledge-base/ARCHITECTURE.md)

---

## 1. 模块定位

`retrieval` 是纯服务注册模块，不含任何 UI、store 或领域实现。目录内只有 `retrieval.registry.ts` 与对应测试，职责是把 Recall（思绪）与 Knowledge（知识资料库）两个独立检索域封装成一个面向 Agent 的统一检索工具门面：

- 通过 `export default retrievalRegistry` 注册为 `ToolRegistry`（id `retrieval`，名称「检索」），由 `src/services/auto-register.ts` 的 `import.meta.glob("../tools/**/*.registry.ts")` 自动扫描注册；
- 注册元数据只暴露一个 `agentCallable: true` 的方法 `search`，即 Agent 可调用的统一检索入口；
- 真实检索逻辑委托给 `src/services/retrievalRouter.ts` 的 `routeRetrieval()`，后者再调用 Recall 域的 `searchWithCache()`（`src/tools/recall/services/api.ts`）与 Knowledge 域的 `searchKnowledge()`（`src/tools/knowledge-base/services/service.ts`）。本模块不直接接触任一域的内部 store 或 pipeline。

## 2. 三种检索模式与参数契约

`buildRetrievalRequest()` 把工具入参归一化为 `RetrievalRouterRequest`：

- **mode**：`recall` / `knowledge` / `mixed`。省略时按 ID 推断：`recallIds` 与 `libraryIds` 均非空 → `mixed`；仅 `libraryIds` → `knowledge`；否则 → `recall`。
- **query**：必填，trim 后非空。
- **recall 域参数**（`mode !== "knowledge"` 时下发）：`recallIds`（限定思绪集稳定 ID）、`tags`（标签过滤）、`recallProfile`（`semantic` / `associative`，默认 `semantic`）、`minScore`。
- **knowledge 域参数**（`mode !== "recall"` 时下发）：`libraryIds`（限定资料库稳定 ID）、`knowledgeStrategy`（`auto` / `keyword` / `semantic` / `hybrid`，默认 `auto`）、`limit`、`minScore`。
- **公共数值参数**：`limit` 默认 8，范围 1–100；`minScore` 默认 0，范围 0–1；`recallQuota` 默认 `ceil(limit/2)`、`knowledgeQuota` 默认 `floor(limit/2)`，范围均 0–100。
- **VCP 归一化**：数组类参数（`recallIds`、`libraryIds`、`tags`）接受字符串数组、JSON 数组文本或逗号分隔文本；数值参数接受字符串形式，非法枚举或越界直接抛错。

## 3. 执行与返回值结构

`executeRetrieval()` 流程：归一化请求 →（涉及 Knowledge 时先做 Agent 授权，见第 4 节）→ `routeRetrieval()`。

`routeRetrieval()` 的分发行为：

- **recall**：调用 `searchWithCache()`，结果裁剪到 `limit`，`fusionMethod` 为 `single-domain`；
- **knowledge**：调用 `searchKnowledge()`，同上；
- **mixed**：两域按各自配额并行检索，`mapRecall` / `mapKnowledge` 统一封装后按 RRF 分数（`rrfScore = 1 / (60 + domainRank)`）排序，取前 `limit` 条，`fusionMethod` 为 `rrf`。

返回 `RetrievalRouterResponse`：

```text
{
  mode: "recall" | "knowledge" | "mixed",
  results: RoutedRetrievalResult[],
  quotas: { recall, knowledge },
  fusionMethod: "single-domain" | "rrf"
}
```

`RoutedRetrievalResult` 是两域结果的统一投影：

- 公共字段：`sourceType`（`recall` / `knowledge`）、`sourceId`（思绪集 ID 或资料库 ID）、`sourceName`、`itemId`（条目 ID 或 chunk ID）、`content`、`fusion` 融合溯源（`method`、`version: "retrieval-router-v1"`、`domainRank`、`rawScore`、可选 `rrfScore`）、`original`（原始 `RecallResult` 或 `KnowledgeResult`）；
- Knowledge 独有字段：`sourcePath`、`chunkIndex`、可选 `heading`。

## 4. Agent 授权边界

本模块自身不做权限判定，Knowledge 域授权完全复用 `src/tools/knowledge-base/services/application.ts` 的现有链路：

- **Recall-only（`mode: "recall"`）不需要 Agent 上下文**：无 `context` 时仍可执行，不触发授权检查；
- **凡涉及 Knowledge（`knowledge` / `mixed`）必须带 Agent 权限上下文**：`resolveKnowledgeApplicationContext(context)` 要求 `context.agent.id` 与 `context.agent.knowledgeAccess` 存在，否则抛 `KNOWLEDGE_DISABLED`（`KnowledgeAccessError`）；
- **资料库范围授权**：`authorizeKnowledgeLibraryScope()` → `resolveAuthorizedLibraryIds()`：
  - `knowledgeAccess.enabled` 为 `false` → `KNOWLEDGE_DISABLED`；
  - 未指定 `libraryIds` 且 `allowSearchAll` 为 `false` → `LIBRARY_ID_REQUIRED`；`allowSearchAll` 为 `true` 时返回 `allowedLibraryIds` 全集；
  - 显式指定的 `libraryIds` 必须全部在 `allowedLibraryIds` 内，否则 → `LIBRARY_UNAUTHORIZED`；
  - 通过后还需 `assertKnowledgeLibraryAvailable()` 校验库可用性（不存在、已删除、索引未就绪等分别报 `LIBRARY_UNAVAILABLE` / `LIBRARY_DELETED` / `LIBRARY_INDEX_NOT_READY`）；
- 授权解析后的 `libraryIds` 会**替换**请求原值再进入 router，即检索永远收敛到授权范围内的资料库集合。

`AgentKnowledgeAccess` 的默认值与字段语义（`enabled`、`allowedLibraryIds`、`allowSearchAll`、`allowDocumentRead`、`allowResearch`）定义于 `src/tools/knowledge-base/services/access.ts`，详见 Knowledge 架构文档。

## 5. 相关文档

- [Recall（思绪）架构](../recall/ARCHITECTURE.md)：Recall 域模型、检索管线与 `searchWithCache` 门面的背景；
- [Knowledge（知识资料库）架构](../knowledge-base/ARCHITECTURE.md)：Knowledge 域存储、索引、授权与 `searchKnowledge` 的背景；
- [工具注册指南](../../../docs/guide/tool-registry-guide.md)：`.registry.ts` 自动注册机制的通用说明。
