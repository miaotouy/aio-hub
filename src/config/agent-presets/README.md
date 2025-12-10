# 智能体预设配置说明

该目录用于存放所有"LLM 对话"工具中智能体（Agent）的预设模板。每个文件代表一个独立的预设，方便用户快速创建具有特定功能的智能体。

## 文件格式

支持以下三种格式：

- **JSON** (`.json`): 适合简单的静态预设
- **YAML** (`.yaml`, `.yml`): 适合复杂的角色扮演预设，支持多行字符串
- **TypeScript** (`.ts`): 适合需要动态生成内容的预设，如包含类型定义文档的向导

文件名将作为预设的唯一标识符（ID），建议使用有意义的英文命名（例如 `code-assistant.json`）。

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
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  
  // 默认的模型参数
  parameters: {
    temperature: number;
    maxTokens?: number;
  };

  // 分类标签 (可选)，用于在UI中进行分组
  tags?: string[];
}
```

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

## 如何添加新预设

1.  在此目录下创建一个新的 `.json`、`.yaml` 或 `.ts` 文件。
2.  遵循上述字段规范填写内容。
3.  系统将自动发现并加载新的预设，无需修改任何代码。

## TypeScript 预设示例

TypeScript 预设适合需要动态生成内容的场景，例如包含项目类型定义的向导：

```typescript
import type { AgentPreset } from '@/tools/llm-chat/types';

// 动态生成的文档内容
const TYPE_DOCS = `
## 类型定义
...
`;

const preset: Omit<AgentPreset, 'id'> = {
  version: 1,
  name: '配置向导',
  description: '帮助用户配置智能体',
  icon: '🧙',
  presetMessages: [
    {
      id: 'system',
      parentId: null,
      childrenIds: ['chat-history'],
      content: `你是配置向导...\n${TYPE_DOCS}`,
      role: 'system',
      status: 'complete',
      isEnabled: true,
    },
    {
      id: 'chat-history',
      parentId: 'system',
      childrenIds: [],
      content: '聊天历史',
      role: 'system',
      type: 'chat_history',
      status: 'complete',
      isEnabled: true,
    },
  ],
  parameters: {
    temperature: 0.5,
  },
  category: 'workflow',
  tags: ['向导'],
};

export default preset;
```

## YAML 预设示例

YAML 格式适合复杂的角色扮演预设，支持多行字符串和更好的可读性：

```yaml
version: 1
name: 角色名称
description: 角色描述
icon: /agent-icons/character.jpg
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
```
