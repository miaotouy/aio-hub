# OpenAI 对话格式（Chat Completions）

!!! info "官方文档"
    [OpenAI Chat](https://platform.openai.com/docs/api-reference/chat)

## 📝 简介

给定一组包含对话的消息列表，模型将返回一个响应。相关指南可参阅OpenAI官网：[Chat Completions](https://platform.openai.com/docs/guides/chat)

## 💡 请求示例

### 基础文本对话 ✅

```bash
curl https://你的newapi服务器地址/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "model": "gpt-4.1",
    "messages": [
      {
        "role": "developer",
        "content": "你是一个有帮助的助手。"
      },
      {
        "role": "user",
        "content": "你好！"
      }
    ]
  }'
```

**响应示例:**

```json
{
  "id": "chatcmpl-B9MBs8CjcvOU2jLn4n570S5qMJKcT",
  "object": "chat.completion",
  "created": 1741569952,
  "model": "gpt-4.1-2025-04-14",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！我能为你提供什么帮助？",
        "refusal": null,
        "annotations": []
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 19,
    "completion_tokens": 10,
    "total_tokens": 29,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  },
  "service_tier": "default"
}
```

### 图像分析对话 ✅

```bash
curl https://你的newapi服务器地址/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "model": "gpt-4.1",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "这张图片里有什么？"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"
            }
          }
        ]
      }
    ],
    "max_tokens": 300
  }'
```

**响应示例:**

```json
{
  "id": "chatcmpl-B9MHDbslfkBeAs8l4bebGdFOJ6PeG",
  "object": "chat.completion",
  "created": 1741570283,
  "model": "gpt-4.1-2025-04-14",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "图片展示了一条穿过茂密绿色草地或草甸的木制栈道。天空湛蓝，点缀着几朵散落的云彩，给整个场景营造出宁静祥和的氛围。背景中可以看到树木和灌木丛。",
        "refusal": null,
        "annotations": []
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 1117,
    "completion_tokens": 46,
    "total_tokens": 1163,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  },
  "service_tier": "default",
  "system_fingerprint": "fp_fc9f1d7035"
}
```

### 流式响应 ✅

```bash
curl https://你的newapi服务器地址/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "model": "gpt-4.1",
    "messages": [
      {
        "role": "developer",
        "content": "你是一个有帮助的助手。"
      },
      {
        "role": "user",
        "content": "你好！"
      }
    ],
    "stream": true
  }'
```

**流式响应示例:**

```jsonl
{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-4o-mini", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-4o-mini", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{"content":"你好"},"logprobs":null,"finish_reason":null}]}

// ... 更多数据块 ...

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-4o-mini", "system_fingerprint": "fp_44709d6fcb", "choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"stop"}]}
```

### 函数调用 ✅

```bash
curl https://你的newapi服务器地址/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "model": "gpt-4.1",
    "messages": [
      {
        "role": "user",
        "content": "波士顿今天的天气怎么样？"
      }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_current_weather",
          "description": "获取指定位置的当前天气",
          "parameters": {
            "type": "object",
            "properties": {
              "location": {
                "type": "string",
                "description": "城市和州，例如 San Francisco, CA"
              },
              "unit": {
                "type": "string",
                "enum": ["celsius", "fahrenheit"]
              }
            },
            "required": ["location"]
          }
        }
      }
    ],
    "tool_choice": "auto"
  }'
```

**响应示例:**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1699896916,
  "model": "gpt-4o-mini",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "get_current_weather",
              "arguments": "{\n\"location\": \"Boston, MA\"\n}"
            }
          }
        ]
      },
      "logprobs": null,
      "finish_reason": "tool_calls"
    }
  ],
  "usage": {
    "prompt_tokens": 82,
    "completion_tokens": 17,
    "total_tokens": 99,
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  }
}
```

### Logprobs 请求 ✅

```bash
curl https://你的newapi服务器地址/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "model": "gpt-4.1",
    "messages": [
      {
        "role": "user",
        "content": "你好！"
      }
    ],
    "logprobs": true,
    "top_logprobs": 2
  }'
```

**响应示例:**

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1702685778,
  "model": "gpt-4o-mini",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！我能为你提供什么帮助？"
      },
      "logprobs": {
        "content": [
          {
            "token": "Hello",
            "logprob": -0.31725305,
            "bytes": [72, 101, 108, 108, 111],
            "top_logprobs": [
              {
                "token": "Hello",
                "logprob": -0.31725305,
                "bytes": [72, 101, 108, 108, 111]
              },
              {
                "token": "Hi",
                "logprob": -1.3190403,
                "bytes": [72, 105]
              }
            ]
          },
          {
            "token": "!",
            "logprob": -0.02380986,
            "bytes": [
              33
            ],
            "top_logprobs": [
              {
                "token": "!",
                "logprob": -0.02380986,
                "bytes": [33]
              },
              {
                "token": " there",
                "logprob": -3.787621,
                "bytes": [32, 116, 104, 101, 114, 101]
              }
            ]
          },
          {
            "token": " How",
            "logprob": -0.000054669687,
            "bytes": [32, 72, 111, 119],
            "top_logprobs": [
              {
                "token": " How",
                "logprob": -0.000054669687,
                "bytes": [32, 72, 111, 119]
              },
              {
                "token": "<|end|>",
                "logprob": -10.953937,
                "bytes": null
              }
            ]
          },
          {
            "token": " can",
            "logprob": -0.015801601,
            "bytes": [32, 99, 97, 110],
            "top_logprobs": [
              {
                "token": " can",
                "logprob": -0.015801601,
                "bytes": [32, 99, 97, 110]
              },
              {
                "token": " may",
                "logprob": -4.161023,
                "bytes": [32, 109, 97, 121]
              }
            ]
          },
          {
            "token": " I",
            "logprob": -3.7697225e-6,
            "bytes": [
              32,
              73
            ],
            "top_logprobs": [
              {
                "token": " I",
                "logprob": -3.7697225e-6,
                "bytes": [32, 73]
              },
              {
                "token": " assist",
                "logprob": -13.596657,
                "bytes": [32, 97, 115, 115, 105, 115, 116]
              }
            ]
          },
          {
            "token": " assist",
            "logprob": -0.04571125,
            "bytes": [32, 97, 115, 115, 105, 115, 116],
            "top_logprobs": [
              {
                "token": " assist",
                "logprob": -0.04571125,
                "bytes": [32, 97, 115, 115, 105, 115, 116]
              },
              {
                "token": " help",
                "logprob": -3.1089056,
                "bytes": [32, 104, 101, 108, 112]
              }
            ]
          },
          {
            "token": " you",
            "logprob": -5.4385737e-6,
            "bytes": [32, 121, 111, 117],
            "top_logprobs": [
              {
                "token": " you",
                "logprob": -5.4385737e-6,
                "bytes": [32, 121, 111, 117]
              },
              {
                "token": " today",
                "logprob": -12.807695,
                "bytes": [32, 116, 111, 100, 97, 121]
              }
            ]
          },
          {
            "token": " today",
            "logprob": -0.0040071653,
            "bytes": [32, 116, 111, 100, 97, 121],
            "top_logprobs": [
              {
                "token": " today",
                "logprob": -0.0040071653,
                "bytes": [32, 116, 111, 100, 97, 121]
              },
              {
                "token": "?",
                "logprob": -5.5247097,
                "bytes": [63]
              }
            ]
          },
          {
            "token": "?",
            "logprob": -0.0008108172,
            "bytes": [63],
            "top_logprobs": [
              {
                "token": "?",
                "logprob": -0.0008108172,
                "bytes": [63]
              },
              {
                "token": "?\n",
                "logprob": -7.184561,
                "bytes": [63, 10]
              }
            ]
          }
        ]
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 9,
    "completion_tokens": 9,
    "total_tokens": 18,
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  },
  "system_fingerprint": null
}
```

## 📮 请求

### 端点

```
POST /v1/chat/completions
```

创建给定聊天对话的模型响应。更多详情请参阅文本生成、视觉和音频指南。

### 鉴权方法

在请求头中包含以下内容进行 API 密钥认证：

```
Authorization: Bearer $NEWAPI_API_KEY
```

其中 `$NEWAPI_API_KEY` 是您的 API 密钥。您可以在 OpenAI 平台的 API 密钥页面中找到或生成 API 密钥。

### 请求体参数

#### `messages`

- 类型：数组
- 必需：是

到目前为止包含对话的消息列表。根据使用的模型，支持不同的消息类型（形式），如文本、图像和音频。

| 消息类型 | 描述 |
|---------|------|
| **Developer message** | 开发者提供的指令，模型应遵循这些指令，无论用户发送什么消息。在 o1 模型及更新版本中，开发者消息取代了之前的系统消息。 |
| **System message** | 开发者提供的指令，模型应遵循这些指令，无论用户发送什么消息。在 o1 模型及更新版本中，请使用开发者消息代替。 |
| **User message** | 由终端用户发送的消息，包含提示或额外的上下文信息。 |
| **Assistant message** | 模型响应用户消息发送的消息。 |
| **Tool message** | 工具消息的内容。 |
| **Function message** | 已弃用。 |

**Developer message 属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `role` | 字符串 | 是 | 消息作者的角色，此处为 `developer`。 |
| `content` | 字符串或数组 | 是 | 开发者消息的内容。可以是文本内容（字符串）或内容部分数组。 |
| `name` | 字符串 | 否 | 参与者的可选名称。为模型提供信息以区分相同角色的参与者。 |

**System message 属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `role` | 字符串 | 是 | 消息作者的角色，此处为 `system`。 |
| `content` | 字符串或数组 | 是 | 系统消息的内容。可以是文本内容（字符串）或内容部分数组。 |
| `name` | 字符串 | 否 | 参与者的可选名称。为模型提供信息以区分相同角色的参与者。 |

**User message 属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `role` | 字符串 | 是 | 消息作者的角色，此处为 `user`。 |
| `content` | 字符串或数组 | 是 | 用户消息的内容。可以是文本内容（字符串）或内容部分数组。 |
| `name` | 字符串 | 否 | 参与者的可选名称。为模型提供信息以区分相同角色的参与者。 |

**内容部分类型：**

| 内容部分类型 | 描述 | 可用于 |
|------------|------|---------|
| **文本内容部分** | 文本输入。 | 所有消息类型 |
| **图像内容部分** | 图像输入。 | 用户消息 |
| **音频内容部分** | 音频输入。 | 用户消息 |
| **文件内容部分** | 文件输入，用于文本生成。 | 用户消息 |
| **拒绝内容部分** | 模型生成的拒绝消息。 | 助手消息 |

**文本内容部分属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `text` | 字符串 | 是 | 文本内容。 |
| `type` | 字符串 | 是 | 内容部分的类型。 |

**图像内容部分属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `image_url` | 对象 | 是 | 包含图像URL或base64编码的图像数据。 |
| `type` | 字符串 | 是 | 内容部分的类型。 |

**图像URL对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `url` | 字符串 | 是 | 图像的URL或base64编码的图像数据。 |
| `detail` | 字符串 | 否 | 指定图像的详细级别。默认为 `auto`。 |

**音频内容部分属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `input_audio` | 对象 | 是 | 包含音频数据的对象。 |
| `type` | 字符串 | 是 | 内容部分的类型。始终为 `input_audio`。 |

**音频输入对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `data` | 字符串 | 是 | base64编码的音频数据。 |
| `format` | 字符串 | 是 | 编码音频数据的格式。当前支持 "wav" 和 "mp3"。 |

**文件内容部分属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `file` | 对象 | 是 | 包含文件数据的对象。 |
| `type` | 字符串 | 是 | 内容部分的类型。始终为 `file`。 |

**文件对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `file_data` | 字符串 | 否 | base64编码的文件数据，用于将文件作为字符串传递给模型。 |
| `file_id` | 字符串 | 否 | 已上传文件的ID，用作输入。 |
| `filename` | 字符串 | 否 | 文件名，用于将文件作为字符串传递给模型。 |

**Assistant message 属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `role` | 字符串 | 是 | 消息作者的角色，此处为 `assistant`。 |
| `content` | 字符串或数组 | 否 | 助手消息的内容。除非指定了 `tool_calls` 或 `function_call`，否则为必需。 |
| `name` | 字符串 | 否 | 参与者的可选名称。为模型提供信息以区分相同角色的参与者。 |
| `audio` | 对象或null | 否 | 关于模型先前音频响应的数据。 |
| `function_call` | 对象或null | 否 | 已弃用，由 `tool_calls` 替代。应调用的函数的名称和参数，由模型生成。 |
| `tool_calls` | 数组 | 否 | 模型生成的工具调用，如函数调用。 |
| `refusal` | 字符串或null | 否 | 助手的拒绝消息。 |

**Tool message 属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `role` | 字符串 | 是 | 消息作者的角色，此处为 `tool`。 |
| `content` | 字符串或数组 | 是 | 工具消息的内容。 |
| `tool_call_id` | 字符串 | 是 | 此消息响应的工具调用。 |

**Function message 属性：（已弃用）**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `role` | 字符串 | 是 | 消息作者的角色，此处为 `function`。 |
| `content` | 字符串或null | 是 | 函数消息的内容。 |
| `name` | 字符串 | 是 | 要调用的函数的名称。 |

#### `model`

- 类型：字符串  
- 必需：是

要使用的模型 ID。有关哪些模型适用于 Chat API 的详细信息，请参阅模型端点兼容性表。

#### `store` 

- 类型：布尔值或 null
- 必需：否
- 默认值：false

是否存储此聊天补全请求的输出以用于我们的模型蒸馏或评估产品。

#### `reasoning_effort`

- 类型：字符串或 null
- 必需：否
- 默认值：medium
- 仅适用于 o系列 的模型

约束推理模型的推理工作。当前支持的值为 `low`、`medium` 和 `high`。减少推理工作可以加快响应速度并减少响应中用于推理的标记数。

#### `metadata`

- 类型：map
- 必需：否

可以附加到对象的16个键值对集合。这对于以结构化格式存储对象的其他信息很有用,并可以通过 API 或仪表板查询对象。

键是最大长度为64个字符的字符串。值是最大长度为512个字符的字符串。

#### `modalities`

- 类型：数组或 null
- 必需：否

您希望模型为此请求生成的输出类型。大多数模型都能生成文本,这是默认设置:
["text"]

该模型还可以用于生成音频。要请求此模型同时生成文本和音频响应,您可以使用:
["text", "audio"]

#### `prediction`

- 类型：对象
- 必需：否

预测输出的配置,当提前知道模型响应的大部分内容时,可以大大提高响应时间。这在您只对文件进行微小更改时最常见。

**可能的类型：**

| 类型 | 描述 |
|------|------|
| **静态内容** | 静态预测输出内容，例如正在重新生成的具有微小更改的文本文件内容。 |

**静态内容属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `content` | 字符串或数组 | 是 | 生成模型响应时应匹配的内容。如果生成的标记与此内容匹配，则整个模型响应可以更快地返回。 |
| `type` | 字符串 | 是 | 要提供的预测内容类型。当前类型始终为 `content`。 |

**内容可能的类型：**

1. **文本内容（字符串）** - 用于预测输出的内容。这通常是您正在重新生成的文件的文本，只有微小更改。

2. **内容部分数组（数组）** - 具有定义类型的内容部分数组。支持的选项因用于生成响应的模型而异。可以包含文本输入。

**内容部分数组属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `text` | 字符串 | 是 | 文本内容。 |
| `type` | 字符串 | 是 | 内容部分的类型。 |

#### `audio`

- 类型：对象或 null
- 必需：否

音频输出的参数。当使用 `modalities: ["audio"]` 请求音频输出时需要。

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `format` | 字符串 | 是 | 指定输出音频格式。必须是以下之一：wav、mp3、flac、opus 或 pcm16。 |
| `voice` | 字符串 | 是 | 模型用于响应的声音。支持的声音包括：alloy、ash、ballad、coral、echo、fable、nova、onyx、sage 和 shimmer。 |

#### `temperature`

- 类型：数字或 null
- 必需：否
- 默认值：1

要使用的采样温度，介于 0 和 2 之间。较高的值（如0.8）会使输出更加随机，而较低的值（如0.2）会使其更加集中和确定性。我们通常建议更改此值或 `top_p`，但不要同时更改。

#### `top_p`

- 类型：数字或 null  
- 必需：否
- 默认值：1

一种替代采样温度的方法，称为核采样，其中模型考虑具有 top_p 概率质量的标记结果。因此，0.1 意味着只考虑包含前 10% 概率质量的标记。

我们通常建议更改此值或 `temperature`，但不要同时更改。

#### `n`

- 类型：整数或 null
- 必需：否  
- 默认值：1

为每个输入消息生成多少个聊天补全选择。请注意，您将根据所有选择生成的标记数量收费。保持 `n` 为 1 可最大限度地降低成本。

#### `stop`

- 类型：字符串/数组/null
- 必需：否
- 默认值：null
- 不支持最新的推理模型和 .o3、o4-mini

API 将停止生成更多标记的最多 4 个序列。返回的文本不会包含停止序列。

#### `max_tokens`

- 类型：整数或 null
- 必需：否

聊天补全中可以生成的最大标记数。此值可用于控制通过 API 生成的文本成本。

该值现已弃用，取而代之的是 `max_completion_tokens`，并且与 `o1` 系列模型不兼容。

#### `max_completion_tokens`

- 类型：整数或 null
- 必需：否

补全中可以生成的标记数的上限，包括可见输出标记和推理标记。

#### `presence_penalty`

- 类型：数字或 null 
- 必需：否
- 默认值：0

介于 -2.0 和 2.0 之间的数字。正值根据新标记到目前为止在文本中出现的情况来惩罚它们，从而增加模型讨论新主题的可能性。

#### `frequency_penalty`

- 类型：数字或 null
- 必需：否  
- 默认值：0

介于 -2.0 和 2.0 之间的数字。正值根据新标记到目前为止在文本中的现有频率来惩罚它们，从而降低模型逐字重复同一行的可能性。

#### `logit_bias`

- 类型：map
- 必需：否
- 默认值：null

修改指定标记出现在补全中的可能性。

接受一个 JSON 对象，该对象将标记（由分词器中的标记 ID 指定）映射到从 -100 到 100 的关联偏差值。在数学上，偏差被添加到模型在采样之前生成的对数中。确切的效果会因模型而异，但介于 -1 和 1 之间的值应该会减少或增加选择的可能性；像 -100 或 100 这样的值应该导致相关标记被禁止或独占选择。

#### `logprobs`

- 类型：布尔值或 null
- 必需：否
- 默认值：false

是否返回输出标记的对数概率。如果为 true，则返回 `message.content` 中每个输出标记的对数概率。

#### `user`

- 类型：字符串
- 必需：否

表示最终用户的唯一标识符，可以帮助 OpenAI 监控和检测滥用行为。[了解更多](https://platform.openai.com/docs/guides/safety-best-practices/end-user-ids)。

#### `service_tier`

- 类型：字符串或 null
- 必需：否
- 默认值：auto

指定用于处理请求的延迟层级。此参数与订阅了 scale tier 服务的客户相关：

- 如果设置为 'auto'，且项目启用了 Scale tier，系统将使用 scale tier 信用直到用完
- 如果设置为 'auto'，且项目未启用 Scale tier，请求将使用默认服务层级处理，具有较低的正常运行时间 SLA 且无延迟保证
- 如果设置为 'default'，请求将使用默认服务层级处理，具有较低的正常运行时间 SLA 且无延迟保证
- 如果设置为 'flex'，请求将使用 Flex Processing 服务层级处理。详情请参阅文档。
- 未设置时，默认行为为 'auto'
- 当设置此参数时，响应体将包含使用的 service_tier

#### `stream_options`

- 类型：对象或 null
- 必需：否
- 默认值：null

流式响应的选项。仅在设置 `stream: true` 时使用。

**可能的属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `include_usage` | 布尔值 | 否 | 如果设置，将在 data: [DONE] 消息之前流式传输一个附加块。该块上的 usage 字段显示整个请求的令牌使用统计信息，choices 字段始终为空数组。所有其他块也将包含 usage 字段，但值为 null。注意：如果流被中断，您可能不会收到包含请求总令牌使用量的最终使用块。 |

#### `response_format`

- 类型：对象
- 必需：否

指定模型必须输出的格式。

- 设置为 `{ "type": "json_schema", "json_schema": {...} }` 启用结构化输出，确保模型将匹配您提供的 JSON schema。
- 设置为 `{ "type": "json_object" }` 启用 JSON 模式，确保模型生成的消息是有效的 JSON。

重要提示：使用 JSON 模式时，您还必须通过系统或用户消息自行指示模型生成 JSON。否则，模型可能会生成无尽的空白直到生成达到令牌限制。

**可能的类型：**

| 类型 | 描述 |
|------|------|
| **text** | 默认响应格式。用于生成文本响应。 |
| **json_schema** | JSON Schema 响应格式。用于生成结构化 JSON 响应。了解更多关于结构化输出的信息。 |
| **json_object** | JSON 对象响应格式。一种较老的生成 JSON 响应的方法。对于支持的模型，推荐使用 json_schema。 |

**text 属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `type` | 字符串 | 是 | 正在定义的响应格式类型。始终为 `text`。 |

**json_schema 属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `json_schema` | 对象 | 是 | 结构化输出配置选项，包括 JSON Schema。 |
| `type` | 字符串 | 是 | 正在定义的响应格式类型。始终为 `json_schema`。 |

**json_schema.json_schema 属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `name` | 字符串 | 是 | 响应格式的名称。必须是 a-z、A-Z、0-9 或包含下划线和破折号，最大长度为 64。 |
| `description` | 字符串 | 否 | 响应格式的用途描述，模型用它来确定如何以该格式响应。 |
| `schema` | 对象 | 否 | 响应格式的架构，描述为 JSON Schema 对象。 |
| `strict` | 布尔值或 null | 否 | 是否在生成输出时启用严格架构遵守。如果设置为 true，模型将始终遵循 schema 字段中定义的确切架构。strict 为 true 时，仅支持 JSON Schema 的子集。 |

**json_object 属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `type` | 字符串 | 是 | 正在定义的响应格式类型。始终为 `json_object`。 |

#### `seed`

- 类型：整数或 null
- 必需：否
Beta 功能。如果指定，我们的系统将尽最大努力进行确定性采样，使得具有相同 seed 和参数的重复请求应返回相同的结果。不保证确定性，您应参考响应参数的 system_fingerprint 以监控后端的变化。

#### `tools`

- 类型：数组
- 必需：否

模型可能调用的工具列表。目前仅支持函数作为工具。使用此参数提供模型可能生成 JSON 输入的函数列表。最多支持 128 个函数。

**属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `function` | 对象 | 是 | 要调用的函数信息 |
| `type` | 字符串 | 是 | 工具的类型。目前，仅支持 function。 |

**function 属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `name` | 字符串 | 是 | 要调用的函数名称。必须是a-z、A-Z、0-9，或包含下划线和破折号，最大长度为64。 |
| `description` | 字符串 | 否 | 函数功能的描述，模型用它来选择何时以及如何调用函数。 |
| `parameters` | 对象 | 否 | 函数接受的参数，描述为JSON Schema对象。请参阅指南获取示例，以及JSON Schema参考了解格式文档。省略parameters定义一个空参数列表的函数。 |
| `strict` | 布尔值或 null | 否 | 默认值：false。是否在生成函数调用时启用严格架构遵守。如果设置为 true，模型将遵循 parameters 字段中定义的确切架构。strict 为 true 时，仅支持 JSON Schema 的子集。详情请参阅函数调用指南中的结构化输出部分。 |

#### `functions`

- 类型：数组
- 必需：否
- 注意：已弃用，推荐使用 `tools`

模型可能生成 JSON 输入的函数列表。

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `name` | 字符串 | 是 | 要调用的函数名称。必须是a-z、A-Z、0-9，或包含下划线和破折号，最大长度为64。 |
| `description` | 字符串 | 否 | 函数功能的描述，模型用它来选择何时以及如何调用函数。 |
| `parameters` | 对象 | 否 | 函数接受的参数，描述为JSON Schema对象。省略parameters定义一个空参数列表的函数。 |

#### `tool_choice`

- 类型：字符串或对象
- 必需：否

控制模型调用哪个工具（如果有）：
- `none`：模型不会调用任何工具，而是生成消息
- `auto`：模型可以在生成消息或调用一个或多个工具之间选择
- `required`：模型必须调用一个或多个工具
- `{"type": "function", "function": {"name": "my_function"}}`：强制模型调用特定工具

当没有工具时默认为 `none`，有工具时默认为 `auto`。

**可能的类型：**

| 类型 | 描述 |
|------|------|
| **字符串** | none 表示模型不会调用任何工具，而是生成消息。auto 表示模型可以在生成消息或调用一个或多个工具之间选择。required 表示模型必须调用一个或多个工具。 |
| **对象** | 指定模型应使用的工具。用于强制模型调用特定函数。 |

**对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `function` | 对象 | 是 | 包含函数信息的对象 |
| `type` | 字符串 | 是 | 工具的类型。目前，仅支持 function。 |

**function 属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `name` | 字符串 | 是 | 要调用的函数名称。 |

#### `function_call`

- 类型：字符串或对象
- 必需：否
- 默认值：没有函数时为 `none`，有函数时为 `auto`
- 注意：已弃用，推荐使用 `tool_choice`

控制模型调用哪个函数（如果有）：

- `none`：模型不会调用函数，而是生成消息
- `auto`：模型可以在生成消息或调用函数之间选择
- `{"name": "my_function"}`：强制模型调用特定函数

**对象类型属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `name` | 字符串 | 是 | 要调用的函数名称。 |

#### `parallel_tool_calls`

- 类型：布尔值
- 必需：否
- 默认值：true

是否在工具使用期间启用并行函数调用。

#### `stream`

- 类型：布尔值或 null
- 必需：否
- 默认值：false

如果设置为 true，模型响应数据将在生成时通过服务器发送事件流式传输到客户端。请参阅下方的流式响应部分获取更多信息，以及流式响应指南了解如何处理流式事件。

#### `top_logprobs`

- 类型：整数或 null
- 必需：否

0 到 20 之间的整数，指定在每个标记位置返回的最可能标记的数量，每个标记都有关联的对数概率。如果使用此参数，必须将 `logprobs` 设置为 true。

#### `web_search_options`

- 类型：对象
- 必需：否

此工具搜索网络以获取相关结果用于回复。了解更多关于网络搜索工具的信息。

**可能的属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `search_context_size` | 字符串 | 否 | 默认值：medium。用于搜索的上下文窗口空间量的高级指导。可选值为 low、medium 或 high。medium 是默认值。 |
| `user_location` | 对象或 null | 否 | 搜索的近似位置参数。 |

**user_location 属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `approximate` | 对象 | 是 | 搜索的近似位置参数。 |

**approximate 属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `city` | 字符串 | 否 | 用户城市的自由文本输入，例如 San Francisco。 |
| `country` | 字符串 | 否 | 用户的两字母 ISO 国家代码，例如 US。 |
| `region` | 字符串 | 否 | 用户地区的自由文本输入，例如 California。 |
| `timezone` | 字符串 | 否 | 用户的 IANA 时区，例如 America/Los_Angeles。 |
| `type` | 字符串 | 是 | 位置近似类型。始终为 approximate。 |

## 📥 响应

### 聊天补全对象

返回一个聊天补全对象,如果请求被流式传输,则返回聊天补全块对象的流式序列。

#### `id` 
- 类型：字符串
- 说明：响应的唯一标识符

#### `object`
- 类型：字符串  
- 说明：对象类型,值为 "chat.completion"

#### `created`
- 类型：整数
- 说明：响应创建时间戳

#### `model`
- 类型：字符串
- 说明：使用的模型名称

#### `system_fingerprint`
- 类型：字符串
- 说明：系统指纹标识符，表示模型运行的后端配置。可以与seed请求参数一起使用，以了解何时进行了可能影响确定性的后端更改。

#### `choices`
- 类型：数组
- 说明：包含生成的回复选项列表。如果 n 大于 1，则可以有多个选项。
- 属性:
  - `index`: 选项在选项列表中的索引。
  - `message`: 模型生成的聊天补全消息。
    - `role`: 消息作者的角色。
    - `content`: 消息的内容，可能为 null。
    - `refusal`: 模型生成的拒绝消息，可能为 null。
    - `annotations`: 消息的注释，在适用时提供，例如使用网络搜索工具时。
      - `type`: 注释类型，URL引用时始终为 "url_citation"。
      - `url_citation`: 使用网络搜索时的URL引用。
        - `start_index`: URL引用在消息中的第一个字符的索引。
        - `end_index`: URL引用在消息中的最后一个字符的索引。
        - `url`: 网络资源的URL。
        - `title`: 网络资源的标题。
    - `audio`: 如果请求了音频输出模态，此对象包含来自模型的音频响应的数据。
      - `data`: 模型生成的Base64编码音频字节，格式在请求中指定。
      - `id`: 此音频响应的唯一标识符。
      - `transcript`: 模型生成的音频的转录。
      - `expires_at`: 此音频响应在服务器上可用于多轮对话的Unix时间戳（秒）。
    - `function_call`: （已弃用）应调用的函数的名称和参数，由模型生成。已被 `tool_calls` 替代。
      - `name`: 要调用的函数的名称。
      - `arguments`: 用于调用函数的参数，由模型以JSON格式生成。
    - `tool_calls`: 模型生成的工具调用，如函数调用。
      - `id`: 工具调用的ID。
      - `type`: 工具的类型。目前，仅支持 function。
      - `function`: 模型调用的函数。
        - `name`: 要调用的函数的名称。
        - `arguments`: 用于调用函数的参数，由模型以JSON格式生成。注意，模型并不总是生成有效的JSON，并且可能会产生您函数架构中未定义的参数。在调用函数之前，请在代码中验证参数。
  - `logprobs`: 对数概率信息。
    - `content`: 带有对数概率信息的消息内容标记列表。
      - `token`: 标记。
      - `logprob`: 此标记的对数概率，如果它在前20个最可能的标记内。否则，使用-9999.0的值表示此标记非常不可能。
      - `bytes`: 表示标记的UTF-8字节表示的整数列表。在字符由多个标记表示且必须组合它们的字节表示以生成正确的文本表示的情况下很有用。如果标记没有字节表示，则可能为null。
      - `top_logprobs`: 在此标记位置上最可能的标记及其对数概率的列表。在罕见情况下，返回的top_logprobs数量可能少于请求的数量。
    - `refusal`: 带有对数概率信息的消息拒绝标记列表。
  - `finish_reason`: 模型停止生成标记的原因。如果模型到达自然停止点或提供的停止序列，则为 "stop"；如果达到请求中指定的最大标记数，则为 "length"；如果由于内容过滤器标记而省略内容，则为 "content_filter"；如果模型调用了工具，则为 "tool_calls"；如果模型调用了函数，则为 "function_call"（已弃用）。

#### `usage`
- 类型：对象
- 说明：补全请求的使用统计信息。
- 属性:
  - `prompt_tokens`: 提示中的标记数。
  - `completion_tokens`: 生成的补全中的标记数。
  - `total_tokens`: 请求中使用的标记总数（提示 + 补全）。
  - `prompt_tokens_details`: 提示中使用的标记的细分。
    - `cached_tokens`: 提示中存在的缓存标记。
    - `audio_tokens`: 提示中存在的音频输入标记。
  - `completion_tokens_details`: 补全中使用的标记的细分。
    - `reasoning_tokens`: 模型生成的推理标记。
    - `audio_tokens`: 模型生成的音频标记。
    - `accepted_prediction_tokens`: 使用预测输出时，预测中出现在补全中的标记数。
    - `rejected_prediction_tokens`: 使用预测输出时，预测中未出现在补全中的标记数。但是，与推理标记一样，这些标记仍计入计费、输出和上下文窗口限制的总补全标记中。

#### `service_tier`
- 类型：字符串或 null
- 说明：指定用于处理请求的延迟层级。此参数与订阅了 scale tier 服务的客户相关：
  - 如果设置为 'auto'，且项目启用了 Scale tier，系统将使用 scale tier 信用直到用完
  - 如果设置为 'auto'，且项目未启用 Scale tier，请求将使用默认服务层级处理，具有较低的正常运行时间 SLA 且无延迟保证
  - 如果设置为 'default'，请求将使用默认服务层级处理，具有较低的正常运行时间 SLA 且无延迟保证
  - 如果设置为 'flex'，请求将使用 Flex Processing 服务层级处理
  - 未设置时，默认行为为 'auto'
  - 当设置此参数时，响应体将包含使用的 service_tier

#### 聊天补全对象响应示例

```json
{
  "id": "chatcmpl-B9MHDbslfkBeAs8l4bebGdFOJ6PeG",
  "object": "chat.completion",
  "created": 1741570283,
  "model": "gpt-4o-2024-08-06",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "图片展示了一条穿过茂密绿色草地或草甸的木制栈道。天空湛蓝，点缀着几朵散落的云彩，给整个场景营造出宁静祥和的氛围。背景中可以看到树木和灌木丛。",
        "refusal": null,
        "annotations": []
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 1117,
    "completion_tokens": 46,
    "total_tokens": 1163,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  },
  "service_tier": "default",
  "system_fingerprint": "fp_fc9f1d7035"
}
```

### 聊天补全列表对象

当返回多个聊天补全时，API 可能会返回聊天补全列表对象。

#### `object`
- 类型：字符串
- 说明：对象类型，始终为 "list"

#### `data`
- 类型：数组
- 说明：聊天补全对象的数组

#### `first_id`
- 类型：字符串
- 说明：数据数组中第一个聊天补全的标识符

#### `last_id`
- 类型：字符串
- 说明：数据数组中最后一个聊天补全的标识符

#### `has_more`
- 类型：布尔值
- 说明：表示是否有更多聊天补全可用

#### 聊天补全列表响应示例

```json
{
  "object": "list",
  "data": [
    {
      "object": "chat.completion",
      "id": "chatcmpl-AyPNinnUqUDYo9SAdA52NobMflmj2",
      "model": "gpt-4o-2024-08-06",
      "created": 1738960610,
      "request_id": "req_ded8ab984ec4bf840f37566c1011c417",
      "tool_choice": null,
      "usage": {
        "total_tokens": 31,
        "completion_tokens": 18,
        "prompt_tokens": 13
      },
      "seed": 4944116822809979520,
      "top_p": 1.0,
      "temperature": 1.0,
      "presence_penalty": 0.0,
      "frequency_penalty": 0.0,
      "system_fingerprint": "fp_50cad350e4",
      "input_user": null,
      "service_tier": "default",
      "tools": null,
      "metadata": {},
      "choices": [
        {
          "index": 0,
          "message": {
            "content": "电路之心低吟，\n在寂静中学习模式—\n未来的宁静火花。",
            "role": "assistant",
            "tool_calls": null,
            "function_call": null
          },
          "finish_reason": "stop",
          "logprobs": null
        }
      ],
      "response_format": null
    }
  ],
  "first_id": "chatcmpl-AyPNinnUqUDYo9SAdA52NobMflmj2",
  "last_id": "chatcmpl-AyPNinnUqUDYo9SAdA52NobMflmj2",
  "has_more": false
}
```

### 聊天补全消息列表对象

聊天补全消息列表对象表示聊天消息的列表。

#### `object`
- 类型：字符串
- 说明：对象类型，始终为 "list"

#### `data`
- 类型：数组
- 说明：聊天补全消息对象的数组，每个消息对象包含以下属性：
  - `id`: 聊天消息的标识符
  - `role`: 消息作者的角色
  - `content`: 消息的内容，可能为 null
  - `name`: 消息发送者的名称，可能为 null
  - `refusal`: 模型生成的拒绝消息，可能为 null
  - `annotations`: 消息的注释，在适用时提供，例如使用网络搜索工具时
    - `type`: 注释类型，URL引用时始终为 "url_citation"
    - `url_citation`: 使用网络搜索时的URL引用
      - `start_index`: URL引用在消息中的第一个字符的索引
      - `end_index`: URL引用在消息中的最后一个字符的索引
      - `url`: 网络资源的URL
      - `title`: 网络资源的标题
  - `audio`: 如果请求了音频输出模态，此对象包含来自模型的音频响应的数据
    - `data`: 模型生成的Base64编码音频字节，格式在请求中指定
    - `id`: 此音频响应的唯一标识符
    - `transcript`: 模型生成的音频的转录
    - `expires_at`: 此音频响应在服务器上可用于多轮对话的Unix时间戳（秒）
  - `function_call`: （已弃用）应调用的函数的名称和参数，由模型生成。已被 `tool_calls` 替代
    - `name`: 要调用的函数的名称
    - `arguments`: 用于调用函数的参数，由模型以JSON格式生成
  - `tool_calls`: 模型生成的工具调用，如函数调用
    - `id`: 工具调用的ID
    - `type`: 工具的类型。目前，仅支持 function
    - `function`: 模型调用的函数
      - `name`: 要调用的函数的名称
      - `arguments`: 用于调用函数的参数，由模型以JSON格式生成

#### `first_id`
- 类型：字符串
- 说明：数据数组中第一个聊天消息的标识符

#### `last_id`
- 类型：字符串
- 说明：数据数组中最后一个聊天消息的标识符

#### `has_more`
- 类型：布尔值
- 说明：表示是否有更多聊天消息可用

#### 聊天补全消息列表响应示例

```json
{
  "object": "list",
  "data": [
    {
      "id": "chatcmpl-AyPNinnUqUDYo9SAdA52NobMflmj2-0",
      "role": "user",
      "content": "写一首关于人工智能的俳句",
      "name": null,
      "content_parts": null
    }
  ],
  "first_id": "chatcmpl-AyPNinnUqUDYo9SAdA52NobMflmj2-0",
  "last_id": "chatcmpl-AyPNinnUqUDYo9SAdA52NobMflmj2-0",
  "has_more": false
}
```