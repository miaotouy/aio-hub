# 全局资产管理系统设计文档 (Global Asset Management System)

## 1. 概述

本文档旨在为整个应用设计一个统一、健壮、可扩展的资产（文件）管理系统。该系统将为所有需要文件处理的模块（如 LLM 聊天、智能 OCR、文件转换工具等）提供底层的存储、索引和访问能力。

核心设计目标包括：

- **通用性**: 提供一套标准化的数据结构和 API，服务于应用内所有功能模块。
- **灵活性**: 支持用户自定义文件存储位置，避免占用系统盘空间。
- **健壮性**: 采用结构化的目录和唯一文件名，避免冲突和管理混乱。
- **良好的用户体验**: 支持从不同来源（包括文件管理器和 VS Code 等应用）进行拖拽，并提供即时预览。
- **可扩展性**: 为未来的资产管理、搜索、元数据提取等高级功能奠定基础。

## 2. 通用数据结构

我们将在一个核心的 `types` 文件中（例如 `src/types/asset-management.ts`）定义以下数据结构。

### 2.1. `Asset` 接口 (优化版)

此接口被设计为通用数据结构，用于描述一个被应用管理的资产文件。新增了来源、去重哈希和缩略图支持。

```typescript
/**
 * 代表一个由应用管理的资产文件。
 */
export interface Asset {
  /**
   * 资产的唯一标识符 (例如 UUID)。
   */
  id: string;

  /**
   * 文件的通用类型，用于 UI 快速判断如何展示。
   */
  type: "image" | "audio" | "video" | "document" | "other";

  /**
   * 文件的 MIME 类型 (例如 'image/jpeg', 'application/pdf')。
   */
  mimeType: string;

  /**
   * 文件的原始名称。
   */
  name: string;

  /**
   * 文件在资产存储根目录中的相对路径。
   * 例如: 'images/2025-10/f81d4fae-7dec-11d0-a765-00a0c91e6bf6.png'
   */
  path: string;

  /**
   * 可选的、预览图/缩略图的相对路径。
   */
  thumbnailPath?: string;

  /**
   * 文件大小 (字节)。
   */
  size: number;

  /**
   * 文件被添加到系统时的 ISO 8601 时间戳。
   */
  createdAt: string;

  /**
   * 资产的来源信息（可选）。
   */
  origin?: {
    type: "local" | "clipboard" | "network";
    /** 原始路径或 URL */
    source: string;
  };

  /**
   * 可选的、特定于文件类型的元数据。
   */
  metadata?: {
    // 用于图片
    width?: number;
    height?: number;
    // 用于音视频
    duration?: number;
    // 用于文件去重
    sha256?: string;
  };
}
```

### 2.2. 数据结构集成

此 `Asset` 接口将被深度集成到应用的核心数据结构中，尤其是在 LLM 聊天模块。

- **LLM 聊天**: `ChatMessageNode` 接口 (定义于 `src/tools/llm-chat/types.ts`) 将被扩展，以包含一个附件数组。

  ```typescript
  // in src/tools/llm-chat/types.ts
  export interface ChatMessageNode {
    // ... 其他字段
    
    /**
     * 附加到此消息的文件资产列表。
     */
    attachments?: Asset[];
    
    // ... 其他字段
  }
  ```

- **OCR 记录**: 一个 `OcrRecord` 接口可以包含 `sourceImage: Asset` 和 `resultFile?: Asset` 字段。
- **其他工具**: 任何处理输入输出文件的工具，都可以用 `Asset` 来追踪其操作历史。

## 3. 文件存储策略

### 3.1. 存储位置

- **默认位置**: `{appDataDir}/assets`。
- **自定义位置**: 应用的全局设置中允许用户指定一个自定义的资产存储根目录。

### 3.2. 目录结构

- **结构**: `{根目录}/{资产类型}/{年}-{月}/`
- **示例**: `D:/MyAppAssets/images/2025-10/`

### 3.3. 文件命名与索引

- **文件重命名**: 所有文件重命名为 `{UUID}.{原始扩展名}`。
- **路径索引**: `Asset.path` 存储相对路径，增强系统灵活性。
- **文件去重**: 通过计算文件哈希（如 SHA-256）并存储在 `Asset.metadata.sha256` 中，系统可以识别并复用重复文件，避免冗余存储。

### 3.4. 缩略图与缓存

- **目的**: 为大型图片或视频文件生成轻量级的预览图，提升前端加载性能。
- **存储**: 缩略图可以存储在 `{根目录}/.thumbnails/` 目录下，并维持与主资产相似的目录结构。
- **索引**: `Asset.thumbnailPath` 字段将存储缩略图的相对路径。

## 4. 全局后端 API (Tauri 命令) - 优化版

后端 API 经过重新设计，遵循单一职责原则，将复杂的文件处理流程封装在 Rust 中，为前端提供简洁、强大的接口。

1.  **`get_asset_base_path() -> Result<String, String>`**
    - **功能**: 获取当前资产存储的根目录绝对路径。

2.  **`import_asset_from_path(original_path: String) -> Result<Asset, String>`**
    - **功能**: **核心业务命令**。接收一个外部文件的绝对路径，然后在后端完成一整套导入流程：
      1.  读取文件基本信息（大小、MIME 类型）。
      2.  计算文件哈希（如 SHA-256）以供去重检查。
      3.  （可选）检查数据库中是否存在相同哈希的文件，若存在则直接返回已有的 `Asset` 对象。
      4.  根据文件类型和日期，生成新的相对路径和 UUID 文件名。
      5.  将文件复制或移动到资产库的指定位置。
      6.  （可选）为图片或视频生成缩略图。
      7.  提取特定元数据（如图片尺寸、视频时长）。
      8.  将所有信息组装成一个 `Asset` 对象并返回给前端。
    - **返回值**: 一个完整的 `Asset` 对象。

3.  **`import_asset_from_bytes(bytes: Vec<u8>, original_name: String) -> Result<Asset, String>`**
    - **功能**: 与 `import_asset_from_path` 类似，但它接收的是文件的字节流。主要用于处理从剪贴板粘贴的图片等非文件来源的数据。

4.  **`get_asset_binary(relative_path: String) -> Result<Vec<u8>, String>`**
    - **功能**: 根据资产的相对路径读取其二进制数据。

5.  **`convert_to_asset_protocol(relative_path: String) -> Result<String, String>`**
    - **功能**: 将资产的相对路径转换为前端可直接用于 `<img>` 或 `<a>` 标签的 `asset://` URL。

## 5. 通用工作流程 (以 LLM 聊天为例) - 优化版

得益于强大的后端 API 和前端的 `useStateSyncEngine`，整个工作流程高度自动化且体验流畅。

### 5.1. 前端文件处理流程

1.  **捕获**: `useFileDrop` composable 在聊天输入框区域监听到文件拖拽，捕获到文件路径列表 `paths: string[]`。
2.  **导入**: 前端遍历路径列表，为每个 `path` 调用后端命令：
    ```typescript
    const assets = await Promise.all(
      paths.map((path) => invoke("import_asset_from_path", { originalPath: path }))
    );
    ```
3.  **状态更新**: 后端处理完文件（查重、复制、生成缩略图等）后，返回 `Asset[]` 对象数组。前端将这些 `Asset` 对象添加到当前草稿消息的 `attachments` 数组中。

### 5.2. 附件展示区 UI 设计

为了提供良好的交互体验，当用户通过拖拽等方式将文件添加到输入框后，一个专门的附件展示区会出现在输入框上方。

- **位置**: 该区域位于聊天输入框的上方，作为输入区域的一部分。
- **布局**: 采用水平滚动列表或自适应网格布局，展示每个附件的卡片。
- **附件卡片**: 每个附件项是一个独立的组件，包含：
    - **缩略图**: 调用 `convert_to_asset_protocol` 命令，将 `asset.thumbnailPath` (优先) 或 `asset.path` 转换为 `asset://` URL，用于 `<img>` 标签的 `src` 属性。对于非图片文件，显示一个代表文件类型的图标。
    - **信息**: 简要显示 `asset.name` 和格式化后的 `asset.size`。
    - **移除按钮**: 一个 "X" 图标按钮，点击后将该 `Asset` 从消息的 `attachments` 数组中移除。
    - **预览功能**: 点击缩略图可以调用 `useImageViewer` 等全局预览组件，全屏查看图片或文件详情。

### 5.3. 多模态消息发送流程

1.  **检查附件**: 当用户点击发送时，`LlmChatStore` 的 `sendMessage` 方法会检查当前消息节点是否包含 `attachments` 字段且数组不为空。
2.  **内容转换**: 对于 `type` 为 `image` 的附件，前端会执行以下操作：
    - 调用 `invoke("get_asset_binary", { relativePath: asset.path })` 获取图片的 `Uint8Array` 数据。
    - 将 `Uint8Array` 转换为 Base64 字符串。
3.  **构建消息体**: 根据 `useLlmProfiles` 获取到的模型能力和服务商类型，将文本内容和转换后的图片数据（Base64 字符串 + MIME 类型）组装成符合目标 API（如 Claude, OpenAI GPT-4o）要求的多模态消息结构。
4.  **发送请求**: 将最终组装好的消息体传递给 `useLlmRequest` 发送。

## 6. 多窗口同步策略

本项目已有的 `useStateSyncEngine` 和 `useWindowSyncBus` 为状态同步提供了完美的解决方案。我们无需为此功能设计新的同步机制，只需将附件集成到现有状态树中即可。

1.  **状态驱动**: `ChatSession` 对象（包含所有 `ChatMessageNode`）是整个聊天工具的核心状态，并已通过 `useStateSyncEngine` 进行管理。
2.  **自动同步**: 当用户添加或移除附件时，实际上是修改了当前会话中某个 `ChatMessageNode` 的 `attachments` 数组。
3.  **增量更新**: `useStateSyncEngine` 会自动检测到 `ChatSession` 状态树的变化，计算出精确的 JSON Patch（例如，一个 `add` 或 `remove` 操作作用于 `attachments` 数组）。
4.  **广播与应用**: 该 Patch 会通过 `useWindowSyncBus` 广播到所有其他窗口。其他窗口的 `useStateSyncEngine` 监听到事件后，会自动将 Patch 应用到它们本地的 `ChatSession` 状态上。
5.  **UI 刷新**: 由于状态是响应式的（Vue Ref），UI 会自动刷新，从而在所有窗口中同步显示或移除附件卡片。

这种方法充分利用了现有架构，实现了高效、可靠、低耦合的多窗口同步。

## 7. 总结

该设计方案提供了一个通用、灵活且强大的应用级资产管理系统。它不仅满足了 LLM 聊天模块当前的需求，更为未来所有与文件交互的功能模块提供了坚实、统一的基础设施，体现了良好的架构前瞻性。通过与现有状态同步引擎的无缝集成，该方案在实现复杂功能的同时，保持了代码的简洁和可维护性。
