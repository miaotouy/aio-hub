# 图片压缩 (Image Compression)

图片压缩是 `llm-chat` 在发送图片附件给 LLM 之前的**用户侧可选优化层**。

它的存在源于现实痛点：原始相机或截图工具产出的图片往往动辄数千像素、几 MB 体积，直接 Base64 化后会显著拉高 vision 类请求的 Token 消耗与上行带宽，部分 Provider 还会对超大图片直接拒绝或自动降采样。该功能让用户按 Agent 维度自行决定"是否额外压缩、压到多大、用什么格式、保留多少质量"，与模型侧的硬性安全约束缩放（`capabilities.maxImageDimension`）协同但相互独立。

## 1. 配置入口与数据结构 (Configuration)

由 [`LlmParameters.imageCompression`](../../types/llm.ts:232) 字段承载，结构为：

```ts
imageCompression?: {
  enabled: boolean;             // 是否启用用户侧压缩
  maxDimension?: number;        // 目标最大尺寸（像素），未设置则按 4096 兜底
  format: "original" | "jpeg" | "webp"; // 输出格式
  quality: number;              // 0.1~1.0，仅对 jpeg/webp 有效
}
```

UI 入口位于 Agent 参数编辑器 [`ModelParametersEditor.vue`](../../components/agent/parameters/ModelParametersEditor.vue:741) 的"图片压缩"折叠面板，提供启用开关、最大尺寸滑块（256~8192，含 1024/2048/4096 快捷标签）、格式下拉与质量滑块；当 `format === 'original'` 时质量滑块自动隐藏，避免误配置。

## 2. 触发时机与执行位置 (Execution)

压缩**不在发送前的输入阶段**触发，而是位于统一上下文管道末端的 [`asset-resolver`](../../core/context-processors/asset-resolver.ts:149)（priority 10000）内部，作为图片附件 Base64 化前的最后一步。这样可以确保经过会话加载、转写、注入、Token 限制器、消息格式化等所有处理后的最终消息列表中，残留的图片附件才会被真正压缩，避免对中间被截断或丢弃的附件做无意义的转码工作。

具体执行函数为 [`processImageAsset`](../../core/context-processors/asset-resolver.ts:17)，按以下两步顺序处理：

1. **模型安全约束缩放**：先读取 `context.capabilities.maxImageDimension`，若图片任一边超出该阈值则用 [`resizeImage`](../../../../utils/imageProcessor.ts) 等比缩放到模型可接受范围。此步骤始终生效，不受用户开关控制。
2. **用户压缩策略**：仅当 `agentConfig.parameters.imageCompression.enabled === true` 时执行（见 [`asset-resolver.ts:48-68`](../../core/context-processors/asset-resolver.ts:48)），构造 `ResizeOptions` 后再次调用 `resizeImage` 完成缩放与格式转换。

## 3. 各字段真实行为 (Field Semantics)

- **`enabled`**：总开关。关闭时整个用户压缩分支被短路，图片仅保留模型安全约束缩放的结果。
- **`maxDimension`**：作用于 `ResizeOptions` 的 `maxWidth` 与 `maxHeight`，等比缩放图片使长短边均不超过该值；**未设置（undefined）时代码使用 4096 作为兜底上限**（见 [`asset-resolver.ts:53-54`](../../core/context-processors/asset-resolver.ts:53)），并非"不缩放"。如需真正保留原始尺寸，应将其设为足够大的值（如 8192）或保持 `enabled: false`。
- **`format`**：
  - `"original"`：保持源文件原始格式（PNG/JPEG/WebP 等），仅做尺寸缩放，**不会传入 `quality`**，因此质量参数被忽略。
  - `"jpeg"` / `"webp"`：转码为有损格式，同时把 `quality` 一并传入 `resizeImage`。
- **`quality`**：取值 0.1~1.0，UI 默认 0.85。仅在 `format !== "original"` 时生效；对 `original` 模式无效（代码层面根本不会写入 `resizeOpts.quality`）。

## 4. 与项目 Base64 规范的一致性 (CSP Compliance)

- 底层缩放与格式转换在 [`src/utils/imageProcessor.ts`](../../../../utils/imageProcessor.ts) 中实现，使用 `new Uint8Array(buffer)` + `new Blob([bytes])` 构造图片输入、`canvas.toBlob` 输出最终二进制，全程**不出现 `fetch(dataUrl)`**，符合项目"Data URL 转换禁令"的 CSP 合规要求。
- 最终通过 [`convertArrayBufferToBase64`](../../core/context-processors/asset-resolver.ts:6) 一次性把压缩后的 `ArrayBuffer` 编码为 Base64 字符串注入 `LlmMessageContent.imageBase64`，下游 LLM 适配层（OpenAI / Claude / Gemini 等）按各自协议封装即可。

## 5. 与上下文压缩、模型缩放的关系 (Relations)

- **与模型安全缩放并存**：模型缩放是"必做的合规裁剪"，由 `capabilities.maxImageDimension` 自动驱动；用户压缩是"可选的体积优化"，由 Agent 参数决定，二者顺序执行不冲突。
- **与上下文压缩正交**：上下文压缩针对的是**消息文本与历史长度**，图片压缩针对的是**单张图片附件的字节数与像素尺寸**，两者作用域、触发链路、节省维度完全不同，不会互相影响。
- **失败容错**：缩放失败时通过 `logger.warn` 记录但不抛错，自动回退到"当前最近一次成功的图片缓冲区"（即可能是模型缩放后的版本，或彻底未处理的原始图片），保证消息发送链路不被压缩异常打断（见 [`asset-resolver.ts:62-67`](../../core/context-processors/asset-resolver.ts:62)）。
