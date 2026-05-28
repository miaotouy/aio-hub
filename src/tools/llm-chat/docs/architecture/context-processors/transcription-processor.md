# 转写与文本提取器 (`transcription-processor`)

源码：[`transcription-processor.ts`](../../../core/context-processors/transcription-processor.ts)

## 基本信息

| 字段       | 值                                     |
| ---------- | -------------------------------------- |
| 处理器 ID  | `transcription-processor`              |
| 显示名称   | 转写与文本提取器                       |
| 默认优先级 | `250`                                  |
| 默认启用   | 是                                     |
| 管道位置   | 正则之后，世界书、注入、Token 计算之前 |

## 职责

转写处理器把可转成文本的附件内容注入消息正文，让后续世界书匹配、知识库检索、变量替换和 Token 计算都能看到这些文本。

它支持两种文本落位方式：

- 显式占位符替换：将正文中的 `【file::assetId】` 替换为附件转写内容或附件编号标注。
- 回退追加：对没有被占位符认领但已经有转写结果的附件，把结果追加到消息末尾。

## 输入

- `context.messages[*]._attachments`：消息中的附件引用。
- `context.sharedData.updatedAssetsMap`：预处理阶段更新后的资产映射。
- `context.sharedData.transcriptionConfig`：转写策略，例如 smart 模式和强制转写深度。
- `context.agentConfig.modelId`、`profileId`：用于判断附件处理能力。
- `resolveAttachmentsBatch()`：批量转写、OCR 或读取文本附件的核心能力。

## 输出

- 修改消息正文，替换或追加转写文本。
- 从 `_attachments` 中移除已经成功转成文本并进入正文的附件。
- 无法转成文本的附件继续保留，等待 `asset-resolver` 作为多模态内容发送。
- 在 `context.logs` 中记录转写数量、占位符替换数量和错误数量。

## 占位符语法

- `【file::assetId】`：引用当前消息附件列表中的某个资产。
- `generateAssetPlaceholder(assetId)`：生成正式资产占位符。
- `generateUploadingPlaceholder(tempId)`：生成粘贴上传中的临时占位符，格式为 `【file::uploading:tempId】`。

## 维护注意事项

- 占位符只在当前消息的附件列表内匹配，避免跨消息误引用。
- 占位符命中但没有转写结果时，会替换为 `[附件: n - name]` 标注，同时保留原附件供多模态模型读取。
- 已转为文本的附件必须从 `_attachments` 移除，否则后续 `asset-resolver` 会重复发送同一信息。
- 批量转写失败时会降级保留全部附件，不阻断管道。

