# 快捷操作 (Quick Actions) 功能设计方案

## 1. 需求背景

用户希望在聊天输入框中能够快速执行一些预定义的操作，例如：

- 点击按钮添加特定内容（宏）。
- 将输入框中的内容（或选中的内容）一键包装，如添加代码块、HTML 折叠标签等，以优化消息流显示。

## 2. 核心设计

### 2.1. 系统架构 (类世界书设计)

快捷操作将采用与“世界书 (Worldbook)”一致的多级管理与关联机制：

- **独立库管理**：快捷操作以“组 (Set)”为单位存储在独立文件中，通过 `QuickActionStore` 统一管理。
- **多级关联**：支持在全局、智能体 (Agent)、用户档案 (User Profile) 三个层级进行关联。
- **聚合显示**：输入框工具栏会聚合当前上下文（全局 + 当前 Agent + 当前 Profile）中所有激活的快捷操作。

### 2.2. 数据结构

```typescript
// src/tools/llm-chat/types/quick-action.ts

export interface QuickAction {
  id: string;
  label: string; // 按钮显示的文本
  content: string; // 模板内容，支持 {{input}} 占位符
  autoSend: boolean; // 点击后是否自动发送
  icon?: string; // 可选图标 (Lucide 名称)
  description?: string; // 详细描述
  hotkey?: string; // 绑定的快捷键 (可选)
}

export interface QuickActionSet {
  id: string;
  name: string; // 组名，如 "代码助手"
  description?: string; // 组描述
  actions: QuickAction[];
  isEnabled: boolean; // 是否启用
  updatedAt: string;
}

/** 快捷操作组元数据 */
export interface QuickActionSetMetadata {
  id: string;
  name: string;
  actionCount: number;
  updatedAt: string;
}
```

### 2.3. 关联配置

- **全局关联 (`ChatSettings`)**:
  ```typescript
  quickActionSetIds: string[]; // 全局生效的快捷操作组 ID
  ```
- **智能体关联 (`ChatAgent`)**:
  ```typescript
  quickActionSetIds?: string[]; // 智能体专属关联
  ```
- **用户档案关联 (`UserProfile`)**:
  ```typescript
  quickActionSetIds?: string[]; // 用户档案关联
  ```

### 2.2. 默认快捷操作 (Default Actions)

根据用户提供的配置，预设以下组：

#### 组：代码助手

- **包入隐藏代码块**: `<!--\n\`\`\`\n{{input}}\n\`\`\`\n-->\n\n\n`
- **追加隐藏代码块**: `{{input}}\n\n<!--\n\`\`\`\n\n\`\`\`\n-->\n\n\n`
- **完整代码**: `{{input}}\n\n合并更新刚才讨论的内容到对应的最新完整版本，让我一键复制。`

#### 组：通用工具

- **HTML 折叠**: `<details>\n<summary>点击展开内容</summary>\n\n{{input}}\n\n</details>`
- **引用**: `> {{input}}`

### 2.3. 执行流程

1. **获取上下文**: 获取当前编辑器选中的文本 `selectedText`。
2. **确定内容**:
   - 如果有选中，则 `content = selectedText`。
   - 如果无选中，则 `content = 全文`。
3. **模板替换**: 将模板中的 `{{input}}` 替换为 `content`。
4. **宏解析 (可选)**: 如果模板中包含其他宏（如 `{{time}}`），调用宏引擎进行二次解析。
5. **写回编辑器**: 将处理后的内容替换回编辑器。

## 3. 实现细节

### 3.1. 存储层 (Storage & Store)

- **`src/tools/llm-chat/stores/quickActionStore.ts`**: 模仿 `worldbookStore`，管理索引和内存缓存。
- **`src/tools/llm-chat/composables/storage/useQuickActionStorage.ts`**: 负责 `quick-actions-index.json` 和 `quick-actions/{id}.json` 的持久化。

### 3.2. UI 管理界面 (借鉴世界书编辑器)

- **`src/tools/llm-chat/components/quick-action/QuickActionFullManager.vue`**:
  - 左侧：组列表（搜索、新建、导入、导出、批量操作）。
  - 右侧：组详情（组名编辑、Action 列表管理）。
- **`src/tools/llm-chat/components/quick-action/QuickActionDetail.vue`**:
  - 模仿 `WorldbookDetail`，提供 Action 的行内编辑（Label, Icon, AutoSend）和详细编辑（Template 内容）。
- **`src/tools/llm-chat/components/quick-action/QuickActionSelector.vue`**:
  - 用于在 Agent/Profile 编辑器中进行关联选择。

### 3.3. 输入框集成

- **`MessageInputToolbar.vue`**:
  - 聚合当前上下文所有激活的 `QuickActionSet`。
  - 使用 `el-popover` 展示分类列表。
- **`useMessageInputActions.ts`**:
  - 核心执行逻辑：
    1. 准备宏上下文：将选中文字（或全文）注入 `MacroContext.input`。
    2. 调用 `MacroProcessor.process()` 处理 Action 模板。
    3. 写回编辑器并处理自动发送。

### 3.4. 宏引擎增强 (`src/tools/llm-chat/macro-engine`)

- **激活 `{{input}}` 宏**：在 `macros/core.ts` 中将 `input` 宏标记为 `supported: true`。
- **扩展上下文**：确保 `MacroContext` 能够承载快捷操作执行时的瞬时状态。

## 4. 任务清单

- [ ] 定义数据结构与默认设置
- [ ] 实现核心逻辑函数
- [ ] 集成到工具栏 UI
- [ ] 实现设置管理界面
- [ ] 测试各种场景（选中包装、全文包装、插入宏等）
