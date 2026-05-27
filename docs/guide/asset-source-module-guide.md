# 资产来源模块追踪使用指南

## 概述

资产管理系统支持**来源模块追踪**功能。每个导入的资产都会记录其来源模块 ID，方便用户按模块筛选和管理资产。

## 核心概念

### `sourceModule` 字段

- **位置**: `Asset` 和 `AssetOrigin` 对象
- **类型**: `string`
- **格式**: 使用工具的路由路径（去掉开头的 `/`）
  - ✅ `"llm-chat"`
  - ✅ `"smart-ocr"`
  - ✅ `"asset-manager"`
  - ❌ `"/llm-chat"`（错误格式）
- **默认值**: `"unknown"`（如果未指定）

## 如何为你的工具添加来源标识

### 1. 导入资产时指定 `sourceModule`

在调用任何资产导入方法时，通过 `AssetImportOptions` 传入 `sourceModule`：

```typescript
import { assetManagerEngine } from "@/composables/useAssetManager";

// 示例 1: 从路径导入
const asset = await assetManagerEngine.importAssetFromPath(filePath, {
  generateThumbnail: true,
  enableDeduplication: true,
  sourceModule: "your-tool-id", // 🔑 关键：使用你的工具 ID
});

// 示例 2: 从字节导入（如剪贴板、拖拽）
const asset = await assetManagerEngine.importAssetFromBytes(bytes, fileName, {
  sourceModule: "your-tool-id",
});

// 示例 3: 使用 composable
const { importAssetFromPath } = useAssetManager();
const asset = await importAssetFromPath(path, {
  sourceModule: "your-tool-id",
});
```

### 2. 确定你的工具 ID

你的工具 ID 应该与工具在 `toolsStore` 中注册的路径一致（去掉开头的 `/`）：

```typescript
// 示例：如果你的工具路由是 '/my-awesome-tool'
// 那么 sourceModule 应该是 'my-awesome-tool'

// 可以通过工具配置确认
// src/tools/my-awesome-tool/config.ts
export const myAwesomeToolConfig: ToolConfig = {
  id: "my-awesome-tool", // ✅ 使用这个 ID
  name: "我的工具",
  path: "/my-awesome-tool", // 路由路径
  // ...
};
```

### 3. 实际集成示例

#### 示例 A: LLM Chat 附件管理

```typescript
// src/tools/llm-chat/composables/useAttachmentManager.ts
const asset = await assetManagerEngine.importAssetFromPath(path, {
  options: {
    generateThumbnail,
    enableDeduplication: true,
    sourceModule: "llm-chat", // ✅ 明确标识来源
  },
});
```

#### 示例 B: Agent Store 导入图标

```typescript
// src/tools/llm-chat/agentStore.ts
const asset = await assetManagerEngine.importAssetFromBytes(
  binary,
  originalName,
  {
    sourceModule: "llm-chat", // ✅ 智能体图标也来自 llm-chat
  }
);
```

#### 示例 C: 从剪贴板导入（通用场景）

```typescript
// 在你的工具中
const { importAssetFromClipboard } = useAssetManager();

// 用户粘贴图片时
const asset = await importAssetFromClipboard({
  sourceModule: "your-tool-id", // ✅ 标识是从你的工具粘贴的
});
```

## 用户体验

设置 `sourceModule` 后，用户在资产管理器中可以：

1. **按模块筛选**: 在侧边栏"来源模块"区域选择特定工具
2. **按模块分组**: 在工具栏选择"按来源模块"分组
3. **查看统计**: 每个模块的资产数量统计

侧边栏会自动显示：

- 工具的图标（从 `toolsStore` 动态获取）
- 工具的名称（从 `toolsStore` 动态获取）
- 该模块的资产数量

## 最佳实践

### ✅ 推荐做法

1. **一致性**: 在同一工具的所有资产导入点都使用相同的 `sourceModule`
2. **明确性**: 始终显式指定 `sourceModule`，不要依赖默认值
3. **规范命名**: 使用 kebab-case，与工具 ID 保持一致

```typescript
// ✅ 好的实践
{
  sourceModule: "llm-chat";
}

// ❌ 避免的做法
{
  sourceModule: "LLMChat"; // 不符合命名规范
}
{
  // 没有指定，会变成 'unknown'
}
```

### ⚠️ 注意事项

1. **不要使用路径格式**: `sourceModule` 是 ID，不是路径

   ```typescript
   // ❌ 错误
   sourceModule: "/llm-chat";

   // ✅ 正确
   sourceModule: "llm-chat";
   ```

2. **避免重复导入**: 启用 `enableDeduplication` 以避免重复导入相同文件

   ```typescript
   {
     enableDeduplication: true,  // ✅ 推荐
     sourceModule: 'your-tool-id'
   }
   ```

3. **特殊模块处理**: 如果你的工具允许用户手动导入资产（如资产管理器本身），可以使用工具 ID 或 `'user-import'`

## 迁移指南

如果你的工具已经在使用资产管理器，请按以下步骤迁移：

### 步骤 1: 识别所有导入点

搜索你的代码中所有调用以下方法的地方：

- `assetManagerEngine.importAssetFromPath`
- `assetManagerEngine.importAssetFromBytes`
- `useAssetManager().importAssetFromPath`
- `useAssetManager().importAssetFromBytes`
- `useAssetManager().importAssetFromClipboard`

### 步骤 2: 添加 `sourceModule`

为每个调用添加 `sourceModule` 参数：

```typescript
// 迁移前
const asset = await importAssetFromPath(path, {
  generateThumbnail: true,
});

// 迁移后
const asset = await importAssetFromPath(path, {
  generateThumbnail: true,
  sourceModule: "your-tool-id", // 🆕 添加这一行
});
```

### 步骤 3: 测试

1. 运行你的工具并导入一些资产
2. 打开资产管理器
3. 验证侧边栏"来源模块"显示你的工具名称和图标
4. 点击筛选，确认只显示你工具的资产

## 技术细节

### 数据库架构

资产对象包含两个 `sourceModule` 字段：

```typescript
interface Asset {
  // ... 其他字段
  sourceModule: string; // 顶层字段，便于索引和筛选
  origin?: {
    type: AssetOriginType;
    source: string;
    sourceModule: string; // 嵌套字段，与 origin 信息一起存储
  };
}
```

### 后端处理

Rust 后端在导入时会：

1. 从 `AssetImportOptions.sourceModule` 读取值
2. 如果未提供，使用 `"unknown"` 作为默认值
3. 同时设置 `Asset.sourceModule` 和 `Asset.origin.sourceModule`

### 筛选逻辑

前端通过 `ListAssetsPaginatedPayload.filterSourceModule` 进行筛选：

```typescript
const payload = {
  page: 1,
  pageSize: 50,
  filterSourceModule: "llm-chat", // 只显示 LLM Chat 的资产
  // ... 其他参数
};
```

## 常见问题

### Q: 已经导入的资产会显示什么模块？

A: 旧资产的 `sourceModule` 会显示为 `"unknown"`（未知来源）。

### Q: 可以修改已导入资产的 `sourceModule` 吗？

A: 当前不支持。如果需要，可以删除后重新导入。

### Q: 多个工具可以使用相同的 `sourceModule` 吗？

A: 技术上可以，但不推荐。应该为每个工具使用唯一的 ID。

### Q: 如果工具更名了怎么办？

A: `sourceModule` 是存储在资产元数据中的，工具更名不会影响已导入的资产。建议保持 ID 稳定。

## 参考链接

- [资产管理类型定义](../src/types/asset-management.ts)
- [资产管理 Composable](../src/composables/useAssetManager.ts)
- [LLM Chat 集成示例](../src/tools/llm-chat/composables/useAttachmentManager.ts)

---

**最后更新**: 2025-11-14  
**版本**: 1.0
