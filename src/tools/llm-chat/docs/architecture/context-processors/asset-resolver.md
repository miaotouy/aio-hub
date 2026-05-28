# Base64 资源解析器 (`asset-resolver`)

源码：[`asset-resolver.ts`](../../../core/context-processors/asset-resolver.ts)

## 基本信息

| 字段       | 值                                      |
| ---------- | --------------------------------------- |
| 处理器 ID  | `asset-resolver`                        |
| 显示名称   | Base64 资源解析器                       |
| 默认优先级 | `10000`                                 |
| 默认启用   | 是                                      |
| 管道位置   | 最后阶段，所有文本处理和 Token 裁剪之后 |

## 职责

资源解析器把消息中残留的二进制附件引用转换为最终发送给 LLM 的结构化多模态内容。它是管道中唯一应批量读取附件二进制并转 Base64 的内置处理器。

## 输入

- `context.messages[*]._attachments`：仍未被转写处理器消费的附件。
- `assetManagerEngine.getAssetBinary()`：读取资产二进制。
- `context.capabilities`：模型能力，例如视觉、文档、最大图片尺寸和文档格式。
- `context.agentConfig.parameters.imageCompression`：用户图片压缩策略。

## 输出

- 将消息 `content` 改为 `LlmMessageContent[]`。
- 保留原文本内容为 `{ type: "text", text }`。
- 追加图片、文档、音频、视频结构化内容。
- 在 `context.logs` 中记录解析成功和失败数量。

## 类型处理

### 图片

处理顺序：

1. 如果模型声明 `maxImageDimension`，先做模型安全缩放。
2. 如果用户启用 `imageCompression`，再应用用户压缩策略。
3. 转为 `{ type: "image", imageBase64 }`。

### PDF / 文档

- 如果附件是 PDF，模型不支持原生文档但支持视觉，则现场调用 `convertPdfToImages()` 转为图片序列。
- 否则转为：

```typescript
{
  type: "document",
  source: {
    type: "base64",
    media_type: asset.mimeType,
    data: docBase64,
  },
}
```

`documentFormat: "openai_file"` 目前会记录警告并回退到 base64。

### 音频 / 视频

转为：

```typescript
{
  type: "audio" | "video",
  source: {
    type: "base64",
    media_type: asset.mimeType,
    data: base64,
  },
}
```

## 维护注意事项

- 该处理器必须保持最高优先级，避免 Base64 大字符串影响正则、知识库、变量和 Token 裁剪。
- 单个附件解析失败只记录错误并继续处理同消息其他附件。
- 文本附件理论上应已由 `transcription-processor` 消费；这里只处理 `image`、`document`、`audio`、`video`。
- 不要使用 `fetch(dataUrl)` 读取 data URL，Tauri CSP 可能拦截 `data:`；当前实现通过 ArrayBuffer 与 Base64 工具函数处理。

