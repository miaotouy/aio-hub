# Recall / Knowledge 最终人工验证

**状态**: 待执行；0 / 12 项已记录完成。已有分散 Tauri 证据不等于本清单的一次性发布回归
**最近修订**: 2026-07-19

以下操作必须使用独立临时 appData 或真实用户目录副本；不得直接指向当前真实用户目录。

> Recall 与 Knowledge 的代码施工和自动化工程检查已经完成。当前 Knowledge 契约是“访问授权 + `{{knowledge_list}}` 只读目录宏 + `knowledge.*` 主动工具 + 结构化 `KnowledgeReference`”；不再验证 `{{knowledge}}`、`【knowledge::...】`、Knowledge 自动注入或 mixed RRF。下列项目必须在同一隔离版本和数据根上形成完整证据后才能勾选。

## 测试数据目录准备

开发启动支持用 `AIO_DATA_DIR` 指向一个完整的 appData 根目录。该配置会传入真实 Tauri 进程，并覆盖默认用户目录；不要仅复制 `recall/` 或旧 `knowledge/` 子目录，因为迁移验收还依赖 Agent、预设、模型和应用配置。

1. 完全退出所有 AIO Hub 实例，包括系统托盘中的进程，避免复制到不一致的 SQLite / 配置文件快照。
2. 新建一个专用测试目录。需要验证发布迁移时，将当前真实用户 appData 的**完整内容**复制进去；验证空目录首次启动时则保持目录为空。
3. 在仓库根目录的 `.env.local` 中配置测试副本，例如：

   ```dotenv
   AIO_DATA_DIR=E:/aiohub-test-data/recall-knowledge-verification
   AIO_ID_SUFFIX=
   ```

   `AIO_DATA_DIR` 可以是绝对路径，也可以是相对于仓库根目录的路径；它的优先级高于 `AIO_ID_SUFFIX`。如果还需要并行实例的端口和应用标识隔离，可以保留非空的 `AIO_ID_SUFFIX`，但数据仍以 `AIO_DATA_DIR` 为准。

4. 执行 `bun run dev` 启动真实 Tauri 窗口。启动输出中的“数据目录”必须是测试副本的绝对路径；不一致时立即退出，不得继续验收。
5. 验收结束后退出应用，再归档或删除测试副本。不要把测试期间产生的数据反向覆盖到真实用户目录。

也可以只对当前终端临时设置 `AIO_DATA_DIR` 后执行 `bun run dev`。已构建的应用可使用 `--data-dir <目录>` 启动；两种方式都把参数指定的目录视为最终 appData 根目录。

## Tauri smoke

- [ ] 启动真实 `tauri dev` 窗口，确认 Recall 与 Knowledge 分别初始化且互不创建对方数据。
- [ ] 通过原生文件对话框导入 PDF、DOCX、HTML、Markdown、TXT 和代码文件，核对页文本、标题、字符编码与失败提示。
- [ ] 重启应用后验证 library/document/chunk 数量、BM25、semantic/hybrid、来源路径、heading 和 chunk index。
- [ ] 删除单文档与单 library，确认 FTS、向量、graph 和文件组均清理，Recall 数据不变。

## Agent 与 Chat

- [ ] 新建、编辑、复制、导入和导出 Agent，验证 Recall binding 与 Knowledge `knowledgeAccess` 的稳定 ID、能力权限和工具权限往返不变。
- [ ] 验证 `{{recall}}` / `{{recall_list}}` 正常工作，`{{knowledge_list}}` 只在预设指定位置列出授权目录且不触发检索；旧 `{{kb}}`、`{{knowledge}}`、`【kb】` 和 `【knowledge::...】` 只产生迁移诊断或按普通文本处理，不触发隐藏检索。
- [ ] 让 Agent 主动调用 `knowledge.listLibraries`、`knowledge.search` 和 `knowledge.read`，检查授权、越权错误、工具事件、继续阅读预算和来源链路。
- [ ] 从 Chat 输入区分别执行 Knowledge 快速查询与研究任务，验证引用持久化、进度、取消、证据、历史恢复；没有 `KnowledgeReference` 的普通消息不得产生 Knowledge 调用。
- [ ] 使用真实 embedding profile 验证 Knowledge `auto` 对 keyword/semantic/hybrid 的选择和降级，以及 Recall semantic/associative 检索；组合任务由上层显式编排并保留独立领域与来源标识。

## 发布迁移

- [ ] 对真实用户目录副本执行首次启动幂等迁移、中断续跑、重启恢复和失败回滚。
- [ ] 导出生产态 Recall / Agent 合并迁移报告，核对集合、条目、向量、标签、Recall binding、Knowledge 访问授权和旧占位符统计。
- [ ] 在用户确认前保持旧目录只读可恢复；确认清理后再次启动并验证 Recall/Knowledge 数据完整。
