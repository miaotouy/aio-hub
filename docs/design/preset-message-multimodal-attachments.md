# 预设消息多模态附件设计方案

> **状态**: Implementing (Phase 1-4 完工)
> **作者**: 咕咕
> **日期**: 2025-06-09

## 1. 背景与动机

当前预设消息（`ChatMessageNode` 在 `presetMessages` 中的实例）只支持纯文本 `content`。姐姐希望预设消息能够引用多模态附件（图片、音频等），并且这些附件引用的是 **Agent 资产**（`AgentAsset`），这样可以随 Agent 一起导入导出，形成完整的自包含包。

### 1.1 典型使用场景

- **Few-shot 示例**：预设一条 user 消息附带一张图片，再预设一条 assistant 消息作为期望输出，教会模型如何处理图片
- **角色卡视觉参考**：在 system prompt 附近注入角色的参考图片，让视觉模型理解角色外观
- **多模态工作流**：预设消息中嵌入音频片段、文档等，构建复杂的多模态上下文

## 2. 现有架构分析

### 2.1 关键数据结构

```
ChatMessageNode (message.ts)
├── content: string                    # 文本内容
├── attachments?: Asset[]              # 运行时聊天附件（全局资产系统）
├── role, type, injectionStrategy...   # 其他字段
└── (无预设附件引用字段)

AgentAsset (agent.ts)
├── id: string                         # Handle，如 "sticker_ok"
├── path: string                       # 相对路径，如 "assets/xxx.png"
├── filename, type, description...     # 元数据
└── group?, mimeType?, size?

AgentBaseConfig (agent.ts)
├── assets?: AgentAsset[]              # 智能体专属资产列表
├── presetMessages?: ChatMessageNode[] # 预设消息序列
└── ...
```

### 2.2 发送管道链路（当前状态）

```
预设消息 (ChatMessageNode[])
    │
    ▼ injection-assembler.ts :: pushSkeletonMessage()
ProcessableMessage { role, content, sourceType: "agent_preset" }
    │  ⚠️ 此处没有传递 _attachments！
    ▼
后续处理器 (macro, worldbook, transcription...)
    │
    ▼ asset-resolver.ts
最终消息 { content: LlmMessageContent[] }
```

**关键缺口**：`injection-assembler.ts` 中的 `pushSkeletonMessage` 在将预设消息转换为 `ProcessableMessage` 时，**完全没有传递附件信息**。对比会话历史消息在 `session-loader.ts` 中会设置 `_attachments: node.attachments`。

### 2.3 导出管道

`agentExportService.ts` 中的 `processAssetsRecursively` 会递归扫描 agent 对象中所有字符串值，如果是相对路径（agent 私有资产）就自动读取并打包到 ZIP 中。这意味着只要资产路径存储为字符串字段，导出就能自动处理。

## 3. 方案设计

### 3.1 核心思路：引用 AgentAsset，复用现有管道

预设消息通过 **轻量引用** 指向 Agent 的资产（`AgentAsset.id`），在发送管道中解析为实际的 `Asset` 对象，复用已有的 `asset-resolver` 处理链路。

```
                    ┌─────────────────────────────────────────┐
                    │           AgentBaseConfig                │
                    │                                         │
                    │  assets: [                              │
                    │    { id: "ref_img", path: "assets/a.png", ... }
                    │    { id: "demo_audio", path: "assets/b.mp3", ... }
                    │  ]                                      │
                    │                                         │
                    │  presetMessages: [                      │
                    │    {                                     │
                    │      role: "user",                      │
                    │      content: "请分析这张图片",           │
                    │      presetAttachments: [               │
                    │        { assetId: "ref_img" }  ──────────┼──→ 引用
                    │      ]                                  │
                    │    }                                     │
                    │  ]                                      │
                    └─────────────────────────────────────────┘
```

### 3.2 新增类型定义

```typescript
// types/message.ts 新增

/**
 * 预设消息附件引用
 *
 * 通过 AgentAsset 的 ID (handle) 引用智能体资产，
 * 在发送管道中被解析为实际的二进制内容。
 * 随 Agent 导入导出时自动跟随。
 */
export interface PresetAttachmentRef {
  /** 引用的 AgentAsset ID (handle) */
  assetId: string;
  /** 附件用途描述（可选，供 UI 展示和调试） */
  description?: string;
}
```

```typescript
// types/message.ts :: ChatMessageNode 新增字段

export interface ChatMessageNode {
  // ... 现有字段 ...

  /**
   * 预设消息附件引用列表
   *
   * 引用 Agent 资产 (AgentAsset) 作为多模态附件。
   * 仅在预设消息场景下使用，发送时由 injection-assembler 解析为实际 Asset。
   * 随 Agent 导入导出自动跟随（因为引用的是 AgentAsset.id）。
   */
  presetAttachments?: PresetAttachmentRef[];
}
```

### 3.3 发送管道改造

#### 3.3.1 injection-assembler.ts

在 `pushSkeletonMessage` 中增加预设附件解析逻辑：

```typescript
const pushSkeletonMessage = (msg: ChatMessageNode) => {
  // 解析预设附件引用 → 转换为临时 Asset 对象
  const resolvedAttachments = resolvePresetAttachments(
    msg.presetAttachments,
    context.agentConfig // 从中获取 assets[] 和 agentId
  );

  finalMessages.push({
    role: msg.role,
    content: processedContents.get(msg.id) ?? msg.content,
    sourceType: "agent_preset",
    sourceId: msg.id,
    sourceIndex: presetMessages.indexOf(msg),
    _attachments:
      resolvedAttachments.length > 0 ? resolvedAttachments : undefined,
    // ... 其他现有字段 ...
  });
};
```

#### 3.3.2 新增解析函数

```typescript
// core/context-utils/preset-attachment-resolver.ts

import type { Asset } from "@/types/asset-management";
import type { PresetAttachmentRef } from "../../types/message";
import type { AgentAsset, AgentBaseConfig } from "../../types/agent";

/**
 * 将预设附件引用解析为 Asset 对象
 *
 * 从 Agent 的 assets 列表中查找对应的 AgentAsset，
 * 构造一个兼容 Asset 接口的临时对象，供下游 asset-resolver 处理。
 */
export function resolvePresetAttachments(
  refs: PresetAttachmentRef[] | undefined,
  agentConfig: AgentBaseConfig & { id: string }
): Asset[] {
  if (!refs || refs.length === 0) return [];

  const agentAssets = agentConfig.assets || [];
  const results: Asset[] = [];

  for (const ref of refs) {
    const agentAsset = agentAssets.find((a) => a.id === ref.assetId);
    if (!agentAsset) {
      logger.warn("预设附件引用的资产未找到", { assetId: ref.assetId });
      continue;
    }

    // 构造兼容 Asset 接口的临时对象
    // path 使用 agent 私有目录的相对路径格式
    results.push({
      id: `preset-${agentConfig.id}-${agentAsset.id}`,
      type: mapAgentAssetType(agentAsset.type),
      sourceModule: "llm-chat",
      mimeType: agentAsset.mimeType || guessMimeType(agentAsset.filename),
      name: agentAsset.filename,
      path: agentAsset.path, // 相对于 agent 私有目录
      size: agentAsset.size || 0,
      createdAt: new Date().toISOString(),
      origins: [
        { type: "local", source: agentAsset.path, sourceModule: "llm-chat" },
      ],
      // 标记为 agent 私有资产，asset-resolver 需要特殊处理路径
      _agentId: agentConfig.id,
    } as Asset & { _agentId: string });
  }

  return results;
}
```

#### 3.3.3 asset-resolver.ts 适配

`asset-resolver` 当前通过 `assetManagerEngine.getAssetBinary(asset.path)` 读取文件。对于 agent 私有资产，需要增加路径解析逻辑：

```typescript
// 在读取二进制时，判断是否为 agent 私有资产
let buffer: ArrayBuffer;
if (asset.inlineData) {
  // 已有逻辑：内联数据
  buffer = decodeInlineData(asset.inlineData);
} else if ((asset as any)._agentId) {
  // 新增：agent 私有资产，从 agent 目录读取
  const agentDir = await join(
    await getAppConfigDir(),
    "llm-chat",
    "agents",
    (asset as any)._agentId
  );
  const fullPath = await join(agentDir, asset.path);
  buffer = await readFile(fullPath);
} else {
  // 已有逻辑：全局资产
  buffer = await assetManagerEngine.getAssetBinary(asset.path);
}
```

### 3.4 导入导出

#### 3.4.1 Agent 导出（自动兼容）

`processAssetsRecursively` 会递归扫描 `exportableAgent` 对象中的所有字符串值。`presetAttachments` 中只有 `assetId`（handle 字符串），不是文件路径，所以不会被误处理。

真正的资产文件路径在 `agent.assets[].path` 中，已经被现有逻辑正确处理。

**结论：Agent 导出无需改动。**

#### 3.4.2 Agent 导入（自动兼容）

导入时，`agent.assets[]` 中的路径会被正确恢复到 agent 私有目录。`presetAttachments` 中的 `assetId` 引用在导入后依然有效（因为 `AgentAsset.id` 是 handle，不是运行时生成的 UUID）。

**结论：Agent 导入无需改动。**

#### 3.4.3 预设消息独立导出（需适配）

`usePresetImportExport.ts` 中的 `cleanMessagesForExport` 需要保留 `presetAttachments` 字段：

```typescript
// 当前逻辑已经保留了大部分字段，只需确认不被过滤掉即可
// presetAttachments 不在 metadata 中，不会被清理
```

**注意**：预设消息独立导出（不含 Agent 整体导出）时，附件引用会变成"悬空引用"。需要在导入时检测并提示用户。

### 3.5 UI 改造

#### 3.5.1 PresetMessageCard.vue

在卡片上显示附件徽标：

```
┌─────────────────────────────────────────────┐
│ 🔧 System  ⚓ chat_history前  📎 2个附件     │
│ 请分析以下参考图片并描述角色特征...            │
└─────────────────────────────────────────────┘
```

紧凑模式下显示 📎 图标和数量。

#### 3.5.2 预设消息编辑器（编辑单条消息的弹窗）

新增"附件"区域，允许：

- 从 Agent 资产列表中选择已有资产
- 快速上传新文件（自动添加到 Agent 资产并创建引用）
- 拖拽排序附件
- 预览附件缩略图
- 移除附件引用

```
┌─ 编辑预设消息 ──────────────────────────┐
│ 角色: [System ▼]   名称: [可选名称]      │
│                                         │
│ ┌─ 内容 ──────────────────────────────┐ │
│ │ 请分析以下参考图片...                │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─ 附件 (引用 Agent 资产) ────────────┐ │
│ │ ┌──────┐ ┌──────┐                   │ │
│ │ │ 🖼️   │ │ 🖼️   │  [+ 从资产选择]  │ │
│ │ │ref.png│ │bg.jpg │  [+ 上传新文件]  │ │
│ │ └──────┘ └──────┘                   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│              [取消]  [保存]              │
└─────────────────────────────────────────┘
```

## 4. 数据流总览

```mermaid
graph TD
    A[用户编辑预设消息] -->|选择 Agent 资产| B[ChatMessageNode.presetAttachments]
    B -->|存储引用 assetId| C[Agent 配置持久化]

    C -->|导出| D[Agent ZIP/JSON]
    D -->|assets[] 路径被打包| E[完整的自包含包]
    E -->|导入| F[恢复 assets[] + presetAttachments 引用]

    C -->|发送消息| G[injection-assembler]
    G -->|resolvePresetAttachments| H[AgentAsset → 临时 Asset]
    H -->|_attachments| I[transcription-processor]
    I --> J[asset-resolver]
    J -->|读取 agent 私有目录| K[Base64 编码]
    K --> L[LLM API 多模态内容]
```

## 5. 实施计划

### Phase 1：数据模型 + 发送管道（核心链路）

1. 在 `ChatMessageNode` 上新增 `presetAttachments` 字段
2. 新增 `preset-attachment-resolver.ts` 解析函数
3. 修改 `injection-assembler.ts` 的 `pushSkeletonMessage`，传递解析后的 `_attachments`
4. 适配 `asset-resolver.ts`，支持 agent 私有资产路径

### Phase 2：UI 编辑

5. 修改预设消息编辑弹窗，新增附件选择区域
6. 修改 `PresetMessageCard.vue`，显示附件徽标
7. 实现"从 Agent 资产选择"的选择器组件

> 发送测试通过

### Phase 3：导入导出适配

8. ✅ 确认 Agent 整体导出/导入无需改动（验证通过：`processAssetsRecursively` 只处理文件路径字符串，`presetAttachments` 中的 `assetId` handle 不会被误处理）
9. ✅ 适配预设消息独立导出（`usePresetImportExport.ts`）— `cleanMessagesForExport` 使用深拷贝，`presetAttachments` 字段自动保留
10. ✅ 预设消息独立导入时，检测悬空引用并提示（`detectDanglingAttachmentRefs` 函数，通过 `agentAssets` 参数校验引用有效性）

### Phase 4：Token 计算 + 预览

11. ✅ 适配 `usePresetTokenCalculator.ts`，计算附件 Token（根据附件类型估算：图片使用 visionTokenCost，音频/视频按默认时长估算）
12. ✅ 适配上下文预览（`preview-builder.ts`），显示预设附件（在 `ContextPreviewData.presetMessages` 中新增 `attachments` 字段，预设消息分支现在处理 `_attachments` 并计算附件 Token）

## 6. 风险与注意事项

| 风险                             | 影响             | 缓解措施                                             |
| -------------------------------- | ---------------- | ---------------------------------------------------- |
| Agent 资产被删除但预设消息仍引用 | 发送时找不到资产 | 解析时 warn 并跳过，UI 上标记为"资产缺失"            |
| 预设消息独立导出/导入时附件丢失  | 引用悬空         | 导入时检测并提示；考虑在独立导出时嵌入引用的资产信息 |
| 大量图片附件导致上下文过大       | Token 超限       | 复用现有图片压缩策略；Token 计算器提前预警           |
| 模型不支持多模态                 | 附件无法发送     | 在 UI 编辑时提示；发送时降级为文本描述或跳过         |

## 7. 为什么不直接复用 `attachments?: Asset[]`

`ChatMessageNode.attachments` 是为运行时聊天消息设计的，使用全局资产管理系统的 `Asset` 类型。它有以下问题：

1. **类型过重**：`Asset` 包含 `origins`, `importStatus`, `importPhase` 等大量运行时字段，对预设消息场景来说是噪音
2. **生命周期不同**：全局 `Asset` 由资产管理器管理，有独立的清理和去重逻辑；Agent 资产由 Agent 私有目录管理
3. **导入导出语义不同**：全局 `Asset.path` 是资产库的相对路径；Agent 资产路径是 agent 私有目录的相对路径
4. **引用稳定性**：全局 `Asset.id` 是 UUID，导入后会变；`AgentAsset.id` 是用户定义的 handle，导入后不变

使用轻量的 `PresetAttachmentRef` 引用 `AgentAsset`，可以避免这些问题，同时天然享受 Agent 导入导出的完整性。
