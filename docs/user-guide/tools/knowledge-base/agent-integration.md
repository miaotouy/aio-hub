# Agent 集成

Knowledge 通过独立的 `knowledgeAccess` 接入 Agent。配置只保存稳定的资料库 ID 和能力权限；资料库名称、说明、来源数量与可用状态在运行时解析。

## 资料访问权限

`knowledgeAccess` 包含：

- `enabled`：是否允许 Agent 使用 Knowledge。
- `allowedLibraryIds`：允许访问的稳定资料库 ID。
- `allowSearchAll`：调用未指定资料库时，是否允许搜索全部已授权库。
- `allowDocumentRead`：是否允许从检索命中继续读取文档局部。
- `allowResearch`：是否允许启动高成本研究任务。

授权不等于自动查询。Agent 获得权限后，普通消息不会因此增加 Knowledge 检索或 Embedding 调用。

## 资料库目录宏

`{{knowledge_list}}` 在用户放置它的预设消息位置展开已授权资料库目录，内容包含稳定 ID、当前名称、说明、来源数量和可用状态。资料库改名后会显示新名称；已删除或暂时不可用的授权不会静默消失。

该宏只列目录，不读取 chunk、不执行检索，也不会在宏缺失时自动选择位置注入。

## 主动检索

Knowledge 的检索参数属于单次工具调用，而不是 Agent 授权属性。查询前必须经过当前 Agent 的权限校验；未授权、已删除或不可用的资料库会返回明确错误，不会静默改搜其他库。

Agent 可以使用三个独立工具：

- `knowledge.listLibraries`：查看当前授权库、来源数量、索引状态和可用检索能力。
- `knowledge.search`：按 `auto`、`keyword`、`semantic` 或 `hybrid` 快速搜索，支持文档、来源类型和路径过滤，并返回实际策略与降级原因。
- `knowledge.read`：按 chunk、chunk 邻域、heading 或字符范围继续读取证据；必须提供字符预算，且需要 `allowDocumentRead` 权限。

多库使用不同 Embedding 空间时会分别生成候选，只在排名层融合；返回值保留原始 score 和 signals，不把不同策略的分数展示为统一准确率。现有上层 Retrieval 组合能力使用同一权限校验，不能绕过 `knowledgeAccess`。

## 已移除的阶段性语法

当前开发周期曾短暂实现 `{{knowledge}}` 和 `【knowledge::...】` 检索占位符，但该路径未随正式版本发布，现已移除。预设编辑器、导入导出和上下文处理管道不再生成或解析这些语法。

Recall 的 `{{recall}}` / `【recall::...】` 是独立的思绪召回协议，不代表 Knowledge 仍支持同形占位符。
