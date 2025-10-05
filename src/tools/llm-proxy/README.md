# LLM 代理监听器使用说明

## 功能介绍

LLM 代理监听器是一个本地 HTTP 代理服务，用于捕获和分析 AI 客户端与 LLM API 之间的通信。它可以帮助你：

- 查看 AI 客户端发送的完整请求内容（包括系统提示词、用户消息等）
- 分析 API 返回的原始响应数据
- 调试客户端与 API 之间的通信问题
- 了解不同 AI 工具的实现细节

## 使用步骤

### 1. 配置代理

1. 打开应用，进入"LLM 代理监听器"工具
2. 设置本地监听端口（默认 8999）
3. 设置目标 API 地址，例如：
   - OpenAI: `https://api.openai.com`
   - Anthropic: `https://api.anthropic.com`
   - Google: `https://generativelanguage.googleapis.com`

### 2. 启动代理

点击"启动代理"按钮，代理服务将在指定端口启动。

### 3. 配置客户端

在你的 AI 客户端中，将 API 地址修改为本地代理地址：

- 原地址：`https://api.openai.com/v1/chat/completions`
- 改为：`http://localhost:8999/v1/chat/completions`

### 4. 使用客户端

正常使用你的 AI 客户端，所有请求都会通过代理服务。

### 5. 查看捕获数据

- 在代理监听器界面可以看到所有捕获的请求和响应
- 点击任意记录查看详细信息
- 支持搜索和过滤功能

## 测试示例

### 使用 curl 测试 OpenAI API

```bash
# 通过代理发送请求
curl http://localhost:8999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### 使用 Python 测试

```python
import openai

# 配置使用本地代理
openai.api_base = "http://localhost:8999/v1"
openai.api_key = "YOUR_API_KEY"

response = openai.ChatCompletion.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

## 注意事项

1. **安全性**：代理会捕获所有经过的数据，包括 API 密钥。请只在本地开发环境使用。
2. **端口冲突**：确保选择的端口没有被其他服务占用。
3. **HTTPS**：某些客户端可能不接受 HTTP 连接，可能需要额外配置。
4. **响应时间**：代理会增加一定的延迟，这是正常的。

## 常见问题

### Q: 为什么客户端连接失败？
A: 检查：
- 代理服务是否正在运行
- 端口是否正确
- 防火墙是否允许连接

### Q: 为什么看不到请求体？
A: 某些请求可能使用了流式传输或特殊编码，代理会尽力解析但可能无法完全显示。

### Q: 如何导出捕获的数据？
A: 目前可以通过浏览器的开发者工具复制数据，后续版本将添加导出功能。