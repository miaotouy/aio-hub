# 智能体预设配置说明

该目录用于存放内置智能体（Agent）的预设元数据索引。

## 架构说明

为了支持更灵活的资产管理和异步加载，智能体预设系统进行了重构：

1.  **元数据索引**: 存放在 `src/config/agent-presets/index.ts` 中，记录所有内置预设的 ID、名称、描述和配置 URL。
2.  **完整配置与资产**: 存放在 `public/agent-presets/{id}/` 目录下。
    - `config.json` 或 `config.yaml`: 智能体的完整配置。
    - `icon.jpg`: 智能体的图标。
    - `assets/`: (可选) 智能体自带的附件。
      - `{filename}.{ext}`: 原始资产文件。
      - `.thumbnails/`: (可选) 资产的缩略图，通常为 `.jpg` 格式。

## 文件格式

支持以下格式：

- **JSON** (`config.json`): 适合简单的静态预设。
- **YAML** (`config.yaml`): 适合复杂的角色扮演预设，支持多行字符串。

## 字段规范

每个预设文件应包含以下字段，其类型定义于 `src/tools/llm-chat/types.ts` 的 `AgentPreset` 接口。

```typescript
interface AgentPreset {
  // 预设配置的版本号 (可选, 默认为 1)
  // 用于未来的配置迁移
  version?: number;

  // 预设的唯一ID (通常是文件名，由加载器自动注入)
  id: string;

  // 预设名称，将显示在UI上
  name: string;

  // 预设的简短描述
  description: string;

  // 预设的图标 (推荐使用 Emoji)
  icon: string;

  // 预设的消息列表 (例如，用于设置 System Prompt)
  // 类型为 ChatMessageNode[]
  presetMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;

  // 默认的模型参数
  parameters: {
    temperature: number;
    maxTokens?: number;
  };

  // 分类标签 (可选)，用于在UI中进行分组
  tags?: string[];

  // 资产分组定义 (可选)
  assetGroups?: Array<{
    id: string;
    displayName: string;
    icon?: string;
    sortOrder?: number;
  }>;

  // 智能体专属资产列表 (可选)
  assets?: Array<{
    id: string;
    path: string;
    type: "image" | "audio" | "video" | "file";
    group?: string;
    usage?: "inline" | "background";
    description?: string;
  }>;
}
```

## 资产引用规范

预设资产存放在智能体目录的 `assets/` 文件夹中。在 `presetMessages` 或回复内容中，可以使用特有的协议进行引用：

- **基本格式**: `agent-asset://{group}/{id}.{ext}`
- **图片引用**: `![描述](agent-asset://biaoqingbao/smile.png)` 或 `<img src="agent-asset://biaoqingbao/smile.png" />`
- **音视频引用**: `<audio src="agent-asset://bgm/theme.mp3" controls />`

> **注意**: 渲染引擎会自动根据 `group` 和 `id` 寻址到正确的物理文件。

## 示例 (`translator.json`)

```json
{
  "version": 1,
  "name": "多语言翻译专家",
  "description": "精通世界多种语言，提供精准、流畅的翻译。",
  "icon": "🌐",
  "presetMessages": [
    {
      "role": "system",
      "content": "你是一个专业的翻译引擎，请将用户提供的内容翻译成指定的目标语言。如果用户没有指定，则默认翻译成中文。请不要在翻译结果之外添加任何解释或无关内容。"
    }
  ],
  "parameters": {
    "temperature": 0.3
  },
  "tags": ["实用工具", "翻译"]
}
```

## 如何添加新内置预设

1.  在 `public/agent-presets/` 下为新预设创建一个子目录。
2.  在子目录下创建 `config.yaml` (或 `.json`) 和 `icon.jpg`。
3.  在 `src/config/agent-presets/index.ts` 中注册该预设的元数据。

## TypeScript 预设示例

TypeScript 预设适合需要动态生成内容的场景，例如包含项目类型定义的向导：

```typescript
import type { AgentPreset } from "@/tools/llm-chat/types";

// 动态生成的文档内容
const TYPE_DOCS = `
## 类型定义
...
`;

const preset: Omit<AgentPreset, "id"> = {
  version: 1,
  name: "配置向导",
  description: "帮助用户配置智能体",
  icon: "🧙",
  presetMessages: [
    {
      id: "system",
      parentId: null,
      childrenIds: ["chat-history"],
      content: `你是配置向导...\n${TYPE_DOCS}`,
      role: "system",
      status: "complete",
      isEnabled: true,
    },
    {
      id: "chat-history",
      parentId: "system",
      childrenIds: [],
      content: "聊天历史",
      role: "system",
      type: "chat_history",
      status: "complete",
      isEnabled: true,
    },
  ],
  parameters: {
    temperature: 0.5,
  },
  category: "workflow",
  tags: ["向导"],
};

export default preset;
```

## YAML 预设示例

YAML 格式适合复杂的角色扮演预设，支持多行字符串和更好的可读性：

```yaml
version: 1
name: 角色名称
description: 角色描述
icon: /agent-presets/character-id/icon.jpg
displayPresetCount: 2

presetMessages:
  - id: system-prompt
    parentId: null
    childrenIds: [user-profile]
    role: system
    content: |
      # 角色设定
      你是【角色名】...

      ## 性格特点
      - 特点1
      - 特点2
    status: complete
    isEnabled: true

  - id: user-profile
    parentId: system-prompt
    childrenIds: [greeting]
    role: system
    content: 用户档案
    type: user_profile
    status: complete
    isEnabled: true

  - id: greeting
    parentId: user-profile
    childrenIds: [chat-history]
    role: assistant
    content: 你好，{{user}}！
    status: complete
    isEnabled: true

  - id: chat-history
    parentId: greeting
    childrenIds: []
    role: system
    content: 聊天历史
    type: chat_history
    status: complete
    isEnabled: true

parameters:
  temperature: 0.8
  maxTokens: 8192

category: character
tags:
  - 动漫
  - 角色扮演

# 资产配置示例
assetGroups:
  - id: biaoqingbao
    displayName: 表情包
    icon: 😊
  - id: audio-bgm
    displayName: 背景音乐
    icon: 🎵

assets:
  - id: 喝茶
    path: assets/tea.png
    type: image
    group: biaoqingbao
    usage: inline
  - id: 战斗BGM
    path: assets/battle.mp3
    type: audio
    group: audio-bgm
```
