# Agent 组件目录结构

本目录包含所有与 Agent（智能体）相关的 UI 组件，按功能分类组织。

## 📁 目录结构

```
agent/
├── management/          # Agent 生命周期管理
│   ├── CreateAgentDialog.vue       # 创建智能体对话框
│   ├── EditAgentDialog.vue         # 编辑智能体对话框
│   ├── AgentUpgradeDialog.vue      # 智能体升级对话框
│   └── MiniAgentList.vue           # 智能体列表组件
│
├── assets/              # 资产与预设管理
│   ├── AgentAssetsManager.vue      # 智能体资产管理器
│   ├── AgentAssetsDialog.vue       # 资产选择对话框
│   ├── AgentPresetEditor.vue       # 预设消息编辑器
│   ├── AgentPresetBatchDialog.vue  # 批量预设对话框
│   └── STPresetImportDialog.vue    # SillyTavern 预设导入
│
├── selectors/           # 选择器与切换器
│   ├── QuickAgentSwitch.vue        # 快速切换智能体
│   ├── VariableSelector.vue        # 变量选择器
│   └── MacroSelector.vue           # 宏选择器
│
├── parameters/          # 参数配置面板
│   ├── ModelParametersEditor.vue   # 模型参数编辑器
│   └── ParameterItem.vue           # 参数项组件
│
├── editors/             # 专项编辑器
│   ├── PresetMessageEditor.vue     # 预设消息编辑器
│   └── kb-placeholder-editor/
│       └── KBPlaceholderEditor.vue # 知识库占位符编辑器
│
└── agent-editor/        # 核心 Agent 编辑器
    ├── agentEditConfig.ts          # 编辑器配置
    ├── AgentEditor.vue             # 主编辑器组件
    └── sections/                   # 编辑器各个配置区块
        ├── BasicInfoSection.vue
        ├── CapabilitiesSection.vue
        ├── OutputDisplaySection.vue
        ├── PersonalitySection.vue
        ├── SessionVariableSection.vue
        ├── ToolCallingSection.vue
        ├── VariableTreeEditor.vue
        └── VariableTreeItem.vue
```

## 📝 分类说明

### management/ - 生命周期管理
管理 Agent 的创建、编辑、升级等核心生命周期操作。

**主要组件：**
- `CreateAgentDialog` - 创建新智能体的对话框
- `EditAgentDialog` - 编辑现有智能体的对话框
- `AgentUpgradeDialog` - 处理智能体版本升级
- `MiniAgentList` - 紧凑的智能体列表，用于快速切换

### assets/ - 资产管理
处理智能体的资产（图片、文件等）和预设消息的管理。

**主要组件：**
- `AgentAssetsManager` - 完整的资产管理界面
- `AgentAssetsDialog` - 资产选择对话框
- `AgentPresetEditor` - 编辑预设消息
- `AgentPresetBatchDialog` - 批量管理预设消息
- `STPresetImportDialog` - 从 SillyTavern 导入预设

### selectors/ - 选择器
提供各种选择和切换功能的 UI 组件。

**主要组件：**
- `QuickAgentSwitch` - 快速切换当前使用的智能体
- `VariableSelector` - 选择会话变量
- `MacroSelector` - 选择和插入宏

### parameters/ - 参数配置
管理 LLM 模型参数的配置界面。

**主要组件：**
- `ModelParametersEditor` - 完整的参数编辑器
- `ParameterItem` - 单个参数项的渲染组件

### editors/ - 专项编辑器
特定功能的编辑器组件。

**主要组件：**
- `PresetMessageEditor` - 编辑单条预设消息
- `KBPlaceholderEditor` - 编辑知识库占位符

### agent-editor/ - 核心编辑器
Agent 的主编辑器及其各个配置区块。

**主要组件：**
- `AgentEditor` - 主编辑器容器
- `sections/` - 各个配置区块（基本信息、能力、输出显示等）

## 🔗 导入路径示例

```typescript
// 从其他 llm-chat 组件导入
import EditAgentDialog from "@/tools/llm-chat/components/agent/management/EditAgentDialog.vue";
import MacroSelector from "@/tools/llm-chat/components/agent/selectors/MacroSelector.vue";

// 从 agent 目录内部导入（相对路径）
import AgentPresetEditor from "../assets/AgentPresetEditor.vue";
import VariableSelector from "../selectors/VariableSelector.vue";
```

## 📌 注意事项

1. **导入路径**: 文件移动后，所有导入路径已更新为正确的相对路径或绝对路径
2. **Git 历史**: 所有文件使用 `git mv` 移动，保留了完整的提交历史
3. **类型安全**: 所有 TypeScript 类型检查已通过验证
4. **向后兼容**: 外部引用已全部更新，不影响现有功能

## 🔄 重构历史

- **2026-03-13**: 完成目录结构重组，按功能分类组织所有 Agent 相关组件