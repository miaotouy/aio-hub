# 媒体生成参数面板诊断说明

## 背景

媒体生成参数面板现在只读取已添加模型对象上的 `mediaGenParams`，不再在运行态直接从全局模型元数据规则回退读取。若生成中心选中的 `profileId:modelId` 对应模型缺少 `mediaGenParams`，侧栏就会只剩基础区域和高级参数折叠区。

本诊断用于排查以下情况：

- 生成中心选中的模型组合不是用户在模型编辑页查看的那个 profile 下的模型。
- 同一个 `modelId` 存在多个渠道，其中部分模型缺少 `mediaGenParams`。
- 重生成/分支复用了当前侧栏模型与参数，而不是原任务快照中的模型与参数。
- 历史 Remix 或会话配置写入了纯 `modelId`，导致 `profileId:modelId` 解析失败。

## 使用方式

1. 打开媒体生成工具。
2. 保持异常界面和异常会话处于当前状态。
3. 在右侧参数栏展开「高级参数」。
4. 点击「导出诊断日志」。
5. 将导出的 `media-generator-diagnostics-*.json` 发回。

如果用户已经触发过“切换模型、重生成、切换分支”，也请在触发后立即导出一次。

## 诊断文件关注点

- `comboInspection.active`
  - 当前媒体类型的 `modelCombo`、解析出的 `profileId/modelId`、是否找到了 profile/model。
  - `model.hasMediaGenParams` 表示当前实际选中模型对象是否有参数规则。
  - `matchedMetadata.hasMediaGenParams` 表示全局元数据规则是否能匹配到参数规则。

- `sameIdModels`
  - 列出所有同 `modelId` 的模型实例。
  - 如果其中一个有规则、另一个没规则，通常说明生成中心选中了另一个 profile 下的同名模型。

- `currentConfig`
  - 当前会话保存的各媒体类型模型组合与参数。
  - 如果 `modelCombo` 不是 `profileId:modelId` 格式，参数面板可能无法解析模型。

- `activeNode.metadata.taskSnapshot`
  - 当前分支节点保存的任务快照。
  - 可对比快照中的 `input.profileId/input.modelId/input.params` 与 `comboInspection.active`。

- `recentLogs`
  - 包含最近的 app 内存日志。
  - 重点搜索：
    - `媒体生成参数面板模型状态`
    - `当前生成模型没有媒体生成参数规则`
    - `重生成参数解析完成`
    - `准备重生成媒体任务`

## 预期判断

若出现：

- `matchedMetadata.hasMediaGenParams = true`
- 但 `model.hasMediaGenParams = false`

说明全局 metadata 有规则，但当前已添加模型对象没有写入规则。此时同步/重置 metadata 不会自动修复该模型实例，需要应用模型预设或补充模型对象上的 `mediaGenParams`。

若出现：

- `snapshotProfileId/snapshotModelId` 与 `currentProfileId/currentModelId` 不一致

说明重生成时使用了当前侧栏模型，而不是源任务快照模型。这是重生成参数复用方向的重点修复点。

## 2026-06-10 样本结论

样本 `media-generator-diagnostics-2026-06-10T12-04-03-244Z.json` 显示：

- 当前 `modelCombo` 为 `llm-profile-1777482136893-hy95v90dj:gpt-image-2-hq`，profile 和 model 都能正常解析。
- 当前模型对象与全局 metadata 都存在 `mediaGenParams`，不是“元数据没有同步到模型”的情况。
- 当前 profile 类型为 `openai-compatible`，模型能力中启用了 `preferChat` 与 `iterativeRefinement`。
- 活跃任务错误为 `field messages is required`，说明重生成/恢复任务进入了 chat 分发路径但没有提供 `messages`。

对应修复：

- 重生成启动任务时传入当前消息路径。
- 对支持对话式生成的媒体任务，即使没有上下文消息，也兜底构造一条当前 prompt 的 user message。
- 参数规则默认填充同时写入 camelCase 与 snake_case 字段，避免 UI 读 `outputFormat/outputCompression/partialImages` 时拿不到由规则填充的默认值。

## 2026-06-10 后续样本结论

样本 `media-generator-diagnostics-2026-06-10T13-01-03-538Z.json` 显示：

- `field messages is required` 已不再出现，说明 chat/preferChat 路径的 `messages` 兜底生效。
- 新的失败点变为 `响应中没有媒体资产`，说明上游请求完成，但 OpenAI 兼容 Chat adapter 没能把返回体里的图片抽取成 `response.images`。
- 任务状态出现 `completed` 但节点仍是 `generating` 的不一致，原因是“没有媒体资产”只写 warn 后继续把任务标记完成。

对应修复：

- OpenAI 兼容 Chat adapter 从 `data/images/message.content/message.images` 等常见聊天响应形态中提取图片 URL 或 base64。
- 媒体生成响应没有任何图片/视频/音频时抛错，不再将任务标记为完成。
