# Knowledge 资料处理器

源码：[`knowledge-processor.ts`](../../../core/context-processors/knowledge-processor.ts)

`primary:knowledge-processor` 在 Recall processor 之后运行，只扫描非 `session_history` 消息中的 Knowledge 信封。共享 tokenizer 只登记 `recall` / `knowledge` namespace，随后由 Knowledge parser 独立校验参数。

## 协议

```text
【knowledge】
【knowledge::library=<library-id>::strategy=hybrid::limit=8::min-score=0.35::when=always::citation=true】
```

允许参数只有 `library`、`strategy`、`limit`、`min-score`、`when`、`citation`。目标必须是当前 Agent 已启用的稳定 library ID；第一阶段只接受 `when=always`。Recall 参数、未知参数、重复 key、非法值和历史位置参数均记录带消息索引、原文与 key 的诊断，不触发检索。

## 配置与执行

- `knowledgeConfig` 管理 binding、启用状态和保底注入位置。
- `knowledgeSettings` 管理默认 strategy、limit、minScore、字数上限、citation 和空结果文本。
- 显式占位符覆盖 binding 默认，再覆盖域默认。
- `{{knowledge}}` 按已启用 binding 生成 canonical 占位符；`{{knowledge_list}}` 输出显示名和稳定 ID。
- 结果注入可附带 library、title、heading、source path 与 chunk index，并把完整来源、signals 和 score 写入 context log。

Knowledge processor 不读取 Recall binding、entry、tag pool 或 workspace，也不注册 `【mixed】`；跨域融合只由主动 retrieval router 完成。
