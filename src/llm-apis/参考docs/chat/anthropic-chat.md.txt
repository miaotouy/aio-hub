# Anthropic 对话格式（Messages）

!!! info "官方文档"
    - [Anthropic Messages](https://docs.anthropic.com/en/api/messages)
    - [Anthropic Streaming Messages](https://docs.anthropic.com/en/api/messages-streaming)

## 📝 简介

给定一组包含文本和/或图像内容的结构化输入消息列表，模型将生成对话中的下一条消息。Messages API 可用于单次查询或无状态的多轮对话。

## 💡 请求示例

### 基础文本对话 ✅

```bash
curl https://你的newapi服务器地址/v1/messages \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --header "x-api-key: $NEWAPI_API_KEY" \
     --data \
'{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [
        {"role": "user", "content": "Hello, world"}
    ]
}'
```

**响应示例:**
```json
{
  "content": [
    {
      "text": "Hi! My name is Claude.",
      "type": "text"
    }
  ],
  "id": "msg_013Zva2CMHLNnXjNJKqJ2EF",
  "model": "claude-3-5-sonnet-20241022", 
  "role": "assistant",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "type": "message",
  "usage": {
    "input_tokens": 2095,
    "output_tokens": 503
  }
}
```

### 图像分析对话 ✅

```bash
curl https://你的newapi服务器地址/v1/messages \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --header "x-api-key: $NEWAPI_API_KEY" \
     --data \
'{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": "/9j/4AAQSkZJRg..."
                    }
                },
                {
                    "type": "text",
                    "text": "这张图片里有什么?"
                }
            ]
        }
    ]
}'
```

**响应示例:**
```json
{
  "content": [
    {
      "text": "这张图片显示了一只橙色的猫咪正在窗台上晒太阳。猫咪看起来很放松，眯着眼睛享受阳光。窗外可以看到一些绿色的植物。",
      "type": "text"
    }
  ],
  "id": "msg_013Zva2CMHLNnXjNJKqJ2EF",
  "model": "claude-3-5-sonnet-20241022",
  "role": "assistant",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "type": "message",
  "usage": {
    "input_tokens": 3050,
    "output_tokens": 892
  }
}
```

### 工具调用 ✅

```bash
curl https://你的newapi服务器地址/v1/messages \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --header "x-api-key: $NEWAPI_API_KEY" \
     --data \
'{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
        {
            "role": "user", 
            "content": "今天北京的天气怎么样?"
        }
    ],
    "tools": [
        {
            "name": "get_weather",
            "description": "获取指定位置的当前天气",
            "input_schema": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "城市名称,如:北京"
                    }
                },
                "required": ["location"]
            }
        }
    ]
}'
```

**响应示例:**
```json
{
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_01D7FLrfh4GYq7yT1ULFeyMV",
      "name": "get_weather",
      "input": { "location": "北京" }
    }
  ],
  "id": "msg_013Zva2CMHLNnXjNJKqJ2EF",
  "model": "claude-3-5-sonnet-20241022",
  "role": "assistant",
  "stop_reason": "tool_use",
  "stop_sequence": null,
  "type": "message",
  "usage": {
    "input_tokens": 2156,
    "output_tokens": 468
  }
}
```

### 流式响应 ✅

```bash
curl https://你的newapi服务器地址/v1/messages \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --header "x-api-key: $NEWAPI_API_KEY" \
     --data \
'{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
        {
            "role": "user",
            "content": "讲个故事"
        }
    ],
    "stream": true
}'
```

**响应示例:**
```json
{
  "type": "message_start",
  "message": {
    "id": "msg_013Zva2CMHLNnXjNJKqJ2EF",
    "model": "claude-3-5-sonnet-20241022",
    "role": "assistant",
    "type": "message"
  }
}
{
  "type": "content_block_start",
  "index": 0,
  "content_block": {
    "type": "text"
  }
}
{
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "text": "从前"
  }
}
{
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "text": "有一只"
  }
}
{
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "text": "小兔子..."
  }
}
{
  "type": "content_block_stop",
  "index": 0
}
{
  "type": "message_delta",
  "delta": {
    "stop_reason": "end_turn",
    "usage": {
      "input_tokens": 2045,
      "output_tokens": 628
    }
  }
}
{
  "type": "message_stop"
}
```

## 📮 请求

### 端点

```
POST /v1/messages
```

### 鉴权方法

在请求头中包含以下内容进行 API 密钥认证：

```
x-api-key: $NEWAPI_API_KEY
```

其中 `$NEWAPI_API_KEY` 是您的 API 密钥。您可以通过控制台获取 API 密钥，每个密钥仅限于一个工作区使用。

### 请求头参数

#### `anthropic-beta`

- 类型：字符串
- 必需：否

指定要使用的 beta 版本，支持用逗号分隔的列表如 `beta1,beta2`，或多次指定该请求头。

#### `anthropic-version`

- 类型：字符串
- 必需：是

指定要使用的 API 版本。

### 请求体参数

#### `max_tokens`

- 类型：整数
- 必需：是

生成的最大 token 数量。不同模型有不同的限制，详见模型文档。范围 `x > 1`。

#### `messages`

- 类型：对象数组
- 必需：是

输入消息列表。模型被训练为在用户和助手之间交替进行对话。创建新消息时，您可以使用 messages 参数指定之前的对话轮次，模型将生成对话中的下一条消息。连续的用户或助手消息会被合并为单个轮次。

每个消息必须包含 `role` 和 `content` 字段。您可以指定单个用户角色消息，或包含多个用户和助手消息。如果最后一条消息使用助手角色，响应内容将直接从该消息的内容继续，这可以用来约束模型的响应。

**单条用户消息示例:**
```json
[{"role": "user", "content": "Hello, Claude"}]
```

**多轮对话示例:**
```json
[
  {"role": "user", "content": "你好。"},
  {"role": "assistant", "content": "你好！我是 Claude。有什么可以帮你的吗？"},
  {"role": "user", "content": "请用简单的话解释什么是 LLM？"}
]
```

**部分填充的响应示例:**
```json
[
  {"role": "user", "content": "太阳的希腊语名字是什么? (A) Sol (B) Helios (C) Sun"},
  {"role": "assistant", "content": "正确答案是 ("}
]
```

每个消息的 content 可以是字符串或内容块数组。使用字符串相当于一个 "text" 类型的内容块数组的简写。以下两种写法等效：

```json
{"role": "user", "content": "Hello, Claude"}
```

```json
{
  "role": "user", 
  "content": [{"type": "text", "text": "Hello, Claude"}]
}
```

从 Claude 3 模型开始，您还可以发送图片内容块：

```json
{
  "role": "user",
  "content": [
    {
      "type": "image",
      "source": {
        "type": "base64",
        "media_type": "image/jpeg",
        "data": "/9j/4AAQSkZJRg..."
      }
    },
    {
      "type": "text",
      "text": "这张图片里有什么?"
    }
  ]
}
```

> 目前支持的图片格式包括: base64, image/jpeg、image/png、image/gif 和 image/webp。

##### `messages.role`

- 类型：枚举字符串
- 必需：是
- 可选值：user, assistant

注意：Messages API 中没有 "system" 角色，如果需要系统提示，请使用顶层的 system 参数。

##### `messages.content`

- 类型：字符串或对象数组
- 必需：是

消息内容可以是以下几种类型之一：

###### 文本内容 (Text)

```json
{
  "type": "text",          // 必需，枚举值: "text"
  "text": "Hello, Claude", // 必需，最小长度: 1
  "cache_control": {
    "type": "ephemeral"    // 可选，枚举值: "ephemeral"
  }
}
```

###### 图片内容 (Image)

```json
{
  "type": "image",         // 必需，枚举值: "image"
  "source": {             // 必需
    "type": "base64",     // 必需，枚举值: "base64"
    "media_type": "image/jpeg", // 必需，支持: image/jpeg, image/png, image/gif, image/webp
    "data": "/9j/4AAQSkZJRg..."  // 必需，base64 编码的图片数据
  },
  "cache_control": {
    "type": "ephemeral"    // 可选，枚举值: "ephemeral"
  }
}
```

###### 工具使用 (Tool Use)

```json
{
  "type": "tool_use",      // 必需，枚举值: "tool_use"，默认值
  "id": "toolu_xyz...",    // 必需，工具使用的唯一标识符
  "name": "get_weather",   // 必需，工具名称，最小长度: 1
  "input": {              // 必需，工具的输入参数对象
    // 工具输入参数，具体格式由工具的 input_schema 定义
  },
  "cache_control": {
    "type": "ephemeral"    // 可选，枚举值: "ephemeral"
  }
}
```

###### 工具结果 (Tool Result)

```json
{
  "type": "tool_result",   // 必需，枚举值: "tool_result"
  "tool_use_id": "toolu_xyz...",  // 必需
  "content": "结果内容",   // 必需，可以是字符串或内容块数组
  "is_error": false,      // 可选，布尔值
  "cache_control": {
    "type": "ephemeral"    // 可选，枚举值: "ephemeral"
  }
}
```

当 content 为内容块数组时，每个内容块可以是文本或图片：

```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_xyz...",
  "content": [
    {
      "type": "text",      // 必需，枚举值: "text"
      "text": "分析结果",   // 必需，最小长度: 1
      "cache_control": {
        "type": "ephemeral" // 可选，枚举值: "ephemeral"
      }
    },
    {
      "type": "image",     // 必需，枚举值: "image"
      "source": {         // 必需
        "type": "base64", // 必需，枚举值: "base64"
        "media_type": "image/jpeg",
        "data": "..."
      },
      "cache_control": {
        "type": "ephemeral"
      }
    }
  ]
}
```

###### 文档 (Document)

```json
{
  "type": "document",      // 必需，枚举值: "document"
  "source": {             // 必需
    // 文档源数据
  },
  "cache_control": {
    "type": "ephemeral"    // 可选，枚举值: "ephemeral"
  }
}
```

注意：
1. 每种类型都可以包含可选的 `cache_control` 字段，用于控制内容的缓存行为
2. 文本内容的最小长度为 1
3. 所有类型的 type 字段都是必需的枚举字符串
4. 工具结果的 content 字段支持字符串或包含文本/图片的内容块数组

#### `model`

- 类型：字符串
- 必需：是

要使用的模型名称，详见模型文档。范围 `1 - 256` 个字符。

#### `metadata`

- 类型：对象
- 必需：否

描述请求元数据的对象。包含以下可选字段：

- `user_id`: 与请求关联的用户的外部标识符。应该是 uuid、哈希值或其他不透明标识符。不要包含任何标识信息如姓名、邮箱或电话号码。最大长度：256。

#### `stop_sequences`

- 类型：字符串数组
- 必需：否

自定义的停止生成的文本序列。

#### `stream`

- 类型：布尔值
- 必需：否

是否使用服务器发送事件 (SSE) 来增量返回响应内容。

#### `system`

- 类型：字符串
- 必需：否

系统 prompt，为 Claude 提供背景和指令。这是一种为模型提供上下文和特定目标或角色的方式。注意这与消息中的 role 不同，Messages API 中没有 "system" 角色。

#### `temperature`

- 类型：数字
- 必需：否
- 默认值：1.0

控制生成随机性，0.0 - 1.0。范围 `0 < x < 1`。建议对于分析性/选择题类任务使用接近 0.0 的值，对于创造性和生成性任务使用接近 1.0 的值。

注意：即使 temperature 设置为 0.0，结果也不会完全确定。

#### 🆕 `thinking`

- 类型：对象
- 必需：否

配置 Claude 的扩展思考功能。启用时，响应将包含展示 Claude 在给出最终答案前的思考过程的内容块。需要至少 1,024 个 token 的预算，并计入您的 max_tokens 限制。

可以设置为以下两种模式之一：

##### 1. 启用模式

```json
{
  "type": "enabled",
  "budget_tokens": 2048
}
```

- `type`: 必需，枚举值: "enabled"
- `budget_tokens`: 必需，整数。决定 Claude 可以用于内部推理过程的 token 数量。更大的预算可以让模型对复杂问题进行更深入的分析，提高响应质量。必须 ≥1024 且小于 max_tokens。范围 `x > 1024`。

##### 2. 禁用模式

```json
{
  "type": "disabled"
}
```

- `type`: 必需，枚举值: "disabled"

#### `tool_choice`

- 类型：对象
- 必需：否

控制模型如何使用提供的工具。可以是以下三种类型之一：

##### 1. Auto 模式 (自动选择)

```json
{
  "type": "auto",  // 必需，枚举值: "auto"
  "disable_parallel_tool_use": false  // 可选，默认 false。如果为 true，模型最多只会使用一个工具
}
```

##### 2. Any 模式 (任意工具)

```json
{
  "type": "any",  // 必需，枚举值: "any"
  "disable_parallel_tool_use": false  // 可选，默认 false。如果为 true，模型将恰好使用一个工具
}
```

##### 3. Tool 模式 (指定工具)

```json
{
  "type": "tool",  // 必需，枚举值: "tool"
  "name": "get_weather",  // 必需，指定要使用的工具名称
  "disable_parallel_tool_use": false  // 可选，默认 false。如果为 true，模型将恰好使用一个工具
}
```

注意：
1. Auto 模式：模型可以自行决定是否使用工具
2. Any 模式：模型必须使用工具，但可以选择任何可用的工具
3. Tool 模式：模型必须使用指定的工具

#### `tools`

- 类型：对象数组
- 必需：否

定义模型可能使用的工具。工具可以是自定义工具或内置工具类型：

##### 1. 自定义工具（Tool）

每个自定义工具定义包含：

- `type`: 可选，枚举值: "custom"
- `name`: 工具名称，必需，1-64 个字符
- `description`: 工具描述，建议尽可能详细
- `input_schema`: 工具输入的 JSON Schema 定义，必需
- `cache_control`: 缓存控制，可选，type 为 "ephemeral"

示例：
```json
[
  {
    "type": "custom",
    "name": "get_weather",
    "description": "获取指定位置的当前天气",
    "input_schema": {
      "type": "object",
      "properties": {
        "location": {
          "type": "string",
          "description": "城市名称,如:北京"
        }
      },
      "required": ["location"]
    }
  }
]
```

##### 2. 计算机工具 (ComputerUseTool)

```json
{
  "type": "computer_20241022",  // 必需
  "name": "computer",           // 必需，枚举值: "computer"
  "display_width_px": 1024,     // 必需，显示宽度(像素)
  "display_height_px": 768,     // 必需，显示高度(像素)
  "display_number": 0,          // 可选，X11 显示编号
  "cache_control": {
    "type": "ephemeral"         // 可选
  }
}
```

##### 3. Bash 工具 (BashTool)

```json
{
  "type": "bash_20241022",      // 必需
  "name": "bash",               // 必需，枚举值: "bash"
  "cache_control": {
    "type": "ephemeral"         // 可选
  }
}
```

##### 4. 文本编辑器工具 (TextEditor)

```json
{
  "type": "text_editor_20241022", // 必需
  "name": "str_replace_editor",   // 必需，枚举值: "str_replace_editor"
  "cache_control": {
    "type": "ephemeral"           // 可选
  }
}
```

当模型使用工具时，会返回 tool_use 内容块：

```json
[
  {
    "type": "tool_use",
    "id": "toolu_01D7FLrfh4GYq7yT1ULFeyMV",
    "name": "get_weather",
    "input": { "location": "北京" }
  }
]
```

您可以执行工具并通过 tool_result 内容块返回结果：

```json
[
  {
    "type": "tool_result",
    "tool_use_id": "toolu_01D7FLrfh4GYq7yT1ULFeyMV",
    "content": "北京当前天气晴朗，温度 25°C"
  }
]
```

#### `top_k`

- 类型：整数
- 必需：否
- 范围：x > 0

从 token 的前 K 个选项中采样。用于移除低概率的"长尾"响应。建议仅在高级用例中使用，通常只需要调整 temperature。

#### `top_p`

- 类型：数字
- 必需：否
- 范围：0 < x < 1

使用 nucleus 采样。计算每个后续 token 按概率降序排列的累积分布，在达到 top_p 指定的概率时截断。建议仅调整 temperature 或 top_p 其中之一，不要同时使用。

## 📥 响应

### 成功响应

返回一个聊天补全对象，包含以下字段：

#### `content`

- 类型：对象数组
- 必需：是

模型生成的内容，由多个内容块组成。每个内容块都有一个确定其形状的 type。内容块可以是以下类型之一：

##### 文本内容块 (Text)

```json
{
  "type": "text",          // 必需，枚举值: "text"，默认值
  "text": "你好，我是 Claude。" // 必需，最大长度: 5000000，最小长度: 1
}
```

##### 工具使用内容块 (Tool Use)

```json
{
  "type": "tool_use",      // 必需，枚举值: "tool_use"，默认值
  "id": "toolu_xyz...",    // 必需，工具使用的唯一标识符
  "name": "get_weather",   // 必需，工具名称，最小长度: 1
  "input": {              // 必需，工具的输入参数对象
    // 工具输入参数，具体格式由工具的 input_schema 定义
  }
}
```

示例：
```json
// 文本内容示例
[{"type": "text", "text": "你好，我是 Claude。"}]

// 工具使用示例
[{
  "type": "tool_use",
  "id": "toolu_xyz...",
  "name": "get_weather",
  "input": { "location": "北京" }
}]

// 混合内容示例
[
  {"type": "text", "text": "根据天气查询结果："},
  {
    "type": "tool_use",
    "id": "toolu_xyz...",
    "name": "get_weather",
    "input": { "location": "北京" }
  }
]
```

如果请求的最后一条消息是助手角色，响应内容会直接从该消息继续。例如：

```json
// 请求
[
  {"role": "user", "content": "太阳的希腊语名字是什么? (A) Sol (B) Helios (C) Sun"},
  {"role": "assistant", "content": "正确答案是 ("}
]

// 响应
[{"type": "text", "text": "B)"}]
```

#### `id`

- 类型：字符串
- 必需：是

响应的唯一标识符。

#### `model`

- 类型：字符串
- 必需：是

使用的模型名称。

#### `role`

- 类型：枚举字符串
- 必需：是
- 默认值：assistant

生成消息的会话角色，始终为 "assistant"。

#### `stop_reason`

- 类型：枚举字符串或 null
- 必需：是

停止生成的原因，可能的值包括：

- `"end_turn"`: 模型达到自然停止点
- `"max_tokens"`: 超过请求的 max_tokens 或模型的最大限制
- `"stop_sequence"`: 生成了自定义停止序列之一
- `"tool_use"`: 模型调用了一个或多个工具

在非流式模式下，此值始终非空。在流式模式下，在 message_start 事件中为 null，其他情况下非空。

#### `stop_sequence`

- 类型：字符串或 null
- 必需：是

生成的自定义停止序列。如果模型遇到了 stop_sequences 参数中指定的某个序列，这个字段将包含该匹配的停止序列。如果不是因为停止序列而停止，则为 null。

#### `type`

- 类型：枚举字符串
- 必需：是
- 默认值：message
- 可选值：message

对象类型，对于 Messages 始终为 "message"。

#### `usage`

- 类型：对象
- 必需：是

计费和限流相关的使用量统计。包含以下字段：

- `input_tokens`: 使用的输入 token 数量，必需，范围 x > 0
- `output_tokens`: 使用的输出 token 数量，必需，范围 x > 0
- `cache_creation_input_tokens`: 创建缓存条目使用的输入 token 数量(如果适用)，必需，范围 x > 0
- `cache_read_input_tokens`: 从缓存读取的输入 token 数量(如果适用)，必需，范围 x > 0

注意：由于 API 在内部会对请求进行转换和解析，token 计数可能与请求和响应的实际可见内容不完全对应。例如，即使是空字符串响应，output_tokens 也会是非零值。

### 错误响应

当请求出现问题时，API 将返回一个错误响应对象，HTTP 状态码在 4XX-5XX 范围内。

#### 常见错误状态码

- `401 Unauthorized`: API 密钥无效或未提供
- `400 Bad Request`: 请求参数无效
- `429 Too Many Requests`: 超出 API 调用限制
- `500 Internal Server Error`: 服务器内部错误

错误响应示例:

```json
{
  "error": {
    "type": "invalid_request_error",
    "message": "Invalid API key provided",
    "code": "invalid_api_key"
  }
}
```

主要错误类型:

- `invalid_request_error`: 请求参数错误
- `authentication_error`: 认证相关错误
- `rate_limit_error`: 请求频率超限
- `server_error`: 服务器内部错误