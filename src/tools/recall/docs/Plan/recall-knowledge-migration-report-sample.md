# Recall / Knowledge 迁移报告样例

**状态**: 活动发布门禁；样例结构已完成，生产态 Recall / Agent 合并报告与最终发布验证待完成
**最近修订**: 2026-07-19

> 本文件是结构和恢复文案样例，不代表本机真实用户数据。施工期不得扫描真实用户 appData。

```text
迁移 ID: 2026-07-17T22:00:00+08:00
源格式: legacy-file-system-v1
状态: completed_with_rebuild_required

源集合数 / 已迁移集合数: 3 / 3
源条目数 / 已迁移条目数 / 跳过条目数: 128 / 127 / 1
向量模型数 / 已迁移向量数 / 待重建向量数: 2 / 240 / 14
标签向量数: 86
已迁移 Agent binding 数: 5
检测到旧占位符的 Agent 列表:
- research-assistant: {{kb}}, 【knowledge::Research::8】
- code-reviewer: 【kb::Engineering】

旧数据目录位置: <appData>/knowledge
目标数据库:
- <appData>/recall/recall.db
- <appData>/recall/recall-vectors.db

问题:
- collection=archive, entry=broken-entry.json: JSON 损坏，已跳过并保留源文件
- model=text-embedding-v1: 14 个向量维度不一致，标记为待重建

恢复说明:
1. 退出 AIO Hub。
2. 保留并备份旧数据目录，不要手工合并 SQLite 文件。
3. 备份目标 recall.db 与 recall-vectors.db 后，通过迁移/备份恢复入口重新执行。
4. 在集合数、条目数、向量覆盖率和固定查询回归全部通过前，不确认清理旧目录。
```

最终发布版本应从 `RecallMigrationReport` 和 Agent migration report 生成同结构内容，并提供导出操作；不得用本样例中的数字代替真实统计。
