# Deepseek reasoning 对话格式（Reasoning Content）

!!! info "官方文档"
    [推理模型 (deepseek-reasoner)](https://api-docs.deepseek.com/zh-cn/guides/reasoning_model)

## 📝 简介

Deepseek-reasoner 是 DeepSeek 推出的推理模型。在输出最终回答之前，模型会先输出一段思维链内容，以提升最终答案的准确性。API 向用户开放 deepseek-reasoner 思维链的内容，以供用户查看、展示、蒸馏使用。

## 💡 请求示例

### 基础文本对话 ✅

```bash
curl https://api.deepseek.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "model": "deepseek-reasoner",
    "messages": [
      {
        "role": "user",
        "content": "9.11 and 9.8, which is greater?"
      }
    ],
    "max_tokens": 32768
  }'
```

**响应示例:**

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "deepseek-reasoner",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "reasoning_content": "让我一步步思考:\n1. 我们需要比较9.11和9.8的大小\n2. 两个数都是小数,我们可以直接比较\n3. 9.8 = 9.80\n4. 9.11 < 9.80\n5. 所以9.8更大",
      "content": "9.8 is greater than 9.11."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 15,
    "total_tokens": 25
  }
}
```

### 流式响应 ✅

```bash
curl https://api.deepseek.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "model": "deepseek-reasoner",
    "messages": [
      {
        "role": "user",
        "content": "9.11 and 9.8, which is greater?"
      }
    ],
    "stream": true
  }'
```

**流式响应示例:**

```jsonl
{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"让我"},"finish_reason":null}]}

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"reasoning_content":"一步步"},"finish_reason":null}]}

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"reasoning_content":"思考:"},"finish_reason":null}]}

// ... 更多思维链内容 ...

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"content":"9.8"},"finish_reason":null}]}

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"content":" is greater"},"finish_reason":null}]}

// ... 更多最终答案内容 ...

{"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
```

## 📮 请求

### 端点

```
POST /v1/chat/completions
```

### 鉴权方法

在请求头中包含以下内容进行 API 密钥认证：

```
Authorization: Bearer $NEWAPI_API_KEY
```

其中 `$DEEPSEEK_API_KEY` 是您的 API 密钥。

### 请求体参数

#### `messages`

- 类型：数组
- 必需：是

到目前为止包含对话的消息列表。请注意,如果您在输入的 messages 序列中传入了 reasoning_content，API 会返回 400 错误。

#### `model`

- 类型：字符串  
- 必需：是
- 值：deepseek-reasoner

要使用的模型 ID。目前仅支持 deepseek-reasoner。

#### `max_tokens`

- 类型：整数
- 必需：否
- 默认值：4096
- 最大值：65536

最终回答的最大长度（不含思维链输出）。请注意，思维链的输出最多可以达到 32K tokens。

#### `stream`

- 类型：布尔值
- 必需：否
- 默认值：false

是否使用流式响应。

### 不支持的参数

以下参数当前不支持:

- temperature
- top_p  
- presence_penalty
- frequency_penalty
- logprobs
- top_logprobs

注意:为了兼容已有软件,设置 temperature、top_p、presence_penalty、frequency_penalty 参数不会报错,但也不会生效。设置 logprobs、top_logprobs 会报错。

### 支持的功能

- 对话补全
- 对话前缀续写 (Beta)

### 不支持的功能

- Function Call
- Json Output  
- FIM 补全 (Beta)

## 📥 响应

### 成功响应

返回一个聊天补全对象，如果请求被流式传输，则返回聊天补全块对象的流式序列。

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
- 说明：使用的模型名称,值为 "deepseek-reasoner"

#### `choices`
- 类型：数组
- 说明：包含生成的回复选项
- 属性:
  - `index`: 选项索引
  - `message`: 包含角色、思维链内容和最终回答的消息对象
    - `role`: 角色,值为 "assistant"
    - `reasoning_content`: 思维链内容
    - `content`: 最终回答内容
  - `finish_reason`: 完成原因

#### `usage`
- 类型：对象
- 说明：token 使用统计
- 属性:
  - `prompt_tokens`: 提示使用的 token 数
  - `completion_tokens`: 补全使用的 token 数
  - `total_tokens`: 总 token 数

## 📝 上下文拼接说明

在每一轮对话过程中，模型会输出思维链内容（reasoning_content）和最终回答（content）。在下一轮对话中，之前轮输出的思维链内容不会被拼接到上下文中，如下图所示：

![Deepseek reasoning 上下文拼接示意图](../assets/deepseek_r1_multiround_example_cn.png)

!!! warning "注意"
    如果您在输入的 messages 序列中，传入了reasoning_content，API 会返回 400 错误。因此，请删除 API 响应中的 reasoning_content 字段，再发起 API 请求，方法如下方使用示例所示。

使用示例:

```python
from openai import OpenAI
client = OpenAI(api_key="<DeepSeek API Key>", base_url="https://api.deepseek.com")

# 第一轮对话
messages = [{"role": "user", "content": "9.11 and 9.8, which is greater?"}]
response = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=messages
)

reasoning_content = response.choices[0].message.reasoning_content
content = response.choices[0].message.content

# 第二轮对话 - 只拼接最终回答content
messages.append({'role': 'assistant', 'content': content})
messages.append({'role': 'user', 'content': "How many Rs are there in the word 'strawberry'?"})
response = client.chat.completions.create(
    model="deepseek-reasoner", 
    messages=messages
)
```

流式响应示例:

```python
# 第一轮对话
messages = [{"role": "user", "content": "9.11 and 9.8, which is greater?"}]
response = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=messages,
    stream=True
)

reasoning_content = ""
content = ""

for chunk in response:
    if chunk.choices[0].delta.reasoning_content:
        reasoning_content += chunk.choices[0].delta.reasoning_content
    else:
        content += chunk.choices[0].delta.content

# 第二轮对话 - 只拼接最终回答content
messages.append({"role": "assistant", "content": content})
messages.append({'role': 'user', 'content': "How many Rs are there in the word 'strawberry'?"})
response = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=messages,
    stream=True
)
```

