# Agent 组件目录结构

本目录包含所有与 Agent（智能体）相关的 UI 组件，按功能分类组织。

## 📁 目录结构

```
components/
├── management/            # Agent 生命周期管理
│   ├── CreateAgentDialog.vue         # 创建智能体对话框
│   ├── EditAgentDialog.vue           # 编辑智能体对话框
│   ├── AgentUpgradeDialog.vue        # 智能体升级对话框
│   └── MiniAgentList.vue             # 智能体列表组件
│
├── agent-editor/          # 核心 Agent 编辑器
│   ├── agentEditConfig.ts            # 编辑器页签表（含「模型参数」「上下文」页签）
│   ├── AgentEditor.vue               # 主编辑器组件
│   ├── components/
│   │   └── VisualGuidelineEditor.vue # 视觉化输出指南编辑器
│   └── sections/                     # 编辑器各个配置区块
│       ├── BasicInfoSection.vue
│       ├── CapabilitiesSection.vue
│       ├── EnvironmentSection.vue
│       ├── KnowledgeLibrarySection.vue
│       ├── ModelConfigSection.vue        # 模型选择（侧边栏与设置页复用）
│       ├── OutputDisplaySection.vue
│       ├── PersonalitySection.vue
│       ├── RecallSection.vue
│       ├── RecallBindingItem.vue
│       ├── SessionVariableSection.vue
│       ├── ToolCallingSection.vue
│       ├── ToolCallingItem.vue
│       ├── VariableTreeEditor.vue
│       └── VariableTreeItem.vue
│
├── parameters/            # 模型参数与上下文参数面板
│   ├── parameterEditorConfig.ts      # 参数分组、搜索元数据与可见性规则
│   ├── ModelParametersEditor.vue     # 模型/上下文参数编辑器（两页共用）
│   ├── ParameterItem.vue             # 参数项组件
│   ├── SafetySettingsPanel.vue       # Gemini 安全设置面板
│   ├── CustomParamsPanel.vue         # 自定义参数面板
│   ├── ContextStatsCard.vue          # 上下文统计卡片
│   ├── ContextCompressionConfigPanel.vue # 上下文压缩配置
│   └── PostProcessingPanel.vue       # 上下文后处理配置
│
├── assets/                # 资产与预设管理
│   ├── useAgentAssetsManager.ts      # 资产管理器逻辑
│   ├── usePresetImportExport.ts      # 预设导入导出
│   ├── usePresetTokenCalculator.ts   # 预设 Token 计算
│   ├── presetGroupState.ts           # 预设分组状态
│   ├── AgentAssetsManager.vue        # 智能体资产管理器
│   ├── AgentAssetsDialog.vue         # 资产选择对话框
│   ├── AgentAssetsGrid.vue / AgentAssetsSidebar.vue / AgentAssetsToolbar.vue
│   ├── AgentAssetEditDialog.vue / AgentAssetThumbnail.vue / AgentMediaPreview.vue
│   ├── AgentBatchMoveDialog.vue / AgentGroupEditDialog.vue
│   ├── AgentGreetingEditor.vue       # 打招呼消息编辑器
│   ├── AgentPresetEditor.vue         # 预设消息编辑器
│   ├── AgentPresetBatchDialog.vue    # 批量预设对话框
│   ├── PresetGroupPanel.vue / PresetGroupEditDialog.vue / PresetMessageCard.vue
│   └── STPresetImportDialog.vue      # SillyTavern 预设导入
│
├── editors/               # 专项编辑器
│   ├── PresetMessageEditor.vue       # 预设消息编辑器
│   ├── PresetAttachmentPicker.vue    # 预设附件选择器
│   ├── RecallPlaceholderEditor.vue   # Recall 占位符编辑器
│   ├── ModelMatchConfig.vue          # 模型匹配配置
│   └── InjectionConfig.vue           # 注入配置
│
└── selectors/             # 选择器与切换器
    ├── QuickAgentSwitch.vue          # 快速切换智能体
    ├── VariableSelector.vue          # 变量选择器
    └── MacroSelector.vue             # 宏选择器
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

- `AgentAssetsManager` - 完整的资产管理界面（逻辑在 `useAgentAssetsManager`）
- `AgentAssetsDialog` - 资产选择对话框
- `AgentPresetEditor` / `AgentGreetingEditor` - 编辑预设消息与打招呼消息
- `AgentPresetBatchDialog` - 批量管理预设消息
- `STPresetImportDialog` - 从 SillyTavern 导入预设
- `usePresetImportExport` / `usePresetTokenCalculator` / `presetGroupState` - 预设导入导出、Token 计算与分组状态

### selectors/ - 选择器

提供各种选择和切换功能的 UI 组件。

**主要组件：**

- `QuickAgentSwitch` - 快速切换当前使用的智能体
- `VariableSelector` - 选择会话变量
- `MacroSelector` - 选择和插入宏

### parameters/ - 参数配置

管理 LLM 模型参数与上下文配置的界面。「模型参数」「上下文」两个编辑页签共用 `ModelParametersEditor` 与同一份草稿状态（提交 `36cd567e2`，2026-10-11）。

**主要组件：**

- `parameterEditorConfig` - 参数分组、搜索元数据与可见性规则（配置入口）
- `ModelParametersEditor` - 模型/上下文参数编辑器
- `ParameterItem` - 单个参数项的渲染组件
- `SafetySettingsPanel` / `CustomParamsPanel` - Gemini 安全设置与自定义参数面板
- `ContextStatsCard` / `ContextCompressionConfigPanel` / `PostProcessingPanel` - 上下文统计、压缩与后处理配置

### editors/ - 专项编辑器

特定功能的编辑器组件。

**主要组件：**

- `PresetMessageEditor` - 编辑单条预设消息
- `PresetAttachmentPicker` - 预设消息附件选择器
- `RecallPlaceholderEditor` - 编辑 Recall 检索占位符；Knowledge 只保留目录宏选择入口
- `ModelMatchConfig` / `InjectionConfig` - 模型匹配与注入配置

### agent-editor/ - 核心编辑器

Agent 的主编辑器及其各个配置区块。

**主要组件：**

- `AgentEditor` - 主编辑器容器
- `agentEditConfig` - 编辑器页签表，集中定义「基础设定」「角色设定」「模型参数」「上下文」等页签及其搜索关键词
- `sections/` - 各个配置区块（基本信息、角色设定、模型选择、能力、输出显示等）

## 🔗 导入路径示例

```typescript
// 从其他模块导入
import EditAgentDialog from "@/tools/agent-manager/components/management/EditAgentDialog.vue";
import MacroSelector from "@/tools/agent-manager/components/selectors/MacroSelector.vue";

// 从 components 目录内部导入（相对路径）
import AgentPresetEditor from "./assets/AgentPresetEditor.vue";
import VariableSelector from "./selectors/VariableSelector.vue";
```

## 📌 注意事项

1. **导入路径**: 文件移动后，所有导入路径已更新为正确的相对路径或绝对路径
2. **Git 历史**: 所有文件使用 `git mv` 移动，保留了完整的提交历史
3. **类型安全**: 所有 TypeScript 类型检查已通过验证
4. **向后兼容**: 外部引用已全部更新，不影响现有功能

## 🔄 重构历史

- **2026-03-13**: 完成目录结构重组，按功能分类组织所有 Agent 相关组件
- **2026-10-18**: 按当前实际目录重绘树形结构，补入模型参数与上下文配置页签（`agentEditConfig.ts`、`parameterEditorConfig.ts`）等新入口，修正旧 `llm-chat` 导入路径示例
