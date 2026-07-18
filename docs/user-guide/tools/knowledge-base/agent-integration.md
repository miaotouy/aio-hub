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

独立的 `knowledge.listLibraries`、`knowledge.search` 和 `knowledge.read` 工具按施工阶段接入。现有上层 Retrieval 组合能力不改变 Knowledge 的授权边界，也不会恢复被动检索占位符。

## 已移除的阶段性语法

当前开发周期曾短暂实现 `{{knowledge}}` 和 `【knowledge::...】` 检索占位符，但该路径未随正式版本发布，现已移除。预设编辑器、导入导出和上下文处理管道不再生成或解析这些语法。

Recall 的 `{{recall}}` / `【recall::...】` 是独立的思绪召回协议，不代表 Knowledge 仍支持同形占位符。
