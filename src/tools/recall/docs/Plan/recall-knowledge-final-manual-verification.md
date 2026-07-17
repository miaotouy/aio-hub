# Recall / Knowledge 最终人工验证

以下操作必须使用独立临时 appData 或真实用户目录副本；不得直接指向当前真实用户目录。

## Tauri smoke

- 启动真实 `tauri dev` 窗口，确认 Recall 与 Knowledge 分别初始化且互不创建对方数据。
- 通过原生文件对话框导入 PDF、DOCX、HTML、Markdown、TXT 和代码文件，核对页文本、标题、字符编码与失败提示。
- 重启应用后验证 library/document/chunk 数量、BM25、semantic/hybrid、来源路径、heading 和 chunk index。
- 删除单文档与单 library，确认 FTS、向量、graph 和文件组均清理，Recall 数据不变。

## Agent 与 Chat

- 新建、编辑、导入、导出 Agent，验证 Recall / Knowledge binding 数量和稳定 ID 不变。
- 在同一预设中放置两个域的多个占位符，检查未授权 ID、跨域参数、历史位置参数和旧宏只产生诊断，不触发检索。
- 验证 `{{recall}}`、`{{recall_list}}`、`{{knowledge}}`、`{{knowledge_list}}` 展开和 context analyzer 来源元数据。
- 使用真实 embedding profile 验证 Knowledge 向量化、auto 到 hybrid 的升级，以及 mixed 分域配额与 RRF trace。

## 发布迁移

- 对真实用户目录副本执行首次启动幂等迁移、中断续跑、重启恢复和失败回滚。
- 导出迁移报告并核对集合、条目、向量、标签、Agent binding 和旧占位符统计。
- 在用户确认前保持旧目录只读可恢复；确认清理后再次启动并验证 Recall/Knowledge 数据完整。
