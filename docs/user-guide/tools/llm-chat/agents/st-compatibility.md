# SillyTavern 兼容性指南

LLM Chat 深度兼容 SillyTavern (酒馆) 生态，支持导入其角色卡、预设消息和资源，让你能够无缝迁移已有的角色资产。

## 1. 角色卡导入

系统支持以下格式的 SillyTavern 角色卡：

- **PNG 角色卡**: 包含嵌入式元数据的图片文件。
- **JSON 角色卡**: 标准的角色定义文件。

### 导入流程

1. 在 Agent 列表顶部点击 **➕** -> **「导入 SillyTavern 角色卡」**。
2. 选择本地的卡片文件。
3. 系统将自动解析并填充：
   - **基础信息**: 名称、描述、性格。
   - **核心设定**: 场景描述 (Scenario)、角色设定 (Description)。
   - **预设消息**: 自动将 `First Message` 转换为开场白，将 `Alternate Greetings` 转换为可选预设。
   - **视觉资源**: 自动提取 PNG 图片作为 Agent 图标。

## 2. 消息注入策略兼容

SillyTavern 用户熟悉的“深度注入”在 LLM Chat 中得到了完整保留并增强：

- **Depth (深度)**: 控制消息在对话历史中的插入位置。
- **高级深度语法**: 支持 `3, 10~5` 这种多点或范围语法。
- **角色映射**: 自动处理 `char` 和 `user` 占位符的转换。

## 3. 正则管道与宏兼容

- **正则规则**: 支持导入 SillyTavern 格式的正则替换规则文件。
- **宏系统**: 兼容常用的酒馆宏，如 `{{char}}`, `{{user}}`, `{{description}}` 等。

## 4. 资产文件迁移

如果你导入的是一个包含子目录的复杂角色包，LLM Chat 会将其关联的媒体资源（图片、背景等）自动放入该 Agent 的私有[资产目录](./assets)中，并保持原有的引用关系。

---

### 相关阅读

- [Agent 资产管理](./assets)
- [正则管道系统](../context-pipeline/regex-pipeline)
- [宏系统参考](../macro-system/macro-reference)
