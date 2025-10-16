# Google Gemini 对话格式（Generate Content）

!!! info "官方文档"
    [Google Gemini Generating content API](https://ai.google.dev/api/generate-content)

## 📝 简介

Google Gemini API 支持使用图片、音频、代码、工具等生成内容。给定输入 GenerateContentRequest 生成模型响应。支持文本生成、视觉理解、音频处理、长上下文、代码执行、JSON 模式、函数调用等多种功能。

## 💡 请求示例

### 基础文本对话 ✅

```bash
curl "https://你的newapi服务器地址/v1beta/models/gemini-2.0-flash:generateContent?key=$NEWAPI_API_KEY" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d '{
      "contents": [{
        "parts":[{"text": "Write a story about a magic backpack."}]
        }]
       }' 2> /dev/null
```

### 图像分析对话 ✅

```bash
# 使用临时文件保存base64编码的图片数据
TEMP_B64=$(mktemp)
trap 'rm -f "$TEMP_B64"' EXIT
base64 $B64FLAGS $IMG_PATH > "$TEMP_B64"

# 使用临时文件保存JSON载荷
TEMP_JSON=$(mktemp)
trap 'rm -f "$TEMP_JSON"' EXIT

cat > "$TEMP_JSON" << EOF
{
  "contents": [{
    "parts":[
      {"text": "Tell me about this instrument"},
      {
        "inline_data": {
          "mime_type":"image/jpeg",
          "data": "$(cat "$TEMP_B64")"
        }
      }
    ]
  }]
}
EOF

curl "https://你的newapi服务器地址/v1beta/models/gemini-2.0-flash:generateContent?key=$NEWAPI_API_KEY" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d "@$TEMP_JSON" 2> /dev/null
```

### 函数调用 ✅

```bash
cat > tools.json << EOF
{
  "function_declarations": [
    {
      "name": "enable_lights",
      "description": "Turn on the lighting system."
    },
    {
      "name": "set_light_color",
      "description": "Set the light color. Lights must be enabled for this to work.",
      "parameters": {
        "type": "object",
        "properties": {
          "rgb_hex": {
            "type": "string",
            "description": "The light color as a 6-digit hex string, e.g. ff0000 for red."
          }
        },
        "required": [
          "rgb_hex"
        ]
      }
    },
    {
      "name": "stop_lights",
      "description": "Turn off the lighting system."
    }
  ]
} 
EOF

curl "https://你的newapi服务器地址/v1beta/models/gemini-2.0-flash:generateContent?key=$NEWAPI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d @<(echo '
  {
    "system_instruction": {
      "parts": {
        "text": "You are a helpful lighting system bot. You can turn lights on and off, and you can set the color. Do not perform any other tasks."
      }
    },
    "tools": ['$(cat tools.json)'],

    "tool_config": {
      "function_calling_config": {"mode": "auto"}
    },

    "contents": {
      "role": "user",
      "parts": {
        "text": "Turn on the lights please."
      }
    }
  }
') 2>/dev/null |sed -n '/"content"/,/"finishReason"/p'
```

### JSON 模式响应 ✅

```bash
curl "https://你的newapi服务器地址/v1beta/models/gemini-2.0-flash:generateContent?key=$NEWAPI_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
    "contents": [{
      "parts":[
        {"text": "List 5 popular cookie recipes"}
        ]
    }],
    "generationConfig": {
        "response_mime_type": "application/json",
        "response_schema": {
          "type": "ARRAY",
          "items": {
            "type": "OBJECT",
            "properties": {
              "recipe_name": {"type":"STRING"},
            }
          }
        }
    }
}' 2> /dev/null | head
```

### 音频处理 🟡

!!! warning "文件上传限制"
    仅支持通过 `inline_data` 以 base64 方式上传音频，不支持 `file_data.file_uri` 或 File API。

```bash
# 使用File API上传音频数据到API请求
# 使用 base64 inline_data 上传音频数据到 API 请求
if [[ "$(base64 --version 2>&1)" = *"FreeBSD"* ]]; then
  B64FLAGS="--input"
else
  B64FLAGS="-w0"
fi
AUDIO_B64=$(base64 $B64FLAGS "$AUDIO_PATH")

curl "https://你的newapi服务器地址/v1beta/models/gemini-2.0-flash:generateContent?key=$NEWAPI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Please describe this audio file."},
        {"inline_data": {"mime_type": "audio/mpeg", "data": "'$AUDIO_B64'"}}
      ]
    }]
  }' 2> /dev/null | jq ".candidates[].content.parts[].text"
```

### 视频处理 🟡

!!! warning "文件上传限制"
    仅支持通过 `inline_data` 以 base64 方式上传视频，不支持 `file_data.file_uri` 或 File API。

```bash
# 使用File API上传视频数据到API请求
# 使用 base64 inline_data 上传视频数据到 API 请求
if [[ "$(base64 --version 2>&1)" = *"FreeBSD"* ]]; then
  B64FLAGS="--input"
else
  B64FLAGS="-w0"
fi
VIDEO_B64=$(base64 $B64FLAGS "$VIDEO_PATH")

curl "https://你的newapi服务器地址/v1beta/models/gemini-2.0-flash:generateContent?key=$NEWAPI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Transcribe the audio from this video and provide visual descriptions."},
        {"inline_data": {"mime_type": "video/mp4", "data": "'$VIDEO_B64'"}}
      ]
    }]
  }' 2> /dev/null | jq ".candidates[].content.parts[].text"
```

### PDF处理 🟡

!!! warning "文件上传限制"
    仅支持通过 `inline_data` 以 base64 方式上传 PDF，不支持 `file_data.file_uri` 或 File API。

```bash
MIME_TYPE=$(file -b --mime-type "${PDF_PATH}")
# 使用 base64 inline_data 上传 PDF 文件到 API 请求
if [[ "$(base64 --version 2>&1)" = *"FreeBSD"* ]]; then
  B64FLAGS="--input"
else
  B64FLAGS="-w0"
fi
PDF_B64=$(base64 $B64FLAGS "$PDF_PATH")

echo $MIME_TYPE

curl "https://你的newapi服务器地址/v1beta/models/gemini-2.0-flash:generateContent?key=$NEWAPI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Can you add a few more lines to this poem?"},
        {"inline_data": {"mime_type": "application/pdf", "data": "'$PDF_B64'"}}
      ]
    }]
  }' 2> /dev/null | jq ".candidates[].content.parts[].text"
```

### 聊天对话 ✅

```bash
curl https://你的newapi服务器地址/v1beta/models/gemini-2.0-flash:generateContent?key=$NEWAPI_API_KEY \
    -H 'Content-Type: application/json' \
    -X POST \
    -d '{
      "contents": [
        {"role":"user",
         "parts":[{
           "text": "Hello"}]},
        {"role": "model",
         "parts":[{
           "text": "Great to meet you. What would you like to know?"}]},
        {"role":"user",
         "parts":[{
           "text": "I have two dogs in my house. How many paws are in my house?"}]},
      ]
    }' 2> /dev/null | grep "text"
```

### 流式响应 ✅

```bash
curl "https://你的newapi服务器地址/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=$NEWAPI_API_KEY" \
    -H 'Content-Type: application/json' \
    --no-buffer \
    -d '{
      "contents": [{
        "parts": [{"text": "写一个关于魔法背包的故事"}]
      }]
    }'
```

### 代码执行 ✅

```bash
curl "https://你的newapi服务器地址/v1beta/models/gemini-2.0-flash:generateContent?key=$NEWAPI_API_KEY" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d '{
      "contents": [{
        "parts": [{"text": "计算斐波那契数列的第10项"}]
      }],
      "tools": [{
        "codeExecution": {}
      }]
    }'
```

### 生成配置 ✅

```bash
curl https://你的newapi服务器地址/v1beta/models/gemini-2.0-flash:generateContent?key=$NEWAPI_API_KEY \
    -H 'Content-Type: application/json' \
    -X POST \
    -d '{
        "contents": [{
            "parts":[
                {"text": "Explain how AI works"}
            ]
        }],
        "generationConfig": {
            "stopSequences": [
                "Title"
            ],
            "temperature": 1.0,
            "maxOutputTokens": 800,
            "topP": 0.8,
            "topK": 10
        }
    }'  2> /dev/null | grep "text"
```

### 安全设置 ✅

```bash
echo '{
    "safetySettings": [
        {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
        {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"}
    ],
    "contents": [{
        "parts":[{
            "text": "'I support Martians Soccer Club and I think Jupiterians Football Club sucks! Write a ironic phrase about them.'"}]}]}' > request.json

curl "https://你的newapi服务器地址/v1beta/models/gemini-2.0-flash:generateContent?key=$NEWAPI_API_KEY" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d @request.json 2> /dev/null
```

### 系统指令 ✅

```bash
curl "https://你的newapi服务器地址/v1beta/models/gemini-2.0-flash:generateContent?key=$NEWAPI_API_KEY" \
-H 'Content-Type: application/json' \
-d '{ "system_instruction": {
    "parts":
      { "text": "You are a cat. Your name is Neko."}},
    "contents": {
      "parts": {
        "text": "Hello there"}}}'
```

## 📮 请求

### 端点

#### 生成内容
```
POST https://你的newapi服务器地址/v1beta/{model=models/*}:generateContent
```

#### 流式生成内容
```
POST https://你的newapi服务器地址/v1beta/{model=models/*}:streamGenerateContent
```

### 鉴权方法

在请求URL参数中包含API密钥：

```
?key=$NEWAPI_API_KEY
```

其中 `$NEWAPI_API_KEY` 是您的 Google AI API 密钥。

### 路径参数

#### `model`

- 类型：字符串
- 必需：是

用于生成补全项的模型名称。

格式：`models/{model}`，例如 `models/gemini-2.0-flash`

### 请求体参数

#### `contents`

- 类型：数组
- 必需：是

与模型当前对话的内容。对于单轮查询，这是单个实例。对于聊天等多轮查询，这是包含对话历史记录和最新请求的重复字段。

**Content 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `parts` | 数组 | 是 | 有序的内容部分，构成单个消息 |
| `role` | 字符串 | 否 | 对话中内容的生产者。`user`、`model`、`function` 或 `tool` |

**Part 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `text` | 字符串 | 否 | 纯文本内容 |
| `inlineData` | 对象 | 否 | 内联媒体字节数据 |
| `fileData` | 对象 | 否 | 上传文件的URI引用 |
| `functionCall` | 对象 | 否 | 函数调用请求 |
| `functionResponse` | 对象 | 否 | 函数调用响应 |
| `executableCode` | 对象 | 否 | 可执行代码 |
| `codeExecutionResult` | 对象 | 否 | 代码执行结果 |

**InlineData 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `mimeType` | 字符串 | 是 | 媒体的MIME类型 |
| `data` | 字符串 | 是 | base64编码的媒体数据 |

**FileData 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `mimeType` | 字符串 | 是 | 文件的MIME类型 |
| `fileUri` | 字符串 | 是 | 文件的URI |

#### `tools`

- 类型：数组
- 必需：否

模型可能用于生成下一个响应的工具列表。支持的工具包括函数和代码执行。

**Tool 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `functionDeclarations` | 数组 | 否 | 可选的函数声明列表 |
| `codeExecution` | 对象 | 否 | 启用模型执行代码 |

**FunctionDeclaration 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `name` | 字符串 | 是 | 函数名称 |
| `description` | 字符串 | 否 | 函数功能描述 |
| `parameters` | 对象 | 否 | 函数参数，JSON Schema格式 |

**FunctionCall 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `name` | 字符串 | 是 | 要调用的函数名称 |
| `args` | 对象 | 否 | 函数参数的键值对 |

**FunctionResponse 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `name` | 字符串 | 是 | 调用的函数名称 |
| `response` | 对象 | 是 | 函数调用的响应数据 |

**ExecutableCode 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `language` | 枚举 | 是 | 代码的编程语言 |
| `code` | 字符串 | 是 | 要执行的代码 |

**CodeExecutionResult 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `outcome` | 枚举 | 是 | 代码执行的结果状态 |
| `output` | 字符串 | 否 | 代码执行的输出内容 |

**CodeExecution 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| {} | 空对象 | - | 启用代码执行功能的空配置对象 |

#### `toolConfig`

- 类型：对象
- 必需：否

请求中指定的任何工具的工具配置。

**ToolConfig 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `functionCallingConfig` | 对象 | 否 | 函数调用配置 |

**FunctionCallingConfig 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `mode` | 枚举 | 否 | 指定函数调用的模式 |
| `allowedFunctionNames` | 数组 | 否 | 允许调用的函数名列表 |

**FunctionCallingMode 枚举值：**

- `MODE_UNSPECIFIED`: 默认模式，模型决定是否调用函数
- `AUTO`: 模型自动决定何时调用函数 
- `ANY`: 模型必须调用函数
- `NONE`: 模型不能调用函数

#### `safetySettings`

- 类型：数组
- 必需：否

用于屏蔽不安全内容的 SafetySetting 实例列表。

**SafetySetting 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `category` | 枚举 | 是 | 安全类别 |
| `threshold` | 枚举 | 是 | 屏蔽阈值 |

**HarmCategory 枚举值：**

- `HARM_CATEGORY_HARASSMENT`: 骚扰内容
- `HARM_CATEGORY_HATE_SPEECH`: 仇恨言论和内容
- `HARM_CATEGORY_SEXUALLY_EXPLICIT`: 露骨色情内容
- `HARM_CATEGORY_DANGEROUS_CONTENT`: 危险内容
- `HARM_CATEGORY_CIVIC_INTEGRITY`: 可能用于破坏公民诚信的内容

**HarmBlockThreshold 枚举值：**

- `BLOCK_LOW_AND_ABOVE`: 允许发布评分为 NEGLIGIBLE 的内容
- `BLOCK_MEDIUM_AND_ABOVE`: 允许发布评分为 NEGLIGIBLE 和 LOW 的内容
- `BLOCK_ONLY_HIGH`: 允许发布风险等级为 NEGLIGIBLE、LOW 和 MEDIUM 的内容
- `BLOCK_NONE`: 允许所有内容
- `OFF`: 关闭安全过滤器

**HarmBlockThreshold 完整枚举值：**

- `HARM_BLOCK_THRESHOLD_UNSPECIFIED`: 未指定阈值
- `BLOCK_LOW_AND_ABOVE`: 屏蔽低概率及以上的有害内容，只允许 NEGLIGIBLE 级别的内容
- `BLOCK_MEDIUM_AND_ABOVE`: 屏蔽中等概率及以上的有害内容，允许 NEGLIGIBLE 和 LOW 级别的内容
- `BLOCK_ONLY_HIGH`: 只屏蔽高概率的有害内容，允许 NEGLIGIBLE、LOW 和 MEDIUM 级别的内容
- `BLOCK_NONE`: 不屏蔽任何内容，允许所有级别的内容
- `OFF`: 完全关闭安全过滤器

#### `systemInstruction`

- 类型：对象（Content）
- 必需：否

开发者设置的系统指令。目前仅支持文本。

#### `generationConfig`

- 类型：对象
- 必需：否

模型生成和输出的配置选项。

**GenerationConfig 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `stopSequences` | 数组 | 否 | 用于停止生成输出的字符序列集（最多5个） |
| `responseMimeType` | 字符串 | 否 | 生成的候选文本的MIME类型 |
| `responseSchema` | 对象 | 否 | 生成的候选文本的输出架构 |
| `responseModalities` | 数组 | 否 | 请求的响应模式 |
| `candidateCount` | 整数 | 否 | 要返回的生成的回答数量 |
| `maxOutputTokens` | 整数 | 否 | 候选回答中包含的令牌数量上限 |
| `temperature` | 数字 | 否 | 控制输出的随机性，范围[0.0, 2.0] |
| `topP` | 数字 | 否 | 在抽样时要考虑的令牌的累计概率上限 |
| `topK` | 整数 | 否 | 抽样时要考虑的令牌数量上限 |
| `seed` | 整数 | 否 | 解码中使用的种子 |
| `presencePenalty` | 数字 | 否 | 存在性惩罚 |
| `frequencyPenalty` | 数字 | 否 | 频率惩罚 |
| `responseLogprobs` | 布尔值 | 否 | 是否在响应中导出logprobs结果 |
| `logprobs` | 整数 | 否 | 返回的顶部logprob的数量 |
| `enableEnhancedCivicAnswers` | 布尔值 | 否 | 启用增强型城市服务回答 |
| `speechConfig` | 对象 | 否 | 语音生成配置 |
| `thinkingConfig` | 对象 | 否 | 思考功能的配置 |
| `mediaResolution` | 枚举 | 否 | 指定的媒体分辨率 |

**支持的 MIME 类型：**

- `text/plain`: （默认）文本输出
- `application/json`: JSON响应
- `text/x.enum`: ENUM作为字符串响应

**Modality 枚举值：**

- `TEXT`: 指示模型应返回文本
- `IMAGE`: 表示模型应返回图片
- `AUDIO`: 指示模型应返回音频

**Schema 对象属性：**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `type` | 枚举 | 是 | 数据类型 |
| `description` | 字符串 | 否 | 字段描述 |
| `enum` | 数组 | 否 | 枚举值列表（当type为string时） |
| `example` | 任意类型 | 否 | 示例值 |
| `nullable` | 布尔值 | 否 | 是否可为null |
| `format` | 字符串 | 否 | 字符串格式（如date、date-time等） |
| `items` | 对象 | 否 | 数组项的Schema（当type为array时） |
| `properties` | 对象 | 否 | 对象属性的Schema映射（当type为object时） |
| `required` | 数组 | 否 | 必需属性的名称列表 |
| `minimum` | 数字 | 否 | 数字的最小值 |
| `maximum` | 数字 | 否 | 数字的最大值 |
| `minItems` | 整数 | 否 | 数组的最小长度 |
| `maxItems` | 整数 | 否 | 数组的最大长度 |
| `minLength` | 整数 | 否 | 字符串的最小长度 |
| `maxLength` | 整数 | 否 | 字符串的最大长度 |

**Type 枚举值：**

- `TYPE_UNSPECIFIED`: 未指定类型
- `STRING`: 字符串类型
- `NUMBER`: 数字类型
- `INTEGER`: 整数类型
- `BOOLEAN`: 布尔类型
- `ARRAY`: 数组类型
- `OBJECT`: 对象类型

**支持的编程语言（ExecutableCode）：**

- `LANGUAGE_UNSPECIFIED`: 未指定语言
- `PYTHON`: Python编程语言

**代码执行结果枚举（Outcome）：**

- `OUTCOME_UNSPECIFIED`: 未指定结果
- `OUTCOME_OK`: 代码执行成功
- `OUTCOME_FAILED`: 代码执行失败
- `OUTCOME_DEADLINE_EXCEEDED`: 代码执行超时

#### `cachedContent`

- 类型：字符串
- 必需：否

缓存的内容的名称，用于用作提供预测的上下文。格式：`cachedContents/{cachedContent}`

## 📥 响应

### GenerateContentResponse

支持多个候选回答的模型的回答。系统会针对提示以及每个候选项报告安全分级和内容过滤。

#### `candidates`

- 类型：数组
- 说明：模型的候选回答列表

**Candidate 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `content` | 对象 | 模型返回的生成内容 |
| `finishReason` | 枚举 | 模型停止生成词元的原因 |
| `safetyRatings` | 数组 | 候选回答安全性的评分列表 |
| `citationMetadata` | 对象 | 模型生成的候选项的引用信息 |
| `tokenCount` | 整数 | 此候选项的令牌数 |
| `groundingAttributions` | 数组 | 为生成有依据的回答所参考的来源提供方信息 |
| `groundingMetadata` | 对象 | 候选对象的参考元数据 |
| `avgLogprobs` | 数字 | 候选项的平均对数概率得分 |
| `logprobsResult` | 对象 | 回答令牌和前置令牌的对数似然度得分 |
| `urlRetrievalMetadata` | 对象 | 与网址情境检索工具相关的元数据 |
| `urlContextMetadata` | 对象 | 与网址情境检索工具相关的元数据 |
| `index` | 整数 | 响应候选列表中候选项的索引 |

**FinishReason 枚举值：**

- `STOP`: 模型的自然停止点或提供的停止序列
- `MAX_TOKENS`: 已达到请求中指定的词元数量上限
- `SAFETY`: 出于安全考虑，系统已标记回答候选内容
- `RECITATION`: 由于背诵原因，回答候选内容被标记
- `LANGUAGE`: 回答候选内容因使用不受支持的语言而被标记
- `OTHER`: 原因未知
- `BLOCKLIST`: 由于内容包含禁止使用的字词，因此token生成操作已停止
- `PROHIBITED_CONTENT`: 由于可能包含禁止的内容，因此token生成操作已停止
- `SPII`: 由于内容可能包含敏感的个人身份信息，因此token生成操作已停止
- `MALFORMED_FUNCTION_CALL`: 模型生成的函数调用无效
- `IMAGE_SAFETY`: 由于生成的图片违反了安全规定，因此词元生成已停止

#### `promptFeedback`

- 类型：对象
- 说明：与内容过滤器相关的提示反馈

**PromptFeedback 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `blockReason` | 枚举 | 屏蔽该提示的原因 |
| `safetyRatings` | 数组 | 问题安全性的评分 |

**BlockReason 枚举值：**

- `BLOCK_REASON_UNSPECIFIED`: 默认值，此值未使用
- `SAFETY`: 出于安全原因，系统屏蔽了提示
- `OTHER`: 提示因未知原因被屏蔽了
- `BLOCKLIST`: 系统屏蔽了此提示，因为其中包含术语屏蔽名单中包含的术语
- `PROHIBITED_CONTENT`: 系统屏蔽了此提示，因为其中包含禁止的内容
- `IMAGE_SAFETY`: 候选图片因生成不安全的内容而被屏蔽

#### `usageMetadata`

- 类型：对象
- 说明：有关生成请求令牌用量的元数据

**UsageMetadata 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `promptTokenCount` | 整数 | 提示中的词元数 |
| `cachedContentTokenCount` | 整数 | 提示的缓存部分中的词元数 |
| `candidatesTokenCount` | 整数 | 所有生成的候选回答中的词元总数 |
| `totalTokenCount` | 整数 | 生成请求的总令牌数 |
| `toolUsePromptTokenCount` | 整数 | 工具使用提示中的词元数量 |
| `thoughtsTokenCount` | 整数 | 思考模型的想法token数 |
| `promptTokensDetails` | 数组 | 在请求输入中处理的模态列表 |
| `candidatesTokensDetails` | 数组 | 响应中返回的模态列表 |
| `cacheTokensDetails` | 数组 | 请求输入中缓存内容的模态列表 |
| `toolUsePromptTokensDetails` | 数组 | 为工具使用请求输入处理的模态列表 |

#### `modelVersion`

- 类型：字符串
- 说明：用于生成回答的模型版本

#### `responseId`

- 类型：字符串
- 说明：用于标识每个响应的ID

#### 完整响应示例

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "你好！我是 Gemini，一个由 Google 开发的人工智能助手。我可以帮助您解答问题、提供信息、协助写作、代码编程等多种任务。请告诉我有什么可以为您效劳的！"
          }
        ],
        "role": "model"
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": [
        {
          "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          "probability": "NEGLIGIBLE",
          "blocked": false
        },
        {
          "category": "HARM_CATEGORY_HATE_SPEECH", 
          "probability": "NEGLIGIBLE",
          "blocked": false
        },
        {
          "category": "HARM_CATEGORY_HARASSMENT",
          "probability": "NEGLIGIBLE",
          "blocked": false
        },
        {
          "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
          "probability": "NEGLIGIBLE",
          "blocked": false
        }
      ],
      "tokenCount": 47
    }
  ],
  "promptFeedback": {
    "safetyRatings": [
      {
        "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "probability": "NEGLIGIBLE"
      },
      {
        "category": "HARM_CATEGORY_HATE_SPEECH",
        "probability": "NEGLIGIBLE"
      }
    ]
  },
  "usageMetadata": {
    "promptTokenCount": 4,
    "candidatesTokenCount": 47,
    "totalTokenCount": 51,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 4
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "TEXT", 
        "tokenCount": 47
      }
    ]
  },
  "modelVersion": "gemini-2.0-flash",
  "responseId": "response-12345"
}
```

## 🔧 高级功能

### 安全评级

**SafetyRating 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `category` | 枚举 | 此评分的类别 |
| `probability` | 枚举 | 此内容的有害概率 |
| `blocked` | 布尔值 | 此内容是否因此分级而被屏蔽 |

**HarmProbability 枚举值：**

- `NEGLIGIBLE`: 内容不安全的概率可忽略不计
- `LOW`: 内容不安全的概率较低
- `MEDIUM`: 内容不安全的概率为中等
- `HIGH`: 内容不安全的概率较高

### 引用元数据

**CitationMetadata 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `citationSources` | 数组 | 特定回复的来源引用 |

**CitationSource 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `startIndex` | 整数 | 归因于此来源的响应片段的开始索引 |
| `endIndex` | 整数 | 归因细分的结束索引（不含） |
| `uri` | 字符串 | 被归因为文本部分来源的URI |
| `license` | 字符串 | 被归因为片段来源的GitHub项目的许可 |

### 代码执行

当启用代码执行工具时，模型可以生成和执行代码来解决问题。

**代码执行示例响应：**

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "我来计算斐波那契数列的第10项："
          },
          {
            "executableCode": {
              "language": "PYTHON",
              "code": "def fibonacci(n):\n    if n <= 1:\n        return n\n    else:\n        return fibonacci(n-1) + fibonacci(n-2)\n\nresult = fibonacci(10)\nprint(f'第10项斐波那契数是: {result}')"
            }
          },
          {
            "codeExecutionResult": {
              "outcome": "OK",
              "output": "第10项斐波那契数是: 55"
            }
          },
          {
            "text": "所以斐波那契数列的第10项是55。"
          }
        ],
        "role": "model"
      },
      "finishReason": "STOP"
    }
  ]
}
```

### 接地功能 (Grounding)

**GroundingMetadata 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `groundingChunks` | 数组 | 从指定的接地源检索到的支持参考文献列表 |
| `groundingSupports` | 数组 | 接地支持列表 |
| `webSearchQueries` | 数组 | 用于后续网页搜索的网页搜索查询 |
| `searchEntryPoint` | 对象 | 后续网页搜索的Google搜索条目 |
| `retrievalMetadata` | 对象 | 与基准流程中检索相关的元数据 |

**GroundingAttribution 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `sourceId` | 对象 | 对此归因做出贡献的来源的标识符 |
| `content` | 对象 | 构成此归因的来源内容 |

**AttributionSourceId 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `groundingPassage` | 对象 | 内嵌段落的标识符 |
| `semanticRetrieverChunk` | 对象 | 通过Semantic Retriever提取的Chunk的标识符 |

**GroundingPassageId 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `passageId` | 字符串 | 与GenerateAnswerRequest的GroundingPassage.id匹配的段落的ID |
| `partIndex` | 整数 | GenerateAnswerRequest的GroundingPassage.content中的部分的索引 |

**SemanticRetrieverChunk 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `source` | 字符串 | 与请求的SemanticRetrieverConfig.source匹配的来源名称 |
| `chunk` | 字符串 | 包含归因文本的Chunk的名称 |

**SearchEntryPoint 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `renderedContent` | 字符串 | 可嵌入网页或应用WebView中的Web内容代码段 |
| `sdkBlob` | 字符串 | 使用base64编码的JSON，表示搜索词和搜索URL元组的数组 |

**Segment 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `partIndex` | 整数 | Part对象在其父级Content对象中的索引 |
| `startIndex` | 整数 | 给定part中的起始索引，以字节为单位 |
| `endIndex` | 整数 | 给定分块中的结束索引，以字节为单位 |
| `text` | 字符串 | 与响应中的片段对应的文本 |

**RetrievalMetadata 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `googleSearchDynamicRetrievalScore` | 数字 | Google搜索中的信息有助于回答问题的概率得分，范围[0,1] |

**GroundingChunk 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `web` | 对象 | 来自网络的接地分块 |

**Web 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `uri` | 字符串 | 分块的URI引用 |
| `title` | 字符串 | 数据块的标题 |

**GroundingSupport 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `groundingChunkIndices` | 数组 | 索引列表，用于指定与版权主张相关的引文 |
| `confidenceScores` | 数组 | 支持参考文档的置信度分数，范围为0到1 |
| `segment` | 对象 | 此支持请求所属的内容片段 |

### 多模态处理

Gemini API 支持处理多种模态的输入和输出：

**支持的输入模态：**

- `TEXT`: 纯文本
- `IMAGE`: 图片（JPEG、PNG、WebP、HEIC、HEIF）
- `AUDIO`: 音频（WAV、MP3、AIFF、AAC、OGG、FLAC）
- `VIDEO`: 视频（MP4、MPEG、MOV、AVI、FLV、MPG、WEBM、WMV、3GPP）
- `DOCUMENT`: 文档（PDF）

**ModalityTokenCount 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `modality` | 枚举 | 与此令牌数关联的模态 |
| `tokenCount` | 整数 | 令牌数量 |

**MediaResolution 枚举值：**

- `MEDIA_RESOLUTION_LOW`: 低分辨率（64个令牌）
- `MEDIA_RESOLUTION_MEDIUM`: 中等分辨率（256个令牌）
- `MEDIA_RESOLUTION_HIGH`: 高分辨率（256个令牌进行缩放重新取景）

### 思考功能

**ThinkingConfig 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `includeThoughts` | 布尔值 | 是否要在回答中包含思考内容 |
| `thinkingBudget` | 整数 | 模型应生成的想法token的数量 |

### 语音生成

**SpeechConfig 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `voiceConfig` | 对象 | 单声音输出的配置 |
| `multiSpeakerVoiceConfig` | 对象 | 多音箱设置的配置 |
| `languageCode` | 字符串 | 用于语音合成的语言代码 |

**VoiceConfig 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `prebuiltVoiceConfig` | 对象 | 要使用的预构建语音的配置 |

**PrebuiltVoiceConfig 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `voiceName` | 字符串 | 要使用的预设语音的名称 |

**MultiSpeakerVoiceConfig 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `speakerVoiceConfigs` | 数组 | 所有已启用的音箱语音 |

**SpeakerVoiceConfig 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `speaker` | 字符串 | 要使用的音箱的名称 |
| `voiceConfig` | 对象 | 要使用的语音的配置 |

**支持的语言代码：**

- `zh-CN`: 中文（简体）
- `en-US`: 英语（美国）
- `ja-JP`: 日语
- `ko-KR`: 韩语
- `fr-FR`: 法语
- `de-DE`: 德语
- `es-ES`: 西班牙语
- `pt-BR`: 葡萄牙语（巴西）
- `hi-IN`: 印地语
- `ar-XA`: 阿拉伯语
- `it-IT`: 意大利语
- `tr-TR`: 土耳其语
- `vi-VN`: 越南语
- `th-TH`: 泰语
- `ru-RU`: 俄语
- `pl-PL`: 波兰语
- `nl-NL`: 荷兰语

### Logprobs 结果

**LogprobsResult 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `topCandidates` | 数组 | 长度等于解码步骤总数 |
| `chosenCandidates` | 数组 | 长度等于解码步骤总数，所选候选项不一定在topCandidates中 |

**TopCandidates 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `candidates` | 数组 | 按对数概率降序排序的候选项 |

**Candidate (Logprobs) 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `token` | 字符串 | 候选项的令牌字符串值 |
| `tokenId` | 整数 | 候选项的令牌ID值 |
| `logProbability` | 数字 | 候选项的对数概率 |

### URL检索功能

**UrlRetrievalMetadata 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `urlRetrievalContexts` | 数组 | 网址检索情境列表 |

**UrlRetrievalContext 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `retrievedUrl` | 字符串 | 工具检索到的网址 |

**UrlContextMetadata 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `urlMetadata` | 数组 | 网址上下文列表 |

**UrlMetadata 对象属性：**

| 属性 | 类型 | 描述 |
|------|------|------|
| `retrievedUrl` | 字符串 | 工具检索到的网址 |
| `urlRetrievalStatus` | 枚举 | 网址检索的状态 |

**UrlRetrievalStatus 枚举值：**

- `URL_RETRIEVAL_STATUS_SUCCESS`: 网址检索成功
- `URL_RETRIEVAL_STATUS_ERROR`: 由于出错，网址检索失败

### 完整安全类别

**HarmCategory 完整枚举值：**

- `HARM_CATEGORY_UNSPECIFIED`: 类别未指定
- `HARM_CATEGORY_DEROGATORY`: PaLM - 针对身份和/或受保护属性的负面或有害评论
- `HARM_CATEGORY_TOXICITY`: PaLM - 粗鲁、无礼或亵渎性的内容
- `HARM_CATEGORY_VIOLENCE`: PaLM - 描述描绘针对个人或团体的暴力行为的场景
- `HARM_CATEGORY_SEXUAL`: PaLM - 包含对性行为或其他淫秽内容的引用
- `HARM_CATEGORY_MEDICAL`: PaLM - 宣传未经核实的医疗建议
- `HARM_CATEGORY_DANGEROUS`: PaLM - 危险内容会宣扬、助长或鼓励有害行为
- `HARM_CATEGORY_HARASSMENT`: Gemini - 骚扰内容
- `HARM_CATEGORY_HATE_SPEECH`: Gemini - 仇恨言论和内容
- `HARM_CATEGORY_SEXUALLY_EXPLICIT`: Gemini - 露骨色情内容
- `HARM_CATEGORY_DANGEROUS_CONTENT`: Gemini - 危险内容
- `HARM_CATEGORY_CIVIC_INTEGRITY`: Gemini - 可能用于破坏公民诚信的内容

**HarmProbability 完整枚举值：**

- `HARM_PROBABILITY_UNSPECIFIED`: 概率未指定
- `NEGLIGIBLE`: 内容不安全的概率可忽略不计
- `LOW`: 内容不安全的概率较低
- `MEDIUM`: 内容不安全的概率为中等
- `HIGH`: 内容不安全的概率较高

**Modality 完整枚举值：**

- `MODALITY_UNSPECIFIED`: 未指定模态
- `TEXT`: 纯文本
- `IMAGE`: 图片
- `VIDEO`: 视频
- `AUDIO`: 音频
- `DOCUMENT`: 文档，例如PDF

**MediaResolution 完整枚举值：**

- `MEDIA_RESOLUTION_UNSPECIFIED`: 未设置媒体分辨率
- `MEDIA_RESOLUTION_LOW`: 媒体分辨率设为低（64个令牌）
- `MEDIA_RESOLUTION_MEDIUM`: 媒体分辨率设为中等（256个令牌）
- `MEDIA_RESOLUTION_HIGH`: 媒体分辨率设为高（使用256个令牌进行缩放重新取景）

**UrlRetrievalStatus 完整枚举值：**

- `URL_RETRIEVAL_STATUS_UNSPECIFIED`: 默认值，此值未使用
- `URL_RETRIEVAL_STATUS_SUCCESS`: 网址检索成功
- `URL_RETRIEVAL_STATUS_ERROR`: 由于出错，网址检索失败

## 🔍 错误处理

### 常见错误码

| 错误码 | 描述 |
|--------|------|
| `400` | 请求格式错误或参数无效 |
| `401` | API密钥无效或缺失 |
| `403` | 权限不足或配额限制 |
| `429` | 请求频率过高 |
| `500` | 服务器内部错误 |

### 详细错误码说明

| 错误码 | 状态 | 描述 | 解决方案 |
|--------|------|------|----------|
| `400` | `INVALID_ARGUMENT` | 请求参数无效或格式错误 | 检查请求参数格式和必需字段 |
| `400` | `FAILED_PRECONDITION` | 请求的前置条件不满足 | 确保满足API调用的前置条件 |
| `401` | `UNAUTHENTICATED` | API密钥无效、缺失或已过期 | 检查API密钥的有效性和格式 |
| `403` | `PERMISSION_DENIED` | 权限不足或配额已用完 | 检查API密钥权限或升级配额 |
| `404` | `NOT_FOUND` | 指定的模型或资源不存在 | 验证模型名称和资源路径 |
| `413` | `PAYLOAD_TOO_LARGE` | 请求体太大 | 减少输入内容大小或分批处理 |
| `429` | `RESOURCE_EXHAUSTED` | 请求频率超限或配额不足 | 降低请求频率或等待配额重置 |
| `500` | `INTERNAL` | 服务器内部错误 | 重试请求，如持续出现联系支持 |
| `503` | `UNAVAILABLE` | 服务暂时不可用 | 等待一段时间后重试 |
| `504` | `DEADLINE_EXCEEDED` | 请求超时 | 减少输入大小或重试请求 |

### 错误响应示例

```json
{
  "error": {
    "code": 400,
    "message": "Invalid argument: contents",
    "status": "INVALID_ARGUMENT",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.BadRequest",
        "fieldViolations": [
          {
            "field": "contents",
            "description": "contents is required"
          }
        ]
      }
    ]
  }
}
```