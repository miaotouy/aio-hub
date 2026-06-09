# 管道附件抽象层重构计划

> **状态**: RFC (Request for Comments)
> **作者**: 咕咕
> **日期**: 2025-06-09
> **关联**: [预设消息多模态附件设计方案](../design/preset-message-multimodal-attachments.md)

## 1. 背景与动机

当前发送管道中的附件表示直接复用了全局资产管理系统的 `Asset` 接口。`Asset` 是一个包含 20+ 字段的重型接口，设计目标是管理磁盘上的持久化资产文件。但管道中的消费者（`asset-resolver`、`transcription-processor` 等）实际只需要 6-8 个字段。

这导致了一个反复出现的问题：**当附件数据不来自全局资产库时，必须构造"临时 Asset"对象**，填充大量无意义字段，甚至需要 type assertion hack。

### 1.1 已知的临时 Asset 构造场景

| #   | 场景                   | 文件                                   | 问题                                                                    |
| --- | ---------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| A   | DOCX 图片拆分          | `docx-image-splitter.ts:56-75`         | 填充 `path: ""`, `origins: []`, `importStatus: "complete"` 等无意义字段 |
| B   | 预设消息附件（设计中） | `preset-attachment-resolver.ts`（RFC） | 需要 `as Asset & { _agentId: string }` hack 来传递 agent 私有目录信息   |
| C   | 异步任务结果资产       | `async-task-processor.ts:210-221`      | **直接放弃了注入 `_attachments`**，改用 sharedData 绕行                 |

### 1.2 根本原因

`asset-resolver.ts` 获取二进制数据的逻辑硬编码了两条路径：

```
if (asset.inlineData) → 内存 base64
else → assetManagerEngine.getAssetBinary(asset.path)  // 全局资产库
```

每新增一种数据来源（agent 私有目录、URL、临时缓冲区等），就需要在这里加 if-else 分支，并在上游构造带有特殊标记字段的 Asset 对象。

## 2. 现状分析

### 2.1 管道消费者实际使用的 Asset 字段

通过逐一审查所有消费 `_attachments` 的处理器，确认实际使用的字段：

| 字段                    | asset-resolver | transcription-processor | attachment-resolver |  token 计算   |
| ----------------------- | :------------: | :---------------------: | :-----------------: | :-----------: |
| `id`                    |    ✅ 日志     |      ✅ 占位符匹配      |       ✅ 日志       |       —       |
| `type`                  |  ✅ 处理分支   |       ✅ 类型判断       |     ✅ 文本检测     |  ✅ 类型判断  |
| `name`                  |  ✅ 错误提示   |       ✅ 标注文本       |    ✅ 文件名检测    |       —       |
| `mimeType`              | ✅ 文档/音视频 |      ✅ DOCX 检测       |    ✅ MIME 检测     |       —       |
| `path`                  | ✅ 读取二进制  |      ✅ 读取二进制      |    ✅ 读取二进制    |       —       |
| `inlineData`            |  ✅ 内联数据   |            —            |          —          |       —       |
| `metadata.width/height` |       —        |            —            |          —          | ✅ 图片 token |
| `size`                  |       —        |            —            |          —          |     可选      |

**结论**：管道需要 ~8 个字段，Asset 接口提供了 20+ 个字段，其中 `uploadingId`, `thumbnailPath`, `importStatus`, `importPhase`, `importPhaseDetail`, `importError`, `originalPath`, `origins[]`, `sourceModule`, `createdAt` 等对管道完全无用。

### 2.2 `_attachments` 的生产者

| 入口                | 文件                              | 当前行为                                                                      |
| ------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| 会话历史消息        | `session-loader.ts:254`           | `_attachments: node.attachments`（直接引用 Asset[]）                          |
| 待发送消息          | `session-loader.ts:269`           | `_attachments: pendingInput.attachments`（直接引用 Asset[]）                  |
| DOCX 拆分产生的图片 | `transcription-processor.ts:226`  | `remainingAttachments.push(...splitResult.imageAssets)`（临时构造的 Asset[]） |
| 消息合并            | `message-format-processors.ts:72` | `flatMap(msg => msg._attachments \|\| [])`（纯透传）                          |

### 2.3 `processImageAsset` 等函数的参数类型

`asset-resolver.ts` 中的三个处理函数参数类型**全部是 `any`**：

```typescript
async function processImageAsset(
  asset: any,
  buffer: ArrayBuffer,
  context: PipelineContext
);
async function processDocumentAsset(
  asset: any,
  buffer: ArrayBuffer,
  context: PipelineContext
);
async function processMediaAsset(
  asset: any,
  buffer: ArrayBuffer,
  type: "audio" | "video"
);
```

这进一步证实了 asset-resolver 本身就不依赖完整 Asset 接口。

## 3. 方案设计

### 3.1 核心思路：引入 `PipelineAttachment` 接口

在管道内部使用轻量的 `PipelineAttachment` 接口替代 `Asset`，通过 `source` 联合类型描述"如何获取二进制数据"，消除 if-else 分支和 type assertion hack。

```
全局 Asset ──→ fromAsset() ──→ PipelineAttachment ──→ 管道消费者
DOCX 拆分 ──→ 直接构造 ────→ PipelineAttachment ──→ 管道消费者
预设附件  ──→ 直接构造 ────→ PipelineAttachment ──→ 管道消费者
异步任务  ──→ 直接构造 ────→ PipelineAttachment ──→ 管道消费者
```

### 3.2 类型定义

```typescript
// src/tools/llm-chat/types/pipeline-attachment.ts

import type { AssetType, AssetMetadata } from "@/types/asset-management";

/**
 * 管道附件 —— 发送管道内部的附件表示
 *
 * 与全局 Asset 解耦，只包含管道消费者实际需要的字段。
 * 通过 source 联合类型描述"如何获取二进制数据"，
 * 消除 if-else 分支和 type assertion hack。
 */
export interface PipelineAttachment {
  /** 唯一标识（用于日志、占位符匹配、去重） */
  id: string;
  /** 文件类型 */
  type: AssetType;
  /** 文件名 */
  name: string;
  /** MIME 类型 */
  mimeType: string;
  /** 文件大小（字节，可选，用于统计） */
  size?: number;
  /** 媒体元数据（用于 Token 计算） */
  metadata?: Pick<AssetMetadata, "width" | "height" | "duration">;

  /** 二进制数据来源 */
  source: AttachmentSource;
}

/**
 * 附件数据来源
 *
 * 使用可辨识联合类型（Discriminated Union），
 * asset-resolver 通过 switch(source.kind) 分派读取逻辑。
 */
export type AttachmentSource =
  /** 内联 base64 数据（如 DOCX 拆分出的图片） */
  | { kind: "inline"; base64: string; mimeType: string }
  /** 全局资产库中的文件 */
  | { kind: "asset-library"; path: string }
  /** Agent 私有目录中的文件 */
  | { kind: "agent-private"; agentId: string; relativePath: string };
```

### 3.3 适配函数

```typescript
// src/tools/llm-chat/types/pipeline-attachment.ts

import type { Asset } from "@/types/asset-management";

/**
 * 将全局 Asset 转换为 PipelineAttachment
 *
 * 在管道入口处（session-loader、injection-assembler）调用，
 * 将持久化的 Asset 对象适配为管道内部表示。
 */
export function fromAsset(asset: Asset): PipelineAttachment {
  const source: AttachmentSource = asset.inlineData
    ? {
        kind: "inline",
        base64: asset.inlineData.base64,
        mimeType: asset.inlineData.mimeType,
      }
    : { kind: "asset-library", path: asset.path };

  return {
    id: asset.id,
    type: asset.type,
    name: asset.name,
    mimeType: asset.mimeType,
    size: asset.size,
    metadata: asset.metadata
      ? {
          width: asset.metadata.width,
          height: asset.metadata.height,
          duration: asset.metadata.duration,
        }
      : undefined,
    source,
  };
}
```

### 3.4 二进制数据获取统一函数

```typescript
// src/tools/llm-chat/core/context-utils/attachment-binary.ts

import type { PipelineAttachment } from "../../types/pipeline-attachment";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { join } from "@tauri-apps/api/path";
import { readFile } from "@tauri-apps/plugin-fs";

/**
 * 根据 PipelineAttachment.source 获取二进制数据
 *
 * 替代 asset-resolver 中原有的 if-else 逻辑，
 * 新增数据来源只需在此函数中添加 case 分支。
 */
export async function getAttachmentBuffer(
  attachment: PipelineAttachment
): Promise<ArrayBuffer> {
  switch (attachment.source.kind) {
    case "inline": {
      const binaryStr = atob(attachment.source.base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes.buffer;
    }

    case "asset-library":
      return assetManagerEngine.getAssetBinary(attachment.source.path);

    case "agent-private": {
      const { appConfigDir } = await import("@tauri-apps/api/path");
      const agentDir = await join(
        await appConfigDir(),
        "llm-chat",
        "agents",
        attachment.source.agentId
      );
      const fullPath = await join(agentDir, attachment.source.relativePath);
      return (await readFile(fullPath)).buffer;
    }
  }
}
```

### 3.5 各场景改造对比

#### 会话历史（session-loader.ts）

```typescript
// 改造前
_attachments: node.attachments,

// 改造后
_attachments: node.attachments?.map(fromAsset),
```

#### DOCX 图片拆分（docx-image-splitter.ts）

```typescript
// 改造前：构造 20+ 字段的完整 Asset
return {
  id: `docx-img-${docxAsset.id}-${img.index}`,
  type: "image",
  name: `${docxAsset.name} - 图片 ${img.index}`,
  path: "", // 无意义
  size: img.estimatedBytes,
  mimeType: img.mimeType,
  sourceModule: "llm-chat-docx-split", // 无意义
  createdAt: new Date().toISOString(), // 无意义
  origins: [], // 无意义
  importStatus: "complete", // 无意义
  metadata: { width: dims.width, height: dims.height },
  inlineData: { base64: img.base64, mimeType: img.mimeType },
};

// 改造后：只需 8 个字段
return {
  id: `docx-img-${docxAsset.id}-${img.index}`,
  type: "image",
  name: `${docxAsset.name} - 图片 ${img.index}`,
  mimeType: img.mimeType,
  size: img.estimatedBytes,
  metadata: { width: dims.width, height: dims.height },
  source: { kind: "inline", base64: img.base64, mimeType: img.mimeType },
};
```

#### 预设消息附件（preset-attachment-resolver.ts）

```typescript
// 改造前（RFC 设计）：需要 type assertion hack
results.push({
  // ...大量 Asset 字段填充...
  _agentId: agentConfig.id, // hack!
} as Asset & { _agentId: string });

// 改造后：类型安全，无 hack
results.push({
  id: `preset-${agentConfig.id}-${agentAsset.id}`,
  type: mapAgentAssetType(agentAsset.type),
  name: agentAsset.filename,
  mimeType: agentAsset.mimeType || guessMimeType(agentAsset.filename),
  size: agentAsset.size,
  source: {
    kind: "agent-private",
    agentId: agentConfig.id,
    relativePath: agentAsset.path,
  },
});
```

#### asset-resolver.ts 改造

```typescript
// 改造前：if-else + any 类型
let buffer: ArrayBuffer;
if (asset.inlineData) {
  const binaryStr = atob(asset.inlineData.base64);
  // ...
  buffer = bytes.buffer;
} else {
  buffer = await assetManagerEngine.getAssetBinary(asset.path);
}

// 改造后：统一调用
const buffer = await getAttachmentBuffer(attachment);
```

同时将 `processImageAsset` 等函数的参数类型从 `any` 改为 `PipelineAttachment`。

## 4. 影响面

### 4.1 需要修改的文件

| 文件                                                   | 改动类型                                                            | 改动量       |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ------------ |
| **新增** `types/pipeline-attachment.ts`                | 新增接口 + 适配函数                                                 | ~60 行       |
| **新增** `core/context-utils/attachment-binary.ts`     | 新增二进制获取函数                                                  | ~40 行       |
| `types/context.ts`                                     | `_attachments?: Asset[]` → `PipelineAttachment[]`                   | 3 处类型标注 |
| `core/context-processors/session-loader.ts`            | 入口处 `.map(fromAsset)`                                            | 2 行         |
| `core/context-processors/asset-resolver.ts`            | 改用 `getAttachmentBuffer()`，参数类型 `any` → `PipelineAttachment` | ~30 行       |
| `core/context-processors/transcription-processor.ts`   | 类型标注更新                                                        | ~10 行       |
| `core/context-utils/attachment-resolver.ts`            | 入参类型更新                                                        | ~10 行       |
| `core/context-utils/docx-image-splitter.ts`            | 返回 `PipelineAttachment[]`，简化构造                               | ~20 行       |
| `core/context-processors/message-format-processors.ts` | 纯透传，类型标注更新                                                | ~5 行        |
| `core/context-processors/token-limiter.ts`             | 类型标注更新                                                        | ~5 行        |
| `core/context-utils/preview-builder.ts`                | 类型标注更新                                                        | ~5 行        |
| `utils/chatTokenUtils.ts`                              | 类型标注更新                                                        | ~5 行        |
| `composables/chat/useChatExecutor.ts`                  | 类型标注更新                                                        | ~3 行        |

### 4.2 不需要修改的

- `Asset` 接口本身 — 全局资产管理系统不受影响
- `ChatMessageNode.attachments` — 持久化层仍然使用 Asset
- 导入导出逻辑 — 不涉及管道
- UI 组件 — 不直接消费 `_attachments`

### 4.3 风险评估

| 风险                       | 影响             | 缓解措施                                                               |
| -------------------------- | ---------------- | ---------------------------------------------------------------------- |
| 改动文件数量较多（~13 个） | 可能引入回归     | 全部是类型层面的收窄，不涉及业务逻辑变更；可通过 `check:frontend` 验证 |
| `fromAsset()` 转换遗漏字段 | Token 计算不准确 | 审查所有消费者的字段使用，已在本文档第 2.1 节完成                      |
| 与预设附件 RFC 的时序依赖  | 需要协调实施顺序 | 本重构作为预设附件的前置依赖，先完成                                   |

## 5. 实施计划

### Phase 1：类型定义与适配函数

1. 新增 `types/pipeline-attachment.ts`，定义 `PipelineAttachment`、`AttachmentSource`、`fromAsset()`
2. 新增 `core/context-utils/attachment-binary.ts`，定义 `getAttachmentBuffer()`

### Phase 2：管道入口改造

3. 修改 `types/context.ts` 中 `ProcessableMessage._attachments` 的类型
4. 修改 `session-loader.ts`，在入口处调用 `fromAsset()`

### Phase 3：消费者改造

5. 改造 `asset-resolver.ts`：使用 `getAttachmentBuffer()`，参数类型 `any` → `PipelineAttachment`
6. 改造 `transcription-processor.ts`：类型标注更新
7. 改造 `attachment-resolver.ts`：入参类型更新
8. 改造 `docx-image-splitter.ts`：返回 `PipelineAttachment[]`，简化构造逻辑

### Phase 4：透传层更新

9. 更新 `message-format-processors.ts`、`token-limiter.ts`、`preview-builder.ts`、`chatTokenUtils.ts`、`useChatExecutor.ts` 的类型标注

### Phase 5：验证

10. 运行 `check:frontend` 确认类型检查通过
11. 手动测试：带附件的聊天消息发送、DOCX 附件拆分、Token 计算、上下文预览

## 6. 与预设消息附件 RFC 的关系

本重构是预设消息多模态附件方案的**前置依赖**。完成后：

- 预设附件的 `resolvePresetAttachments()` 直接返回 `PipelineAttachment[]`，使用 `source: { kind: "agent-private", ... }`
- `asset-resolver.ts` 无需额外适配，`getAttachmentBuffer()` 已包含 `agent-private` 分支
- 预设附件 RFC 中的 §3.3.2（新增解析函数）和 §3.3.3（asset-resolver 适配）可大幅简化

建议实施顺序：

```
本重构（PipelineAttachment 抽象层）
    ↓
预设消息附件 Phase 1（数据模型 + 发送管道）
    ↓
预设消息附件 Phase 2-4（UI + 导入导出 + Token）
```
