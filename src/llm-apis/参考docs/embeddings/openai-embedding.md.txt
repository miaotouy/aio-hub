# OpenAI 嵌入格式（Embeddings）

!!! info "官方文档"
    [OpenAI Embeddings](https://platform.openai.com/docs/api-reference/embeddings)

## 📝 简介

获取给定输入文本的向量表示，这些向量可以被机器学习模型和算法轻松使用。相关指南请参阅 [Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)。

需要注意的是:

- 某些模型可能对输入的总 token 数有限制

- 您可以使用[示例 Python 代码](https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb)来计算 token 数量

- 例如：text-embedding-ada-002 模型的输出向量维度为 1536

## 💡 请求示例

### 创建文本嵌入 ✅

```bash
curl https://你的newapi服务器地址/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "input": "The food was delicious and the waiter...",
    "model": "text-embedding-ada-002",
    "encoding_format": "float"
  }'
```

**响应示例:**

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [
        0.0023064255,
        -0.009327292,
        // ... (1536 个浮点数,用于 ada-002)
        -0.0028842222
      ],
      "index": 0
    }
  ],
  "model": "text-embedding-ada-002",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

### 批量创建嵌入 ✅

```bash
curl https://你的newapi服务器地址/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "input": ["The food was delicious", "The waiter was friendly"],
    "model": "text-embedding-ada-002",
    "encoding_format": "float"
  }'
```

**响应示例:**

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [
        0.0023064255,
        // ... (1536 个浮点数)
      ],
      "index": 0
    },
    {
      "object": "embedding",
      "embedding": [
        -0.008815289,
        // ... (1536 个浮点数)  
      ],
      "index": 1
    }
  ],
  "model": "text-embedding-ada-002",
  "usage": {
    "prompt_tokens": 12,
    "total_tokens": 12
  }
}
```

## 📮 请求

### 端点

```
POST /v1/embeddings
```

创建表示输入文本的嵌入向量。

### 鉴权方法

在请求头中包含以下内容进行 API 密钥认证：

```
Authorization: Bearer $NEWAPI_API_KEY
```

其中 `$OPENAI_API_KEY` 是您的 API 密钥。

### 请求体参数

#### `input`

- 类型：字符串或数组
- 必需：是

要嵌入的输入文本,编码为字符串或 token 数组。要在单个请求中嵌入多个输入,请传递字符串数组或 token 数组的数组。输入不得超过模型的最大输入 token 数(text-embedding-ada-002 为 8192 个 token),不能为空字符串,任何数组的维度必须小于等于 2048。

#### `model`

- 类型：字符串
- 必需：是

要使用的模型 ID。您可以使用 List models API 查看所有可用模型,或查看模型概述了解它们的描述。

#### `encoding_format`

- 类型：字符串
- 必需：否
- 默认值：float

返回嵌入的格式。可以是 float 或 base64。

#### `dimensions`

- 类型：整数
- 必需：否

生成的输出嵌入应具有的维度数。仅在 text-embedding-3 及更高版本的模型中支持。

#### `user`

- 类型：字符串
- 必需：否

代表您的最终用户的唯一标识符,可以帮助 OpenAI 监控和检测滥用行为。[了解更多](https://platform.openai.com/docs/guides/safety-best-practices/end-user-ids)。

## 📥 响应

### 成功响应

返回嵌入对象列表。

#### `object`

- 类型：字符串
- 说明：对象类型,值为 "list"

#### `data`

- 类型：数组
- 说明：包含嵌入对象的数组
- 属性:
  - `object`: 对象类型,值为 "embedding"
  - `embedding`: 嵌入向量,浮点数列表。向量长度取决于模型
  - `index`: 嵌入在列表中的索引

#### `model`

- 类型：字符串
- 说明：使用的模型名称

#### `usage`

- 类型：对象
- 说明：token 使用统计
- 属性:
  - `prompt_tokens`: 提示使用的 token 数
  - `total_tokens`: 总 token 数

### 嵌入对象

表示由嵌入端点返回的嵌入向量。

```json
{
  "object": "embedding",
  "embedding": [
    0.0023064255,
    -0.009327292,
    // ... (ada-002 总共 1536 个浮点数)
    -0.0028842222
  ],
  "index": 0
}
```

#### `index`

- 类型：整数
- 说明：嵌入在列表中的索引

#### `embedding` 

- 类型：数组
- 说明：嵌入向量,浮点数列表。向量长度取决于模型,具体请参阅嵌入指南

#### `object`

- 类型：字符串
- 说明：对象类型,始终为 "embedding" 

### 错误响应

当请求出现问题时，API 将返回一个错误响应对象，HTTP 状态码在 4XX-5XX 范围内。

#### 常见错误状态码

- `401 Unauthorized`: API 密钥无效或未提供
- `400 Bad Request`: 请求参数无效，例如输入为空或超出 token 限制
- `429 Too Many Requests`: 超出 API 调用限制
- `500 Internal Server Error`: 服务器内部错误

错误响应示例:

```json
{
  "error": {
    "message": "The input exceeds the maximum length. Please reduce the length of your input.",
    "type": "invalid_request_error",
    "param": "input",
    "code": "context_length_exceeded"
  }
}
```
