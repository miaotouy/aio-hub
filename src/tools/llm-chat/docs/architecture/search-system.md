# 搜索系统

入口为 [`useLlmSearch`](../../composables/chat/useLlmSearch.ts)，通过 `search_llm_data_stream` 接收逐批结果，`cancel_llm_chat_search` 取消当前搜索。

- Tauri 后端：[llmchat_search.rs](../../../../../src-tauri/src/commands/llmchat_search.rs)。
- Electron 后端：[llm-search.ts](../../../../../electron/llm-search.ts)，Channel 桥：[channel.ts](../../../../platform/electron/channel.ts)。

## 1. 搜索范围与结果

支持 `agent` / `session` / `all`：

- 智能体扫描 `{appConfigDir}/agent-manager/agents/{id}/agent.json`，检索 `name`、`displayName`、`description`、预设消息名称和正文；最多提取 3 条预设匹配，名称命中优先于同条正文。
- 会话扫描 `{appConfigDir}/llm-chat/sessions/*.json`，检索名称、节点正文与 `metadata.reasoningContent`。Electron 最多返回 5 条节点字段匹配；Tauri 按节点迭代检查上限，同一节点的正文和推理同时命中时可能返回第 6 条。
- 结果包含 ID、类型、标题、匹配片段、角色、更新时间和应用相对路径。前端合并批次，按匹配数量、更新时间降序排列。

两端均按文件扫描，写入后可直接搜索。搜索成本随文件总量增长；单文件 JSON 解析仍占用当前扫描线程，大规模历史数据的索引化与性能优化另行推进。

## 2. 匹配模式

所有模式均忽略大小写，用户输入中的正则元字符按字面值处理。

- `exact`：整个查询作为短语。
- `and`：按空白切词，要求全部词出现在同一字段。
- `or`：按空白切词，任一词命中即可。

中文连写按整体关键词处理，空白分词适用于中英文混合查询。Electron 在 JSON 解码后的实际字段上匹配，包含引号、换行转义的正文同样可检索。

## 3. 流式事件与生命周期

前端处理 `progress`、`resultBatch`、`done` 三类事件。Electron 使用 camelCase 数据：`filesScanned`、`filesMatched`、`durationMs` 和 `updatedAt`；匹配区间沿用既有键名 `match_offsets`。

Electron 每 10 条结果或约 100 ms 刷新结果和进度，完成时发送剩余结果、最终进度和 `done`。默认结果上限为 500；达到上限时先发出全部已接受结果。空查询和零上限立即结束。损坏 JSON、字段结构无效的文件以及并发恢复时已消失的条目跳过，目录或文件读取权限错误返回前端；目录重定向链接被路径边界检查拒绝。

Electron 以 WebContents 为搜索所有者：同窗口的新搜索取消旧任务，取消命令只影响本窗口，并等待旧任务结束再返回。导航、渲染进程退出和窗口销毁撤销事件投递并停止读取；应用退出撤销所有搜索。Tauri 仍使用应用级取消令牌。

Electron Channel 回调保留在渲染器，通过独立 IPC 通道接收主进程定向消息。业务参数只传不透明引用；监听在命令发送前注册，按请求区分流结束标记，成功调用在尾部事件投递完成后释放监听，失败时直接清理；共用实例的并发调用复用监听。当前 Channel 面向命令存续期内的流式结果；后续后台常驻任务仍需单独定义任务所有权和重连协议。

## 4. 防抖与旧结果隔离

`useLlmSearch` 默认 `debounceMs = 300`、`loadingDelayMs = 300`。`isSearching` 管理逻辑状态，`showLoadingIndicator` 控制延迟显示。每次执行记录运行序号，迟到批次和错误只允许更新所属搜索；清空面板同时使待执行的防抖任务和在途结果失效。尚未完成的取消请求会复用并等待，避免旧取消命令晚于新搜索抵达。

## 5. 上下文与高亮

后端围绕首个命中保留上下文，收集片段中的匹配区间、合并重叠范围，并将 CR/LF 替换为等长空格。前端 `formatMatchContext` 和侧栏结果组件使用 `substring` 拆分片段。

Electron 的 `match_offsets` 为 UTF-16 字符串索引，与 JS `substring` 对齐，emoji、组合字符和中文可直接定位。上下文边界按 Unicode code point 移动，保留完整代理对。Tauri 当前使用 grapheme 计数；grapheme 数量与 UTF-16 索引在 emoji 或组合字符场景下存在差异，待 Tauri 后端后续统一。

当前会话消息搜索由 [`ChatSearchPanel.vue`](../../components/search/ChatSearchPanel.vue) 在内存中独立执行，侧栏及批量管理搜索使用本流式后端。
