# 智能体预设配置说明

该目录用于存放所有“LLM 对话”工具中智能体（Agent）的预设模板。每个文件代表一个独立的预设，方便用户快速创建具有特定功能的智能体。

## 文件格式

- 仅支持 `.json` 格式。
- 文件名将作为预设的唯一标识符（ID），建议使用有意义的英文命名（例如 `code_assistant.json`）。

## 字段规范

每个预设文件应包含以下字段，其类型定义于 `src/tools/llm-chat/types.ts` 的 `AgentPreset` 接口。

```typescript
interface AgentPreset {
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

1.  在此目录下创建一个新的 `.json` 文件。
2.  遵循上述字段规范填写内容。
3.  系统将自动发现并加载新的预设，无需修改任何代码。
