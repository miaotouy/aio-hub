# 模板锚点系统设计

## 1. 背景与动机

当前锚点系统存在以下局限：

1. **硬编码处理**：`injection-assembler.ts` 中对 `USER_PROFILE` 的处理是硬编码的
2. **锚点类型单一**：所有锚点都是"纯占位符"，不支持自身携带内容
3. **扩展性差**：未来如果需要新的"内容锚点"，需要修改核心代码

**需求**：设计一个通用机制，让锚点可以选择性地携带模板内容，而不是硬编码特定锚点。

## 2. 核心概念

### 2.1. 锚点分类

| 类型 | 描述 | 示例 |
|------|------|------|
| **纯占位符锚点** | 只标记位置，不渲染自身内容 | `chat_history` |
| **模板锚点** | 标记位置的同时，渲染自身的模板内容 | `user_profile` |

### 2.2. 模板锚点特性

模板锚点具有以下特性：

1. **可编辑内容**：用户可以在预设编辑器中编辑消息的 `content` 字段
2. **宏替换**：内容支持宏替换（如 `{{user}}`, `{{persona}}` 等）
3. **条件渲染**：如果内容为空或仅含空白，则不渲染
4. **仍可作为注入目标**：其他消息仍可注入到该锚点的 before/after 位置

### 2.3. 默认模板

模板锚点可以有默认模板内容，例如 `user_profile` 的默认模板：

```markdown
### {{user}}的档案

{{persona}}
```

## 3. 类型定义变更

### 3.1. 扩展 `AnchorDefinition`

```typescript
// src/tools/llm-chat/composables/useAnchorRegistry.ts

export interface AnchorDefinition {
  /** 锚点的唯一标识符 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 锚点描述 */
  description: string;
  /** 是否为系统内置锚点 */
  isSystem: boolean;
  
  // === 新增字段 ===
  
  /**
   * 是否为模板锚点
   * - true: 模板锚点，会渲染消息的 content 字段（支持宏替换）
   * - false: 纯占位符，只标记位置，不渲染自身内容
   * 默认为 false
   */
  hasTemplate?: boolean;
  
  /**
   * 默认模板内容
   * 当 hasTemplate 为 true 时，新建该类型消息时使用此默认内容
   */
  defaultTemplate?: string;
}
```

### 3.2. 系统锚点定义更新

```typescript
const SYSTEM_ANCHORS: AnchorDefinition[] = [
  {
    id: 'chat_history',
    name: '会话历史',
    description: '会话消息的插入位置',
    isSystem: true,
    hasTemplate: false,  // 纯占位符
  },
  {
    id: 'user_profile',
    name: '用户档案',
    description: '用户档案内容的插入位置，支持模板编辑',
    isSystem: true,
    hasTemplate: true,   // 模板锚点
    defaultTemplate: `### {{user}}的档案

{{persona}}`,
  },
];
```

## 4. 处理流程变更

### 4.1. `injection-assembler.ts` 变更

移除硬编码的 `USER_PROFILE` 处理，改为通用逻辑：

```typescript
// 辅助函数：检查消息是否为锚点消息
const isAnchorMessage = (msg: ChatMessageNode): boolean => {
  // 如果 type 存在且不是 'message'，检查是否为已注册锚点
  if (msg.type && msg.type !== 'message') {
    const anchor = anchorRegistry.getAnchorById(msg.type);
    return !!anchor;
  }
  return false;
};

// 辅助函数：检查锚点是否为模板锚点
const isTemplateAnchor = (anchorId: string): boolean => {
  const anchor = anchorRegistry.getAnchorById(anchorId);
  return anchor?.hasTemplate ?? false;
};

// 处理骨架消息时的通用逻辑
for (const msg of skeletonMessages) {
  if (msg.isEnabled === false) continue;
  
  // 检查是否为锚点消息
  if (msg.type && msg.type !== 'message') {
    const anchorId = msg.type;
    
    // 注入 before 消息
    finalMessages.push(...buildAnchorMessages(anchorId, 'before'));
    
    // 如果是模板锚点，渲染其内容
    if (isTemplateAnchor(anchorId)) {
      const content = processedContents.get(msg.id) ?? msg.content;
      if (content && content.trim()) {
        pushSkeletonMessage(msg);
      }
    }
    // 如果是纯占位符锚点（如 chat_history），这里什么都不做
    // chat_history 的内容由专门的历史插入逻辑处理
    
    // 注入 after 消息
    finalMessages.push(...buildAnchorMessages(anchorId, 'after'));
    continue;
  }
  
  // 普通消息直接添加
  pushSkeletonMessage(msg);
}
```

### 4.2. 特殊处理：`chat_history`

`chat_history` 锚点需要特殊处理，因为它的"内容"是会话历史而非消息的 `content` 字段：

```typescript
// chat_history 锚点的处理仍然是特殊的
// 它的"内容"是 historyWithDepthInjections，不是消息的 content 字段
if (msg.type === SYSTEM_ANCHORS.CHAT_HISTORY) {
  finalMessages.push(...buildAnchorMessages(SYSTEM_ANCHORS.CHAT_HISTORY, 'before'));
  finalMessages.push(...historyWithDepthInjections);
  finalMessages.push(...buildAnchorMessages(SYSTEM_ANCHORS.CHAT_HISTORY, 'after'));
  continue;
}
```

## 5. UI 变更

### 5.1. `AgentPresetEditor.vue` 变更

在编辑器中，根据锚点类型决定是否显示内容编辑器：

```vue
<template>
  <!-- 锚点消息卡片 -->
  <div v-if="isAnchorType(element.type)" class="anchor-card">
    <div class="anchor-header">
      <el-tag>{{ getAnchorDisplayName(element.type) }}</el-tag>
    </div>
    
    <!-- 模板锚点：显示内容编辑器 -->
    <div v-if="isTemplateAnchor(element.type)" class="template-editor">
      <el-input
        v-model="element.content"
        type="textarea"
        :rows="4"
        placeholder="输入模板内容，支持宏替换如 {{user}}, {{persona}}"
      />
      <div class="macro-hints">
        支持的宏：{{user}}, {{char}}, {{persona}}, {{description}} 等
      </div>
    </div>
    
    <!-- 纯占位符锚点：只显示说明 -->
    <div v-else class="placeholder-hint">
      此锚点标记会话历史的插入位置
    </div>
  </div>
</template>

<script setup>
import { useAnchorRegistry } from '@/tools/llm-chat/composables/useAnchorRegistry';

const { getAnchorById, hasAnchor } = useAnchorRegistry();

const isAnchorType = (type?: string) => {
  return type && type !== 'message' && hasAnchor(type);
};

const isTemplateAnchor = (type?: string) => {
  if (!type) return false;
  const anchor = getAnchorById(type);
  return anchor?.hasTemplate ?? false;
};

const getAnchorDisplayName = (type?: string) => {
  if (!type) return '';
  const anchor = getAnchorById(type);
  return anchor?.name ?? type;
};
</script>
```

### 5.2. 新建消息时的默认内容

当用户添加一个模板锚点消息时，使用锚点的 `defaultTemplate` 作为初始内容：

```typescript
const addAnchorMessage = (anchorId: string) => {
  const anchor = getAnchorById(anchorId);
  if (!anchor) return;
  
  const newMessage: ChatMessageNode = {
    id: generateId(),
    parentId: null,
    childrenIds: [],
    content: anchor.defaultTemplate ?? '',  // 使用默认模板
    role: 'system',
    status: 'complete',
    type: anchorId as MessageType,
  };
  
  // 添加到预设消息列表
  // ...
};
```

## 6. Token 计算变更

在 `token-limiter.ts` 或相关处理中，需要考虑模板锚点的内容：

- **模板锚点**：计算其处理后内容的 token 数
- **纯占位符锚点**：不计算自身 token（其内容是动态填充的）

## 7. 配置文件格式

预设 YAML 文件中，模板锚点消息的格式：

```yaml
messages:
  - role: system
    content: |
      ### {{user}}的档案
      
      {{persona}}
    type: user_profile
    
  - role: system
    content: ""  # 内容为空，chat_history 的内容由系统填充
    type: chat_history
```

## 8. 兼容性

### 8.1. 向后兼容

- 现有预设中 `type: user_profile` 的消息，其 `content` 字段会被当作模板处理
- 如果 `content` 为空或固定文本（如旧版的 "用户档案"），行为保持不变

### 8.2. 未来扩展

插件可以注册自己的模板锚点：

```typescript
// 插件代码
anchorRegistry.registerAnchor({
  id: 'world_info',
  name: '世界设定',
  description: '世界观和背景设定',
  hasTemplate: true,
  defaultTemplate: `## 世界观

{{worldDescription}}`,
});
```

## 9. 实施步骤

1. **修改类型定义**：扩展 `AnchorDefinition` 接口
2. **更新系统锚点**：添加 `hasTemplate` 和 `defaultTemplate` 字段
3. **重构 `injection-assembler.ts`**：移除硬编码，使用通用逻辑
4. **更新 `AgentPresetEditor.vue`**：支持模板锚点编辑
5. **更新预设文件**：为 `user_profile` 添加默认模板
6. **测试验证**：确保新旧预设都能正常工作

## 10. 设计原则

1. **不硬编码**：不针对特定锚点（如 `USER_PROFILE`）进行硬编码处理
2. **通用机制**：所有锚点通过 `hasTemplate` 字段统一控制行为
3. **渐进增强**：新字段可选，默认值保持向后兼容
4. **插件友好**：插件可以注册自己的模板锚点

然后是向后兼容，找个地方将那种旧格式的转换到新格式，反正旧的不能编辑（通常），都是一样的