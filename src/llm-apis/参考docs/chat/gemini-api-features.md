# Gemini API 高级功能使用指南

本文档介绍了 Gemini API 实现中的高级功能及使用方法。

## 📋 目录

1. [多模态支持](#多模态支持)
2. [思考功能](#思考功能)
3. [代码执行](#代码执行)
4. [语音生成](#语音生成)
5. [JSON Schema 响应](#json-schema-响应)
6. [安全设置](#安全设置)
7. [高级参数](#高级参数)

---

## 多模态支持

### 图片分析

```typescript
const options: LlmRequestOptions = {
  profileId: "gemini-profile",
  modelId: "gemini-2.0-flash",
  messages: [
    { type: "text", text: "这张图片里有什么？" },
    { type: "image", imageBase64: "base64编码的图片数据" }
  ]
};
```

### PDF 文档分析

```typescript
const options: LlmRequestOptions = {
  profileId: "gemini-profile",
  modelId: "gemini-2.0-flash",
  messages: [
    { type: "text", text: "总结这份PDF文档" },
    {
      type: "document",
      documentSource: {
        mimeType: "application/pdf",
        data: "base64编码的PDF数据"
      }
    }
  ]
};
```

> **⚠️ 文件上传限制**
>
> PDF 文件仅支持通过 `inlineData` (base64) 方式上传，不支持 `fileData.fileUri` 或 File API。
>
> 虽然代码中预留了 `fileData.fileUri` 的接口（见 [src/llm-apis/gemini.ts:234-241](src/llm-apis/gemini.ts:234)），但在当前版本中，该功能尚未完整实现或启用。实际使用时请统一使用 base64 方式上传。

### 音频/视频处理

```typescript
// 音频
const audioOptions: LlmRequestOptions = {
  messages: [
    { type: "text", text: "描述这段音频" },
    {
      type: "document",
      documentSource: {
        mimeType: "audio/mpeg",
        data: "base64编码的音频数据"
      }
    }
  ]
};

// 视频
const videoOptions: LlmRequestOptions = {
  messages: [
    { type: "text", text: "转录这段视频中的音频并提供视觉描述" },
    {
      type: "document",
      documentSource: {
        mimeType: "video/mp4",
        data: "base64编码的视频数据"
      }
    }
  ]
};
```

> **⚠️ 文件上传限制**
>
> 音频和视频文件仅支持通过 `inlineData` (base64) 方式上传，不支持 `fileData.fileUri` 或 File API。
>
> 虽然代码中预留了 `fileData.fileUri` 的接口（见 [src/llm-apis/gemini.ts:234-241](src/llm-apis/gemini.ts:234)），但在当前版本中，该功能尚未完整实现或启用。实际使用时请统一使用 base64 方式上传。

---

## 思考功能

启用思考模式可以让模型展示其推理过程：

```typescript
const options: LlmRequestOptions = {
  profileId: "gemini-profile",
  modelId: "gemini-2.0-flash",
  messages: [
    { type: "text", text: "解释量子纠缠的原理" }
  ],
  // 扩展参数
  thinkingConfig: {
    includeThoughts: true,
    thinkingBudget: 1000  // 思考 token 数量
  }
} as any;

// 响应中会包含 reasoningContent 字段
const response = await callGeminiApi(profile, options);
console.log(response.reasoningContent); // 思考内容
console.log(response.content);          // 最终回答
```

---

## 代码执行

允许模型执行 Python 代码来解决问题：

```typescript
const options: LlmRequestOptions = {
  profileId: "gemini-profile",
  modelId: "gemini-2.0-flash",
  messages: [
    { type: "text", text: "计算斐波那契数列的第50项" }
  ],
  // 扩展参数：启用代码执行
  enableCodeExecution: true
} as any;

// 响应会包含生成的代码和执行结果
```

---

## 语音生成

配置语音输出参数：

```typescript
const options: LlmRequestOptions = {
  profileId: "gemini-profile",
  modelId: "gemini-2.0-flash",
  messages: [
    { type: "text", text: "介绍人工智能的发展历史" }
  ],
  // 扩展参数
  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: "zh-CN-Standard-A"
      }
    },
    languageCode: "zh-CN"
  },
  responseModalities: ["TEXT", "AUDIO"]
} as any;
```

### 支持的语言代码

- `zh-CN`: 中文（简体）
- `en-US`: 英语（美国）
- `ja-JP`: 日语
- `ko-KR`: 韩语
- `fr-FR`: 法语
- `de-DE`: 德语
- 等等...

---

## JSON Schema 响应

强制模型按照指定的 JSON Schema 返回结构化数据：

```typescript
const options: LlmRequestOptions = {
  profileId: "gemini-profile",
  modelId: "gemini-2.0-flash",
  messages: [
    { type: "text", text: "列出5个流行的饼干食谱" }
  ],
  responseFormat: {
    type: "json_schema",
    json_schema: {
      name: "cookie_recipes",
      schema: {
        type: "object",
        properties: {
          recipes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                recipe_name: { type: "string" },
                ingredients: {
                  type: "array",
                  items: { type: "string" }
                },
                prep_time: { type: "string" }
              },
              required: ["recipe_name"]
            }
          }
        },
        required: ["recipes"]
      }
    }
  }
};
```

---

## 安全设置

自定义内容安全过滤级别：

```typescript
const options: LlmRequestOptions = {
  profileId: "gemini-profile",
  modelId: "gemini-2.0-flash",
  messages: [
    { type: "text", text: "你的问题" }
  ],
  // 扩展参数
  safetySettings: [
    {
      category: "HARM_CATEGORY_HARASSMENT",
      threshold: "BLOCK_ONLY_HIGH"
    },
    {
      category: "HARM_CATEGORY_HATE_SPEECH",
      threshold: "BLOCK_MEDIUM_AND_ABOVE"
    },
    {
      category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      threshold: "BLOCK_ONLY_HIGH"
    },
    {
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE"
    }
  ]
} as any;
```

### 安全类别

- `HARM_CATEGORY_HARASSMENT`: 骚扰内容
- `HARM_CATEGORY_HATE_SPEECH`: 仇恨言论
- `HARM_CATEGORY_SEXUALLY_EXPLICIT`: 露骨色情内容
- `HARM_CATEGORY_DANGEROUS_CONTENT`: 危险内容
- `HARM_CATEGORY_CIVIC_INTEGRITY`: 破坏公民诚信的内容

### 阈值选项

- `BLOCK_NONE`: 不屏蔽任何内容
- `BLOCK_ONLY_HIGH`: 只屏蔽高概率有害内容
- `BLOCK_MEDIUM_AND_ABOVE`: 屏蔽中等及以上概率
- `BLOCK_LOW_AND_ABOVE`: 屏蔽低概率及以上
- `OFF`: 关闭安全过滤器

---

## 高级参数

### 媒体分辨率

控制图片/视频的处理分辨率：

```typescript
const options = {
  // ...
  mediaResolution: "MEDIA_RESOLUTION_HIGH"  // LOW | MEDIUM | HIGH
} as any;
```

### Logprobs

获取每个 token 的对数概率：

```typescript
const options: LlmRequestOptions = {
  profileId: "gemini-profile",
  modelId: "gemini-2.0-flash",
  messages: [{ type: "text", text: "Hello" }],
  logprobs: true,
  topLogprobs: 5  // 返回前5个候选token
};

const response = await callGeminiApi(profile, options);
console.log(response.logprobs); // 包含详细的概率信息
```

### 确定性采样

使用种子确保可重复的输出：

```typescript
const options: LlmRequestOptions = {
  profileId: "gemini-profile",
  modelId: "gemini-2.0-flash",
  messages: [{ type: "text", text: "讲个笑话" }],
  seed: 42,  // 固定种子
  temperature: 0.7
};
```

### 候选数量

生成多个候选回答（注意：会消耗更多 token）：

```typescript
const options = {
  // ...
  generationConfig: {
    candidateCount: 3  // 生成3个候选回答
  }
} as any;
```

---

## 完整示例

综合使用多个功能：

```typescript
import { callGeminiApi } from "@/llm-apis/gemini";
import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions } from "@/llm-apis/common";

async function advancedGeminiExample() {
  const profile: LlmProfile = {
    id: "gemini-advanced",
    name: "Gemini Advanced",
    provider: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeys: ["YOUR_API_KEY"]
  };

  const options: LlmRequestOptions = {
    profileId: profile.id,
    modelId: "gemini-2.0-flash",
    messages: [
      { 
        type: "text", 
        text: "分析这张图片，并用JSON格式返回识别到的物体" 
      },
      { 
        type: "image", 
        imageBase64: "..." 
      }
    ],
    temperature: 0.7,
    maxTokens: 2048,
    topP: 0.9,
    topK: 40,
    seed: 123,
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "image_analysis",
        schema: {
          type: "object",
          properties: {
            objects: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  confidence: { type: "number" },
                  position: { type: "string" }
                },
                required: ["name", "confidence"]
              }
            }
          }
        }
      }
    },
    // 扩展参数
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_ONLY_HIGH"
      }
    ],
    mediaResolution: "MEDIA_RESOLUTION_HIGH",
    enableCodeExecution: false
  } as any;

  try {
    const response = await callGeminiApi(profile, options);
    
    console.log("响应内容:", response.content);
    console.log("Token 使用:", response.usage);
    console.log("完成原因:", response.finishReason);
    
    if (response.reasoningContent) {
      console.log("思考过程:", response.reasoningContent);
    }
    
    if (response.toolCalls) {
      console.log("工具调用:", response.toolCalls);
    }
    
    if (response.logprobs) {
      console.log("Logprobs:", response.logprobs);
    }
    
    return response;
  } catch (error) {
    console.error("API 调用失败:", error);
    throw error;
  }
}
```

---

## 注意事项

1. **文件上传限制**：
   - 音频、视频、PDF 文件仅支持通过 `inlineData` (base64) 上传
   - **关于"当前实现"的说明**：虽然在 `src/llm-apis/gemini.ts` 中保留了处理 `fileData.fileUri` 的代码分支（第234-241行），但这部分功能在本项目的当前版本中尚未完整实现或启用。使用 File API 需要额外的文件上传、URI 管理等复杂流程，目前应用的数据流不会触发该代码路径。
   - 为确保功能稳定可靠，请统一使用 base64 方式上传多媒体文件

2. **模型支持**：
   - 不同模型支持的功能可能不同
   - 某些功能（如语音生成）可能只在特定模型上可用

3. **扩展参数**：
   - 使用 `as any` 类型断言来访问扩展参数
   - 这些参数通过 `options` 对象传递，但不在标准接口中定义

4. **安全过滤**：
   - 如果内容被安全过滤器屏蔽，会抛出错误
   - 错误消息会包含具体的屏蔽原因

---

## 参考资源

- [Google Gemini API 官方文档](https://ai.google.dev/docs)
- [Generate Content API](https://ai.google.dev/api/rest/v1beta/models/generateContent)