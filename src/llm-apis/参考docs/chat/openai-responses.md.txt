# OpenAI 响应格式（Responses）

!!! info "官方文档"
    [OpenAI Responses](https://platform.openai.com/docs/api-reference/responses)

## 📝 简介

OpenAI 最先进的模型响应接口。支持文本和图像输入，以及文本输出。创建与模型的有状态交互，将先前响应的输出用作输入。通过文件搜索、网络搜索、计算机使用等内置工具扩展模型的能力。使用函数调用允许模型访问外部系统和数据。

相关指南可参阅OpenAI官网：[Responses](https://platform.openai.com/docs/guides/responses)

## 💡 请求示例

### 基础文本响应 ✅

```bash
curl https://你的newapi服务器地址/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "model": "gpt-4.1",
    "input": "讲一个三句话的关于独角兽的睡前故事。"
  }'
```

**响应示例:**

```json
{
  "id": "resp_67ccd2bed1ec8190b14f964abc0542670bb6a6b452d3795b",
  "object": "response",
  "created_at": 1741476542,
  "status": "completed",
  "error": null,
  "incomplete_details": null,
  "instructions": null,
  "max_output_tokens": null,
  "model": "gpt-4.1",
  "output": [
    {
      "type": "message",
      "id": "msg_67ccd2bf17f0819081ff3bb2cf6508e60bb6a6b452d3795b",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "在一个宁静的月夜下，一只名叫璐米娜的独角兽发现了一个倒映着星星的隐藏水池。当她将独角浸入水中时，水池开始闪烁，显现出通往一个有着无尽夜空的魔法世界的路径。充满好奇，璐米娜为所有做梦的人许下愿望，希望他们能找到自己的隐藏魔法，当她回头望去，她的蹄印像星尘一样闪烁。",
          "annotations": []
        }
      ]
    }
  ],
  "parallel_tool_calls": true,
  "previous_response_id": null,
  "reasoning": {
    "effort": null,
    "summary": null
  },
  "store": true,
  "temperature": 1.0,
  "text": {
    "format": {
      "type": "text"
    }
  },
  "tool_choice": "auto",
  "tools": [],
  "top_p": 1.0,
  "truncation": "disabled",
  "usage": {
    "input_tokens": 36,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens": 87,
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "total_tokens": 123
  },
  "user": null,
  "metadata": {}
}
```

### 图像分析响应 ✅

```bash
curl https://你的newapi服务器地址/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "model": "gpt-4.1",
    "input": [
      {
        "role": "user",
        "content": [
          {"type": "input_text", "text": "描述这张图片中的内容"},
          {
            "type": "input_image",
            "image_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"
          }
        ]
      }
    ]
  }'
```

**响应示例:**

```json
{
  "id": "resp_67ccd3a9da748190baa7f1570fe91ac604becb25c45c1d41",
  "object": "response",
  "created_at": 1741476777,
  "status": "completed",
  "error": null,
  "incomplete_details": null,
  "instructions": null,
  "max_output_tokens": null,
  "model": "gpt-4.1",
  "output": [
    {
      "type": "message",
      "id": "msg_67ccd3acc8d48190a77525dc6de64b4104becb25c45c1d41",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "这张图片展示了一条木制栈道或小径穿过茂密的绿色草地，上方是点缀着几朵云的蓝天。场景呈现出一个宁静的自然区域，可能是公园或自然保护区。背景中有树木和灌木丛。整个景观展现出和谐的自然环境，栈道为游客提供了一条穿过湿地或草原而不影响周围生态系统的路径。",
          "annotations": []
        }
      ]
    }
  ],
  "parallel_tool_calls": true,
  "previous_response_id": null,
  "reasoning": {
    "effort": null,
    "summary": null
  },
  "store": true,
  "temperature": 1.0,
  "text": {
    "format": {
      "type": "text"
    }
  },
  "tool_choice": "auto",
  "tools": [],
  "top_p": 1.0,
  "truncation": "disabled",
  "usage": {
    "input_tokens": 328,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens": 52,
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "total_tokens": 380
  },
  "user": null,
  "metadata": {}
}
```

### 网络搜索工具 ✅

```bash
curl https://你的newapi服务器地址/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "model": "gpt-4.1",
    "tools": [{ "type": "web_search_preview" }],
    "input": "今天有什么积极正面的新闻?"
  }'
```

**响应示例:**

```json
{
  "id": "resp_67ccf18ef5fc8190b16dbee19bc54e5f087bb177ab789d5c",
  "object": "response",
  "created_at": 1741484430,
  "status": "completed",
  "error": null,
  "incomplete_details": null,
  "instructions": null,
  "max_output_tokens": null,
  "model": "gpt-4.1",
  "output": [
    {
      "type": "web_search_call",
      "id": "ws_67ccf18f64008190a39b619f4c8455ef087bb177ab789d5c",
      "status": "completed"
    },
    {
      "type": "message",
      "id": "msg_67ccf190ca3881909d433c50b1f6357e087bb177ab789d5c",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "截至今天，2025年3月9日，一则值得关注的积极新闻是中国科学家在可再生能源领域取得重大突破，成功研发出一种新型高效太阳能电池，转化率达到了创纪录的35%，这可能会极大推动清洁能源的普及和应用。这项技术预计将使太阳能发电成本降低约40%，为全球减少碳排放提供了新的解决方案。",
          "annotations": [
            {
              "type": "url_citation",
              "start_index": 42,
              "end_index": 100,
              "url": "https://example.com/renewable-energy-breakthrough/?utm_source=chatgpt.com",
              "title": "中国科学家在可再生能源领域取得重大突破"
            },
            {
              "type": "url_citation",
              "start_index": 101,
              "end_index": 150,
              "url": "https://example.com/solar-cell-efficiency-record/?utm_source=chatgpt.com",
              "title": "新型高效太阳能电池转化率创纪录"
            },
            {
              "type": "url_citation",
              "start_index": 151,
              "end_index": 200,
              "url": "https://example.com/clean-energy-cost-reduction/?utm_source=chatgpt.com",
              "title": "太阳能发电成本有望降低40%"
            }
          ]
        }
      ]
    }
  ],
  "parallel_tool_calls": true,
  "previous_response_id": null,
  "reasoning": {
    "effort": null,
    "summary": null
  },
  "store": true,
  "temperature": 1.0,
  "text": {
    "format": {
      "type": "text"
    }
  },
  "tool_choice": "auto",
  "tools": [
    {
      "type": "web_search_preview",
      "domains": [],
      "search_context_size": "medium",
      "user_location": {
        "type": "approximate",
        "city": null,
        "country": "US",
        "region": null,
        "timezone": null
      }
    }
  ],
  "top_p": 1.0,
  "truncation": "disabled",
  "usage": {
    "input_tokens": 328,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens": 356,
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "total_tokens": 684
  },
  "user": null,
  "metadata": {}
}
```

### 文件搜索工具 ✅

```bash
curl https://你的newapi服务器地址/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "model": "gpt-4.1",
    "tools": [{
      "type": "file_search",
      "vector_store_ids": ["vs_1234567890"],
      "max_num_results": 20
    }],
    "input": "古代棕龙有哪些特性和属性?"
  }'
```

**响应示例:**

```json
{
  "id": "resp_67ccf4c55fc48190b71bd0463ad3306d09504fb6872380d7",
  "object": "response",
  "created_at": 1741485253,
  "status": "completed",
  "error": null,
  "incomplete_details": null,
  "instructions": null,
  "max_output_tokens": null,
  "model": "gpt-4.1",
  "output": [
    {
      "type": "file_search_call",
      "id": "fs_67ccf4c63cd08190887ef6464ba5681609504fb6872380d7",
      "status": "completed",
      "queries": [
        "古代棕龙的特性和属性"
      ],
      "results": null
    },
    {
      "type": "message",
      "id": "msg_67ccf4c93e5c81909d595b369351a9d309504fb6872380d7",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "根据资料，古代棕龙具有以下特性和属性：\n\n1. 物理特征：古代棕龙体型庞大，体长可达25-30米，翼展约35米。它们的鳞片呈深棕色至铜色，随着年龄增长会变得更加暗沉。头部有特征性的双角和脊刺，下颚强壮，适合撕裂猎物。\n\n2. 能力：它们能喷吐强力的酸液，对目标造成严重腐蚀伤害。古代棕龙还拥有出色的掘地能力，常在沙漠或山地挖掘复杂的巢穴系统。\n\n3. 智力：被认为是龙族中最为狡猾和有耐心的品种，智力极高，精通多种语言，并具有复杂的战术思维。\n\n4. 栖息地：主要栖息在干旱的山地和沙漠地区，喜欢炎热干燥的环境。\n\n5. 宝藏：古代棕龙以其庞大的宝藏闻名，特别喜爱收集铜币、红宝石和火焰魔法物品。\n\n6. 寿命：是所有龙种中寿命最长的之一，可活2000-2500年，随着年龄增长其力量和魔法能力也会增强。\n\n7. 性格：极度领地意识强，性格暴躁易怒，对侵入者毫不留情，但也以其罕见的耐心著称，能为复仇等待几个世纪。",
          "annotations": [
            {
              "type": "file_citation",
              "index": 80,
              "file_id": "file-4wDz5b167pAf72nx1h9eiN",
              "filename": "dragons.pdf"
            },
            {
              "type": "file_citation",
              "index": 233,
              "file_id": "file-4wDz5b167pAf72nx1h9eiN",
              "filename": "dragons.pdf"
            },
            {
              "type": "file_citation",
              "index": 345,
              "file_id": "file-4wDz5b167pAf72nx1h9eiN",
              "filename": "dragons.pdf"
            },
            {
              "type": "file_citation",
              "index": 420,
              "file_id": "file-4wDz5b167pAf72nx1h9eiN",
              "filename": "dragons.pdf"
            },
            {
              "type": "file_citation",
              "index": 520,
              "file_id": "file-4wDz5b167pAf72nx1h9eiN",
              "filename": "dragons.pdf"
            },
            {
              "type": "file_citation",
              "index": 580,
              "file_id": "file-4wDz5b167pAf72nx1h9eiN",
              "filename": "dragons.pdf"
            },
            {
              "type": "file_citation",
              "index": 655,
              "file_id": "file-4wDz5b167pAf72nx1h9eiN",
              "filename": "dragons.pdf"
            },
            {
              "type": "file_citation",
              "index": 781,
              "file_id": "file-4wDz5b167pAf72nx1h9eiN",
              "filename": "dragons.pdf"
            }
          ]
        }
      ]
    }
  ],
  "parallel_tool_calls": true,
  "previous_response_id": null,
  "reasoning": {
    "effort": null,
    "summary": null
  },
  "store": true,
  "temperature": 1.0,
  "text": {
    "format": {
      "type": "text"
    }
  },
  "tool_choice": "auto",
  "tools": [
    {
      "type": "file_search",
      "filters": null,
      "max_num_results": 20,
      "ranking_options": {
        "ranker": "auto",
        "score_threshold": 0.0
      },
      "vector_store_ids": [
        "vs_1234567890"
      ]
    }
  ],
  "top_p": 1.0,
  "truncation": "disabled",
  "usage": {
    "input_tokens": 18307,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens": 348,
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "total_tokens": 18655
  },
  "user": null,
  "metadata": {}
}
```

### 流式响应 ✅

```bash
curl https://你的newapi服务器地址/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "model": "gpt-4.1",
    "instructions": "你是一个有帮助的助手。",
    "input": "你好！",
    "stream": true
  }'
```

**流式响应示例:**

```
event: response.created
data: {"type":"response.created","response":{"id":"resp_67c9fdcecf488190bdd9a0409de3a1ec07b8b0ad4e5eb654","object":"response","created_at":1741290958,"status":"in_progress","error":null,"incomplete_details":null,"instructions":"你是一个有帮助的助手。","max_output_tokens":null,"model":"gpt-4.1-2025-04-14","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":1.0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1.0,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}

event: response.in_progress
data: {"type":"response.in_progress","response":{"id":"resp_67c9fdcecf488190bdd9a0409de3a1ec07b8b0ad4e5eb654","object":"response","created_at":1741290958,"status":"in_progress","error":null,"incomplete_details":null,"instructions":"你是一个有帮助的助手。","max_output_tokens":null,"model":"gpt-4.1-2025-04-14","output":[],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":1.0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1.0,"truncation":"disabled","usage":null,"user":null,"metadata":{}}}

event: response.output_item.added
data: {"type":"response.output_item.added","output_index":0,"item":{"id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","type":"message","status":"in_progress","role":"assistant","content":[]}}

event: response.content_part.added
data: {"type":"response.content_part.added","item_id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}

event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","output_index":0,"content_index":0,"delta":"你好"}

event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","output_index":0,"content_index":0,"delta":"！"}

event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","output_index":0,"content_index":0,"delta":" 我"}

event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","output_index":0,"content_index":0,"delta":"能"}

event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","output_index":0,"content_index":0,"delta":"为"}

event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","output_index":0,"content_index":0,"delta":"您"}

event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","output_index":0,"content_index":0,"delta":"提供"}

event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","output_index":0,"content_index":0,"delta":"什么"}

event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","output_index":0,"content_index":0,"delta":"帮助"}

event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","output_index":0,"content_index":0,"delta":"吗"}

event: response.output_text.delta
data: {"type":"response.output_text.delta","item_id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","output_index":0,"content_index":0,"delta":"？"}

event: response.output_text.done
data: {"type":"response.output_text.done","item_id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","output_index":0,"content_index":0,"text":"你好！ 我能为您提供什么帮助吗？"}

event: response.content_part.done
data: {"type":"response.content_part.done","item_id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","output_index":0,"content_index":0,"part":{"type":"output_text","text":"你好！ 我能为您提供什么帮助吗？","annotations":[]}}

event: response.output_item.done
data: {"type":"response.output_item.done","output_index":0,"item":{"id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"你好！ 我能为您提供什么帮助吗？","annotations":[]}]}}

event: response.completed
data: {"type":"response.completed","response":{"id":"resp_67c9fdcecf488190bdd9a0409de3a1ec07b8b0ad4e5eb654","object":"response","created_at":1741290958,"status":"completed","error":null,"incomplete_details":null,"instructions":"你是一个有帮助的助手。","max_output_tokens":null,"model":"gpt-4.1-2025-04-14","output":[{"id":"msg_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"你好！ 我能为您提供什么帮助吗？","annotations":[]}]}],"parallel_tool_calls":true,"previous_response_id":null,"reasoning":{"effort":null,"summary":null},"store":true,"temperature":1.0,"text":{"format":{"type":"text"}},"tool_choice":"auto","tools":[],"top_p":1.0,"truncation":"disabled","usage":{"input_tokens":37,"output_tokens":11,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":48},"user":null,"metadata":{}}}
```

### 函数调用 ✅

```bash
curl https://你的newapi服务器地址/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "model": "gpt-4.1",
    "input": "波士顿今天的天气如何？",
    "tools": [
      {
        "type": "function",
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
          "required": ["location", "unit"]
        }
      }
    ],
    "tool_choice": "auto"
  }'
```

**响应示例:**

```json
{
  "id": "resp_67ca09c5efe0819096d0511c92b8c890096610f474011cc0",
  "object": "response",
  "created_at": 1741294021,
  "status": "completed",
  "error": null,
  "incomplete_details": null,
  "instructions": null,
  "max_output_tokens": null,
  "model": "gpt-4.1-2025-04-14",
  "output": [
    {
      "type": "function_call",
      "id": "fc_67ca09c6bedc8190a7abfec07b1a1332096610f474011cc0",
      "call_id": "call_unLAR8MvFNptuiZK6K6HCy5k",
      "name": "get_current_weather",
      "arguments": "{\"location\":\"波士顿, MA\",\"unit\":\"celsius\"}",
      "status": "completed"
    }
  ],
  "parallel_tool_calls": true,
  "previous_response_id": null,
  "reasoning": {
    "effort": null,
    "summary": null
  },
  "store": true,
  "temperature": 1.0,
  "text": {
    "format": {
      "type": "text"
    }
  },
  "tool_choice": "auto",
  "tools": [
    {
      "type": "function",
      "description": "获取指定位置的当前天气",
      "name": "get_current_weather",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "城市和州，例如 San Francisco, CA"
          },
          "unit": {
            "type": "string",
            "enum": [
              "celsius",
              "fahrenheit"
            ]
          }
        },
        "required": [
          "location",
          "unit"
        ]
      },
      "strict": true
    }
  ],
  "top_p": 1.0,
  "truncation": "disabled",
  "usage": {
    "input_tokens": 291,
    "output_tokens": 23,
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "total_tokens": 314
  },
  "user": null,
  "metadata": {}
}
```

### 推理能力 ✅

```bash
curl https://你的newapi服务器地址/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWAPI_API_KEY" \
  -d '{
    "model": "o3-mini",
    "input": "一只啄木鸟能啄多少木头?",
    "reasoning": {
      "effort": "high"
    }
  }'
```

**响应示例:**

```json
{
  "id": "resp_67ccd7eca01881908ff0b5146584e408072912b2993db808",
  "object": "response",
  "created_at": 1741477868,
  "status": "completed",
  "error": null,
  "incomplete_details": null,
  "instructions": null,
  "max_output_tokens": null,
  "model": "o1-2024-12-17",
  "output": [
    {
      "type": "message",
      "id": "msg_67ccd7f7b5848190a6f3e95d809f6b44072912b2993db808",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "这是一个源自英文绕口令"How much wood would a woodchuck chuck if a woodchuck could chuck wood"的问题。在现实中，啄木鸟(woodpecker)和土拨鼠(woodchuck)是不同的动物，而且土拨鼠实际上并不"啄(chuck)"木头。\n\n从科学角度看，啄木鸟每天确实会啄树木以寻找食物、建造巢穴或进行通讯。一只啄木鸟平均每天可能啄树约8000-12000次，视物种和具体目的而定。如果我们将这转换为木材量，假设每次啄击移除约0.1-0.2立方厘米的木材，那么一只啄木鸟理论上每天可能移除约800-2400立方厘米的木材。\n\n然而，啄木鸟主要是为了觅食和筑巢而啄木，而不是单纯地移除木材，所以这个计算只是一个有趣的理论估算。",
          "annotations": []
        }
      ]
    }
  ],
  "parallel_tool_calls": true,
  "previous_response_id": null,
  "reasoning": {
    "effort": "high",
    "summary": null
  },
  "store": true,
  "temperature": 1.0,
  "text": {
    "format": {
      "type": "text"
    }
  },
  "tool_choice": "auto",
  "tools": [],
  "top_p": 1.0,
  "truncation": "disabled",
  "usage": {
    "input_tokens": 81,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens": 1035,
    "output_tokens_details": {
      "reasoning_tokens": 832
    },
    "total_tokens": 1116
  },
  "user": null,
  "metadata": {}
}
```

## 📮 请求

### 端点

```
POST /v1/responses
```

创建模型响应。提供文本或图像输入以生成文本或JSON输出。让模型调用您自己的自定义代码或使用内置工具（如网络搜索或文件搜索）将您自己的数据用作模型响应的输入。

### 鉴权方法

在请求头中包含以下内容进行 API 密钥认证：

```
Authorization: Bearer $NEWAPI_API_KEY
```

其中 `$NEWAPI_API_KEY` 是您的 API 密钥。

### 请求体参数

#### input

**类型**: 字符串或数组  
**必需**: 是

提供给模型的文本、图像或文件输入，用于生成响应。

##### 可能的类型

| 类型 | 描述 |
|------|------|
| 字符串 | 文本输入，相当于具有用户角色的文本输入 |
| 输入项数组 | 包含不同内容类型的一个或多个输入项列表 |

##### 输入消息对象

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| content | 字符串或数组 | 是 | 提供给模型的文本、图像或音频输入，用于生成响应。也可以包含之前的助手响应 |
| role | 字符串 | 是 | 输入消息的角色。可选值：`user`、`assistant`、`system` 或 `developer` |
| type | 字符串 | 否 | 输入消息的类型，始终为 `message` |

##### 内容项类型

###### 文本输入

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| text | 字符串 | 是 | 提供给模型的文本输入 |
| type | 字符串 | 是 | 输入项的类型，始终为 `input_text` |

###### 图像输入

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| detail | 字符串 | 是 | 要发送给模型的图像的详细级别。可选值：`high`、`low` 或 `auto`。默认为 `auto` |
| type | 字符串 | 是 | 输入项的类型，始终为 `input_image` |
| file_id | 字符串 | 否 | 要发送给模型的文件ID |
| image_url | 字符串 | 否 | 要发送给模型的图像URL。可以是完整的URL或数据URL中的base64编码图像 |

###### 文件输入

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| type | 字符串 | 是 | 输入项的类型，始终为 `input_file` |
| file_data | 字符串 | 否 | 要发送给模型的文件内容 |
| file_id | 字符串 | 否 | 要发送给模型的文件ID |
| filename | 字符串 | 否 | 要发送给模型的文件名 |

##### 输出项类型

###### 输出文本

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| text | 字符串 | 是 | 模型生成的文本输出 |
| type | 字符串 | 是 | 输出项的类型，始终为 `output_text` |
| annotations | 数组 | 是 | 文本输出的注释 |

###### 注释类型

文件引用:

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| file_id | 字符串 | 是 | 文件的ID |
| index | 整数 | 是 | 文件在文件列表中的索引 |
| type | 字符串 | 是 | 文件引用的类型，始终为 `file_citation` |

URL引用:

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| end_index | 整数 | 是 | URL引用在消息中的最后一个字符的索引 |
| start_index | 整数 | 是 | URL引用在消息中的第一个字符的索引 |
| title | 字符串 | 是 | 网络资源的标题 |
| type | 字符串 | 是 | URL引用的类型，始终为 `url_citation` |
| url | 字符串 | 是 | 网络资源的URL |

文件路径:

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| file_id | 字符串 | 是 | 文件的ID |
| index | 整数 | 是 | 文件在文件列表中的索引 |
| type | 字符串 | 是 | 文件路径的类型，始终为 `file_path` |

###### 拒绝响应

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| refusal | 字符串 | 是 | 模型的拒绝解释 |
| type | 字符串 | 是 | 拒绝的类型，始终为 `refusal` |

##### 工具调用类型

###### 文件搜索工具调用

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| id | 字符串 | 是 | 文件搜索工具调用的唯一ID |
| queries | 数组 | 是 | 用于搜索文件的查询 |
| status | 字符串 | 是 | 文件搜索工具调用的状态。可能值包括：`in_progress`、`searching`、`incomplete` 或 `failed` |
| type | 字符串 | 是 | 文件搜索工具调用的类型，始终为 `file_search_call` |
| results | 数组或null | 否 | 文件搜索工具调用的结果 |

###### 网络搜索工具调用

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| id | 字符串 | 是 | 网络搜索工具调用的唯一ID |
| status | 字符串 | 是 | 网络搜索工具调用的状态 |
| type | 字符串 | 是 | 网络搜索工具调用的类型，始终为 `web_search_call` |

###### 函数工具调用

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| arguments | 字符串 | 是 | 传递给函数的参数的JSON字符串 |
| call_id | 字符串 | 是 | 模型生成的函数工具调用的唯一ID |
| name | 字符串 | 是 | 要运行的函数的名称 |
| type | 字符串 | 是 | 函数工具调用的类型，始终为 `function_call` |
| id | 字符串 | 否 | 函数工具调用的唯一ID |
| status | 字符串 | 否 | 项目的状态。可能值：`in_progress`、`completed`或`incomplete` |

###### 计算机工具调用

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| action | 对象 | 是 | 计算机交互的操作，如点击、拖拽等 |
| call_id | 字符串 | 是 | 响应工具调用输出时使用的标识符 |
| id | 字符串 | 是 | 计算机调用的唯一ID |
| pending_safety_checks | 数组 | 是 | 计算机调用的待处理安全检查 |
| status | 字符串 | 是 | 项目的状态。可能值：`in_progress`、`completed`或`incomplete` |
| type | 字符串 | 是 | 计算机调用的类型，始终为 `computer_call` |

计算机操作类型:

| 操作类型 | 描述 |
|---------|------|
| click | 鼠标点击操作 |
| double_click | 鼠标双击操作 |
| drag | 拖拽操作 |
| keypress | 按键操作 |
| move | 鼠标移动操作 |
| screenshot | 屏幕截图操作 |
| scroll | 滚动操作 |
| type | 文本输入操作 |
| wait | 等待操作 |

###### 计算机工具调用输出

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| call_id | 字符串 | 是 | 产生输出的计算机工具调用的ID |
| output | 对象 | 是 | 用于计算机使用工具的计算机屏幕截图图像 |
| type | 字符串 | 是 | 计算机工具调用输出的类型，始终为 `computer_call_output` |
| acknowledged_safety_checks | 数组 | 否 | API报告的已被开发者确认的安全检查 |
| id | 字符串 | 否 | 计算机工具调用输出的ID |
| status | 字符串 | 否 | 输入消息的状态。可能值：`in_progress`、`completed`或`incomplete` |

###### 函数工具调用输出

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| call_id | 字符串 | 是 | 模型生成的函数工具调用的唯一ID |
| output | 字符串 | 是 | 函数工具调用输出的JSON字符串 |
| type | 字符串 | 是 | 函数工具调用输出的类型，始终为 `function_call_output` |
| id | 字符串 | 否 | 函数工具调用输出的唯一ID |
| status | 字符串 | 否 | 项目的状态。可能值：`in_progress`、`completed`或`incomplete` |

##### 推理相关项

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| id | 字符串 | 是 | 推理内容的唯一标识符 |
| summary | 数组 | 是 | 推理文本内容 |
| type | 字符串 | 是 | 对象的类型，始终为 `reasoning` |
| encrypted_content | 字符串或null | 否 | 推理项的加密内容 - 当使用 `reasoning.encrypted_content` 包含参数生成响应时填充 |
| status | 字符串 | 否 | 项目的状态。可能值：`in_progress`、`completed`或`incomplete` |

推理摘要:

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| text | 字符串 | 是 | 模型生成响应时使用的推理的简短摘要 |
| type | 字符串 | 是 | 对象的类型，始终为 `summary_text` |

##### 项目引用

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| id | 字符串 | 是 | 要引用的项目的ID |
| type | 字符串 | 否 | 要引用的项目类型，始终为 `item_reference` |

#### model

**类型**: 字符串  
**必需**: 是

用于生成响应的模型ID，例如 gpt-4.1 或 o3。OpenAI 提供各种具有不同能力、性能特性和价格点的模型。请参阅模型指南以浏览和比较可用模型。

#### include

**类型**: 数组或null  
**必需**: 否

指定要在模型响应中包含的附加输出数据。当前支持的值包括：

| 值 | 描述 |
|------|------|
| `file_search_call.results` | 包含文件搜索工具调用的搜索结果 |
| `message.input_image.image_url` | 包含输入消息中的图像URL |
| `computer_call_output.output.image_url` | 包含电脑调用输出中的图像URL |
| `reasoning.encrypted_content` | 在推理项输出中包含推理标记的加密版本 |

#### instructions

**类型**: 字符串或null  
**必需**: 否

作为模型上下文中的第一项插入系统（或开发者）消息。

当与 `previous_response_id` 一起使用时，前一个响应中的指令不会被带到下一个响应。这使得在新响应中轻松切换系统（开发者）消息变得简单。

#### max_output_tokens

**类型**: 整数或null  
**必需**: 否

可以为响应生成的令牌数量的上限，包括可见输出令牌和推理令牌。

#### metadata

**类型**: 对象  
**必需**: 否

可以附加到对象的16个键值对集合。这对于以结构化格式存储对象的其他信息很有用,并可以通过 API 或仪表板查询对象。

键是最大长度为64个字符的字符串。值是最大长度为512个字符的字符串。

#### parallel_tool_calls

**类型**: 布尔值或null  
**必需**: 否  
**默认值**: true

是否允许模型并行运行工具调用。

#### previous_response_id

**类型**: 字符串或null  
**必需**: 否

模型的前一个响应的唯一ID。使用此参数创建多轮对话。了解更多关于对话状态。

#### reasoning

**类型**: 对象或null  
**必需**: 否  
**仅适用于o系列模型**

推理模型的配置选项。

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| effort | 字符串或null | 否 | 推理的努力程度，可选值: `low`, `medium`, `high`。默认值为 `medium`。降低推理努力可以加快响应速度并减少响应中用于推理的令牌数 |
| summary | 字符串或null | 否 | 模型执行的推理摘要。这对于调试和理解模型的推理过程很有用。可选值: `auto`, `concise`, `detailed` |
| generate_summary | 字符串或null | 否 | **已弃用**: 请使用 `summary` 替代。模型执行的推理摘要。可选值: `auto`, `concise`, `detailed` |

#### service_tier

**类型**: 字符串或null  
**必需**: 否  
**默认值**: auto

指定用于处理请求的延迟层级。此参数与订阅了 scale tier 服务的客户相关：

| 值 | 描述 |
|------|------|
| `auto` | 如果项目启用了 Scale tier，系统将使用 scale tier 信用直到用完；如果项目未启用 Scale tier，请求将使用默认服务层级处理，具有较低的正常运行时间 SLA 且无延迟保证 |
| `default` | 请求将使用默认服务层级处理，具有较低的正常运行时间 SLA 且无延迟保证 |
| `flex` | 请求将使用 Flex Processing 服务层级处理。了解更多信息请参阅官方文档 |

当未设置此参数时，默认行为为 `auto`。

当设置此参数时，响应体将包含已使用的 `service_tier`。

#### store

**类型**: 布尔值或null  
**必需**: 否  
**默认值**: true

是否存储生成的模型响应以供以后通过 API 检索。

#### stream

**类型**: 布尔值或null  
**必需**: 否  
**默认值**: false

如果设置为 true，模型响应数据将在生成时使用服务器发送的事件流式传输到客户端。

#### temperature

**类型**: 数字或null  
**必需**: 否  
**默认值**: 1

要使用的采样温度，介于 0 和 2 之间。较高的值（如0.8）会使输出更加随机，而较低的值（如0.2）会使其更加集中和确定性。我们通常建议更改此值或 `top_p`，但不要同时更改。

#### text

**类型**: 对象  
**必需**: 否

模型文本响应的配置选项。可以是纯文本或结构化JSON数据。

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| format | 对象 | 否 | 指定模型必须输出的格式 |

配置 `{ "type": "json_schema" }` 启用结构化输出，确保模型将匹配您提供的JSON模式。更多信息请参阅结构化输出指南。

默认格式为 `{ "type": "text" }`，没有其他选项。

**不推荐用于gpt-4o及更新的模型**：
设置为 `{ "type": "json_object" }` 启用较旧的JSON模式，确保模型生成的消息是有效的JSON。对于支持的模型，首选使用 `json_schema`。

##### 文本格式类型

###### 文本 (Text)

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| type | 字符串 | 是 | 定义的响应格式类型。始终为 `text` |

###### JSON模式 (JSON Schema)

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| name | 字符串 | 是 | 响应格式的名称。必须包含a-z, A-Z, 0-9，或包含下划线和破折号，最大长度为64 |
| schema | 对象 | 是 | 响应格式的模式，描述为JSON Schema对象 |
| type | 字符串 | 是 | 定义的响应格式类型。始终为 `json_schema` |
| description | 字符串 | 否 | 响应格式用途的描述，模型用它来确定如何以该格式响应 |
| strict | 布尔值或null | 否 | 是否在生成输出时启用严格模式遵循。默认为 `false`。如果设置为 `true`，模型将始终遵循 schema 字段中定义的确切模式。严格模式下只支持JSON Schema的子集 |

###### JSON对象 (JSON Object)

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| type | 字符串 | 是 | 定义的响应格式类型。始终为 `json_object` |

注意：如果没有指示模型这样做的系统或用户消息，模型将不会生成JSON。对于支持的模型，建议使用 `json_schema`。

#### tool_choice

**类型**: 字符串或对象  
**必需**: 否

模型如何选择生成响应时使用的工具（或多个工具）。请参阅 `tools` 参数了解如何指定模型可以调用的工具。

##### 可能的类型

###### 工具选择模式 (Tool choice mode)

**类型**: 字符串

控制模型是否调用工具以及调用哪种工具。

| 值 | 描述 |
|------|------|
| `none` | 模型不会调用任何工具，而是生成一条消息 |
| `auto` | 模型可以在生成消息或调用一个或多个工具之间选择 |
| `required` | 模型必须调用一个或多个工具 |

###### 托管工具 (Hosted tool)

**类型**: 对象

指示模型应使用内置工具生成响应。

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| type | 字符串 | 是 | 模型应使用的托管工具类型。允许的值有：`file_search`、`web_search_preview`、`computer_use_preview` |

###### 函数工具 (Function tool)

**类型**: 对象

使用此选项强制模型调用特定函数。

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| name | 字符串 | 是 | 要调用的函数名称 |
| type | 字符串 | 是 | 对于函数调用，类型始终为 `function` |

#### tools

**类型**: 数组  
**必需**: 否

模型在生成响应时可能调用的工具数组。你可以通过设置 `tool_choice` 参数来指定使用哪个工具。

你可以提供给模型的两类工具是：

- **内置工具**：由OpenAI提供的扩展模型能力的工具，如网络搜索或文件搜索。
- **函数调用（自定义工具）**：由您定义的函数，使模型能够调用您自己的代码。

##### 文件搜索工具 (File search)

**类型**: 对象

一个搜索已上传文件中相关内容的工具。

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| type | 字符串 | 是 | 文件搜索工具的类型，始终为 `file_search` |
| vector_store_ids | 数组 | 是 | 要搜索的向量存储ID列表 |
| filters | 对象 | 否 | 要应用的过滤器 |
| max_num_results | 整数 | 否 | 返回的最大结果数。此数字应介于1到50之间（含）|
| ranking_options | 对象 | 否 | 搜索排名选项 |

###### 过滤器类型

**比较过滤器 (Comparison Filter)**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| key | 字符串 | 是 | 要与值进行比较的键 |
| type | 字符串 | 是 | 指定比较运算符: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`<br>- eq: 等于<br>- ne: 不等于<br>- gt: 大于<br>- gte: 大于等于<br>- lt: 小于<br>- lte: 小于等于 |
| value | 字符串/数字/布尔值 | 是 | 要与属性键比较的值；支持字符串、数字或布尔类型 |

**复合过滤器 (Compound Filter)**

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| filters | 数组 | 是 | 要组合的过滤器数组。项目可以是比较过滤器或复合过滤器 |
| type | 字符串 | 是 | 操作类型: `and` 或 `or` |

###### 排名选项

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| ranker | 字符串 | 否 | 文件搜索使用的排名器 |
| score_threshold | 数字 | 否 | 文件搜索的分数阈值，介于0和1之间的数字。接近1的数字将尝试仅返回最相关的结果，但可能返回更少的结果 |

##### 函数工具 (Function)

**类型**: 对象

定义模型可以选择调用的您自己代码中的函数。

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| type | 字符串 | 是 | 函数工具的类型，始终为 `function` |
| name | 字符串 | 是 | 要调用的函数名称 |
| parameters | 对象 | 是 | 描述函数参数的JSON模式对象 |
| strict | 布尔值 | 是 | 是否强制严格参数验证。默认为 `true` |
| description | 字符串 | 否 | 函数的描述。模型用它来确定是否调用函数 |

##### 网络搜索工具 (Web search preview)

**类型**: 对象

此工具搜索网络上的相关结果，用于响应。

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| type | 字符串 | 是 | 网络搜索工具的类型。可选值: `web_search_preview` 或 `web_search_preview_2025_03_11` |
| search_context_size | 字符串 | 否 | 对用于搜索的上下文窗口空间量的高级指导。可选值: `low`, `medium`, `high`。默认为 `medium` |
| user_location | 对象 | 否 | 用户的位置 |
| domains | 数组 | 否 | 限制搜索的域名列表 |

###### 用户位置

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| type | 字符串 | 是 | 位置近似类型。始终为 `approximate` |
| city | 字符串 | 否 | 用户所在城市的自由文本输入，例如 "San Francisco" |
| country | 字符串 | 否 | 用户的两字母ISO国家代码，例如 "US" |
| region | 字符串 | 否 | 用户所在区域的自由文本输入，例如 "California" |
| timezone | 字符串 | 否 | 用户的IANA时区，例如 "America/Los_Angeles" |

##### 计算机使用工具 (Computer use preview)

**类型**: 对象

控制虚拟计算机的工具。

| 属性 | 类型 | 必需 | 描述 |
|------|------|------|------|
| type | 字符串 | 是 | 计算机使用工具的类型。始终为 `computer_use_preview` |
| display_height | 整数 | 是 | 计算机显示器的高度 |
| display_width | 整数 | 是 | 计算机显示器的宽度 |
| environment | 字符串 | 是 | 要控制的计算机环境类型 |

#### top_p

**类型**: 数字或null  
**必需**: 否  
**默认值**: 1

一种替代采样温度的方法，称为核采样，其中模型考虑具有 top_p 概率质量的标记结果。因此，0.1 意味着只考虑包含前 10% 概率质量的标记。

我们通常建议更改此值或 `temperature`，但不要同时更改。

#### truncation

**类型**: 字符串或null  
**必需**: 否  
**默认值**: disabled

用于模型响应的截断策略：

| 值 | 描述 |
|------|------|
| `auto` | 如果此响应和前一个响应的上下文超过模型的上下文窗口大小，模型将通过删除对话中间的输入项来截断响应以适应上下文窗口 |
| `disabled` | 如果模型响应将超过模型的上下文窗口大小，请求将失败并显示400错误 |

#### user

**类型**: 字符串  
**必需**: 否

表示最终用户的唯一标识符，可以帮助OpenAI监控和检测滥用行为。

## 📥 响应

返回一个响应对象。

### 成功响应

返回一个响应对象，如果请求被流式传输，则返回响应对象的流式序列。

#### id 
- 类型：字符串
- 说明：响应的唯一标识符

#### object
- 类型：字符串  
- 说明：对象类型,值为 "response"

#### created_at
- 类型：整数
- 说明：响应创建时间戳

#### status
- 类型：字符串
- 说明：响应状态，如 "completed"、"in_progress" 等

#### error
- 类型：对象或null
- 说明：如果发生错误，包含错误信息

#### incomplete_details
- 类型：对象或null
- 说明：如果响应不完整，包含详细信息

#### instructions
- 类型：字符串或null
- 说明：提供给模型的系统指令

#### max_output_tokens
- 类型：整数或null
- 说明：最大输出标记数

#### model
- 类型：字符串
- 说明：使用的模型名称

#### output
- 类型：数组
- 说明：包含生成的回复和工具调用
- 可能包含:
  - 消息对象（`type`: "message"）
  - 工具使用对象（`type`: "tool_use"）

#### parallel_tool_calls
- 类型：布尔值
- 说明：是否启用并行工具调用

#### previous_response_id
- 类型：字符串或null
- 说明：前一个响应的ID（用于多轮对话）

#### reasoning
- 类型：对象
- 说明：推理相关信息

#### store
- 类型：布尔值
- 说明：是否存储此响应

#### temperature
- 类型：数字
- 说明：使用的采样温度

#### text
- 类型：对象
- 说明：文本输出格式配置

#### tool_choice
- 类型：字符串
- 说明：工具选择策略

#### tools
- 类型：数组
- 说明：可用工具列表

#### top_p
- 类型：数字
- 说明：核采样阈值

#### truncation
- 类型：字符串
- 说明：截断策略

#### usage
- 类型：对象
- 说明：token 使用统计
- 属性:
  - `input_tokens`: 输入使用的 token 数
  - `input_tokens_details`: 输入token详细信息
  - `output_tokens`: 输出使用的 token 数
  - `output_tokens_details`: 输出token详细信息
  - `total_tokens`: 总 token 数

#### user
- 类型：字符串或null
- 说明：用户标识符

#### metadata
- 类型：对象
- 说明：附加的元数据信息 