# Recall 计划文档索引

## 当前施工入口

- [`recall-knowledge-domain-restructure-implementation-plan.md`](recall-knowledge-domain-restructure-implementation-plan.md)：跨 Recall / Knowledge 重构的统一状态与发布门禁。
- [`recall-knowledge-final-manual-verification.md`](recall-knowledge-final-manual-verification.md)：最终真实 Tauri、迁移和发布验收清单。
- [`recall-knowledge-migration-report-sample.md`](recall-knowledge-migration-report-sample.md)：待接入生产态 Recall / Agent 合并报告的结构样例。

## 后续设计提案

- [`recall-retrieval-pipeline-modularization-plan.md`](recall-retrieval-pipeline-modularization-plan.md)：将 Keyword、Vector、Lens、Blender 和产品 facade 重构为阶段化检索模块，以预设配置组合纯算法召回与综合召回。当前检索管线尚未施工，但旧行为基线、真实窗口 runner 和验收 lane 等测试前置已部分具备。

## 已完成的测试基础设施

- [`recall-automated-real-vector-testing-plan.md`](recall-automated-real-vector-testing-plan.md)：Phase 1 至 Phase 5 与测试入口收口已完成。已覆盖确定性 Chat/Embedding、Recall 向量与语义检索、Agent 注入、同数据根进程恢复、外部语料、真实 Ollama 和具名 Tauri E2E preset；这些资产可被后续检索管线施工复用，但当前仍验收旧引擎路径。

当前剩余工作集中在首次启动迁移接线、真实目录副本验证、合并迁移报告、Knowledge 固定跨模块回归和发布二进制 smoke test。代码施工与自动化工程检查已完成，不应从归档文档恢复旧 Knowledge processor、检索占位符或 mixed RRF 方案。

## 历史文档

已完成或已被现行契约替代的计划和调查位于 [`Archived/`](Archived/README.md)，只用于追溯，不作为施工依据。
