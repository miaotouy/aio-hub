// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * API 预设数据
 */

import type { ApiPreset, Variable } from "../types";

type OpenAiCompatiblePresetOptions = {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  apiVersion: string;
  model: string;
  apiKeyDescription?: string;
  headers?: Record<string, string>;
  variables?: Variable[];
};

function jsonBody(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function jsonHeaders(
  headers: Record<string, string> = {}
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...headers,
  };
}

function protocolVariable(value = "https"): Variable {
  return {
    key: "protocol",
    value,
    type: "enum",
    label: "协议",
    options: ["https", "http"],
    required: true,
    description: "请求协议",
  };
}

function baseUrlVariable(value: string, placeholder?: string): Variable {
  return {
    key: "baseUrl",
    value,
    type: "string",
    label: "Base URL",
    placeholder: placeholder || `例如: ${value}`,
    required: true,
    description: "API 基础 URL，不包含协议",
  };
}

function apiVersionVariable(value: string): Variable {
  return {
    key: "apiVersion",
    value,
    type: "string",
    label: "API 版本/路径",
    placeholder: "例如: v1、api/v1、compatible-mode/v1",
    required: true,
    description: "URL 中位于 Base URL 之后的版本或路径前缀",
  };
}

function apiKeyVariable(description = "用于授权的 API 密钥"): Variable {
  return {
    key: "apiKey",
    value: "",
    type: "string",
    label: "API Key",
    placeholder: "输入你的 API Key",
    required: true,
    description,
  };
}

function modelVariable(value: string, placeholder?: string): Variable {
  return {
    key: "model",
    value,
    type: "string",
    label: "模型",
    placeholder: placeholder || `例如: ${value}`,
    required: true,
    description: "模型 ID，可按服务商文档替换",
  };
}

function userMessageVariable(value = "Hello, how are you?"): Variable {
  return {
    key: "userMessage",
    value,
    type: "string",
    label: "用户消息",
    placeholder: "输入要发送的消息",
    required: true,
    description: "发送给 AI 的消息内容",
  };
}

function inputTextVariable(value = "Hello world"): Variable {
  return {
    key: "inputText",
    value,
    type: "string",
    label: "输入文本",
    placeholder: "输入要处理的文本",
    required: true,
    description: "发送给接口处理的文本内容",
  };
}

function temperatureVariable(value = "1", placeholder = "0.0 - 2.0"): Variable {
  return {
    key: "temperature",
    value,
    type: "string",
    label: "Temperature",
    placeholder,
    description: "控制输出的随机性",
  };
}

function maxTokensVariable(
  key = "maxTokens",
  label = "Max Tokens",
  value = "2000"
): Variable {
  return {
    key,
    value,
    type: "string",
    label,
    placeholder: "最大生成 token 数",
    description: "最大生成的 token 数量",
  };
}

function streamVariable(): Variable {
  return {
    key: "stream",
    value: false,
    type: "boolean",
    label: "流式输出",
    description: "是否使用流式响应",
  };
}

function openAiChatBody(): string {
  return jsonBody({
    model: "{{model}}",
    messages: [
      {
        role: "user",
        content: "{{userMessage}}",
      },
    ],
    temperature: "{{temperature}}",
    max_tokens: "{{maxTokens}}",
    stream: "{{stream}}",
  });
}

function openAiChatVariables(options: {
  protocol?: string;
  baseUrl: string;
  apiVersion: string;
  model: string;
  apiKeyDescription?: string;
}): Variable[] {
  return [
    protocolVariable(options.protocol),
    baseUrlVariable(options.baseUrl),
    apiVersionVariable(options.apiVersion),
    apiKeyVariable(options.apiKeyDescription),
    modelVariable(options.model),
    userMessageVariable(),
    temperatureVariable(),
    maxTokensVariable(),
    streamVariable(),
  ];
}

function openAiCompatiblePreset(
  options: OpenAiCompatiblePresetOptions
): ApiPreset {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    urlTemplate: "{{protocol}}://{{baseUrl}}/{{apiVersion}}/chat/completions",
    method: "POST",
    headers: jsonHeaders({
      Authorization: "Bearer {{apiKey}}",
      ...options.headers,
    }),
    bodyTemplate: openAiChatBody(),
    variables: [
      ...openAiChatVariables({
        baseUrl: options.baseUrl,
        apiVersion: options.apiVersion,
        model: options.model,
        apiKeyDescription: options.apiKeyDescription,
      }),
      ...(options.variables || []),
    ],
  };
}

export const presets: ApiPreset[] = [
  {
    id: "custom-request",
    name: "空白请求",
    description: "从头开始构建一个自定义 API 请求",
    urlTemplate: "",
    method: "GET",
    headers: jsonHeaders(),
    bodyTemplate: jsonBody({}),
    variables: [],
  },
  {
    id: "rest-json-get",
    name: "REST JSON GET",
    description: "通用 REST JSON 查询请求示例",
    urlTemplate:
      "{{protocol}}://{{baseUrl}}/{{resource}}/{{resourceId}}{{queryString}}",
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    variables: [
      protocolVariable(),
      baseUrlVariable("jsonplaceholder.typicode.com"),
      {
        key: "resource",
        value: "posts",
        type: "string",
        label: "资源路径",
        placeholder: "例如: posts、users、todos",
        required: true,
        description: "REST 资源路径",
      },
      {
        key: "resourceId",
        value: "1",
        type: "string",
        label: "资源 ID",
        placeholder: "例如: 1",
        required: true,
        description: "资源 ID 或子路径",
      },
      {
        key: "queryString",
        value: "",
        type: "string",
        label: "查询参数",
        placeholder: "例如: ?page=1&limit=20",
        description: "可选查询字符串，包含开头的 ?",
      },
    ],
  },
  {
    id: "rest-json-post",
    name: "REST JSON POST",
    description: "通用 REST JSON 创建/提交请求示例",
    urlTemplate: "{{protocol}}://{{baseUrl}}/{{resource}}",
    method: "POST",
    headers: jsonHeaders(),
    bodyTemplate: jsonBody({
      title: "{{title}}",
      body: "{{content}}",
      userId: "{{userId}}",
    }),
    variables: [
      protocolVariable(),
      baseUrlVariable("jsonplaceholder.typicode.com"),
      {
        key: "resource",
        value: "posts",
        type: "string",
        label: "资源路径",
        required: true,
        description: "REST 资源路径",
      },
      {
        key: "title",
        value: "API Tester",
        type: "string",
        label: "标题",
        required: true,
        description: "示例标题字段",
      },
      {
        key: "content",
        value: "Hello from AIO Hub",
        type: "string",
        label: "内容",
        required: true,
        description: "示例正文内容",
      },
      {
        key: "userId",
        value: "1",
        type: "string",
        label: "用户 ID",
        required: true,
        description: "示例用户 ID，会保留为数字类型",
      },
    ],
  },
  {
    id: "graphql-request",
    name: "GraphQL Query",
    description: "通用 GraphQL 查询请求",
    urlTemplate: "{{protocol}}://{{baseUrl}}/{{endpoint}}",
    method: "POST",
    headers: jsonHeaders(),
    bodyTemplate: jsonBody({
      query: "{{query}}",
      variables: {},
    }),
    variables: [
      protocolVariable(),
      baseUrlVariable("api.example.com"),
      {
        key: "endpoint",
        value: "graphql",
        type: "string",
        label: "端点",
        required: true,
        description: "GraphQL 端点路径",
      },
      {
        key: "query",
        value: "query Health { __typename }",
        type: "string",
        label: "GraphQL Query",
        required: true,
        description: "GraphQL 查询语句",
      },
    ],
  },
  {
    id: "webhook-json",
    name: "Webhook JSON POST",
    description: "通用 Webhook JSON 推送请求",
    urlTemplate: "{{webhookUrl}}",
    method: "POST",
    headers: jsonHeaders(),
    bodyTemplate: jsonBody({
      event: "{{event}}",
      message: "{{message}}",
      timestamp: "{{timestamp}}",
    }),
    variables: [
      {
        key: "webhookUrl",
        value: "https://example.com/webhook",
        type: "string",
        label: "Webhook URL",
        placeholder: "输入完整 Webhook URL",
        required: true,
        description: "完整 Webhook 地址",
      },
      {
        key: "event",
        value: "test.created",
        type: "string",
        label: "事件名",
        required: true,
        description: "事件类型",
      },
      {
        key: "message",
        value: "Hello from AIO Hub",
        type: "string",
        label: "消息",
        required: true,
        description: "发送到 Webhook 的消息",
      },
      {
        key: "timestamp",
        value: "2026-01-01T00:00:00.000Z",
        type: "string",
        label: "时间戳",
        description: "示例时间戳，可按需替换",
      },
    ],
  },
  {
    id: "openai-chat",
    name: "OpenAI Chat Completion",
    description: "OpenAI 和兼容接口（如 DeepSeek、智谱等）的聊天补全 API",
    urlTemplate: "{{protocol}}://{{baseUrl}}/{{apiVersion}}/chat/completions",
    method: "POST",
    headers: jsonHeaders(),
    bodyTemplate: openAiChatBody(),
    variables: openAiChatVariables({
      baseUrl: "api.openai.com",
      apiVersion: "v1",
      model: "gpt-4o",
    }),
  },
  {
    id: "openai-responses",
    name: "OpenAI Responses API",
    description: "OpenAI Responses API，适合测试新一代统一响应接口",
    urlTemplate: "{{protocol}}://{{baseUrl}}/{{apiVersion}}/responses",
    method: "POST",
    headers: jsonHeaders(),
    bodyTemplate: jsonBody({
      model: "{{model}}",
      input: "{{userMessage}}",
      temperature: "{{temperature}}",
      max_output_tokens: "{{maxOutputTokens}}",
      stream: "{{stream}}",
    }),
    variables: [
      protocolVariable(),
      baseUrlVariable("api.openai.com"),
      apiVersionVariable("v1"),
      apiKeyVariable(),
      modelVariable("gpt-4o"),
      userMessageVariable(),
      temperatureVariable(),
      maxTokensVariable("maxOutputTokens", "Max Output Tokens", "2000"),
      streamVariable(),
    ],
  },
  {
    id: "openai-embeddings",
    name: "OpenAI Embeddings",
    description: "OpenAI 文本向量化接口",
    urlTemplate: "{{protocol}}://{{baseUrl}}/{{apiVersion}}/embeddings",
    method: "POST",
    headers: jsonHeaders(),
    bodyTemplate: jsonBody({
      model: "{{model}}",
      input: "{{inputText}}",
      encoding_format: "{{encodingFormat}}",
    }),
    variables: [
      protocolVariable(),
      baseUrlVariable("api.openai.com"),
      apiVersionVariable("v1"),
      apiKeyVariable(),
      modelVariable("text-embedding-3-small"),
      inputTextVariable("AIO Hub makes API testing easier."),
      {
        key: "encodingFormat",
        value: "float",
        type: "enum",
        label: "编码格式",
        options: ["float", "base64"],
        description: "向量返回格式",
      },
    ],
  },
  openAiCompatiblePreset({
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    description: "DeepSeek OpenAI 兼容聊天接口",
    baseUrl: "api.deepseek.com",
    apiVersion: "v1",
    model: "deepseek-chat",
    apiKeyDescription: "DeepSeek API 密钥",
  }),
  openAiCompatiblePreset({
    id: "dashscope-compatible-chat",
    name: "阿里云 DashScope 兼容模式",
    description: "通义千问 DashScope OpenAI 兼容聊天接口",
    baseUrl: "dashscope.aliyuncs.com",
    apiVersion: "compatible-mode/v1",
    model: "qwen-plus",
    apiKeyDescription: "DashScope API Key",
  }),
  openAiCompatiblePreset({
    id: "moonshot-chat",
    name: "Moonshot Kimi Chat",
    description: "月之暗面 Kimi OpenAI 兼容聊天接口",
    baseUrl: "api.moonshot.cn",
    apiVersion: "v1",
    model: "moonshot-v1-8k",
    apiKeyDescription: "Moonshot API Key",
  }),
  openAiCompatiblePreset({
    id: "zhipu-chat",
    name: "智谱 GLM Chat",
    description: "智谱 GLM OpenAI 兼容聊天接口",
    baseUrl: "open.bigmodel.cn",
    apiVersion: "api/paas/v4",
    model: "glm-4-plus",
    apiKeyDescription: "智谱 API Key",
  }),
  openAiCompatiblePreset({
    id: "openrouter-chat",
    name: "OpenRouter Chat",
    description: "OpenRouter OpenAI 兼容聊天接口",
    baseUrl: "openrouter.ai",
    apiVersion: "api/v1",
    model: "openai/gpt-4o-mini",
    apiKeyDescription: "OpenRouter API Key",
    headers: {
      "HTTP-Referer": "{{referer}}",
      "X-Title": "{{appTitle}}",
    },
    variables: [
      {
        key: "referer",
        value: "https://aio-hub.local",
        type: "string",
        label: "Referer",
        description: "OpenRouter 可选来源标识",
      },
      {
        key: "appTitle",
        value: "AIO Hub",
        type: "string",
        label: "应用名称",
        description: "OpenRouter 可选应用名称",
      },
    ],
  }),
  openAiCompatiblePreset({
    id: "groq-chat",
    name: "Groq Chat",
    description: "Groq OpenAI 兼容高速推理接口",
    baseUrl: "api.groq.com",
    apiVersion: "openai/v1",
    model: "llama-3.3-70b-versatile",
    apiKeyDescription: "Groq API Key",
  }),
  openAiCompatiblePreset({
    id: "xai-chat",
    name: "xAI Grok Chat",
    description: "xAI Grok OpenAI 兼容聊天接口",
    baseUrl: "api.x.ai",
    apiVersion: "v1",
    model: "grok-2-latest",
    apiKeyDescription: "xAI API Key",
  }),
  {
    ...openAiCompatiblePreset({
      id: "ollama-chat",
      name: "Ollama Chat Completions",
      description: "本地 Ollama OpenAI 兼容聊天接口",
      baseUrl: "localhost:11434",
      apiVersion: "v1",
      model: "llama3.1",
    }),
    headers: jsonHeaders(),
    variables: [
      protocolVariable("http"),
      baseUrlVariable("localhost:11434"),
      apiVersionVariable("v1"),
      modelVariable("llama3.1"),
      userMessageVariable(),
      temperatureVariable(),
      maxTokensVariable(),
      streamVariable(),
    ],
  },
  {
    ...openAiCompatiblePreset({
      id: "lmstudio-chat",
      name: "LM Studio Chat Completions",
      description: "本地 LM Studio OpenAI 兼容聊天接口",
      baseUrl: "localhost:1234",
      apiVersion: "v1",
      model: "local-model",
    }),
    headers: jsonHeaders(),
    variables: [
      protocolVariable("http"),
      baseUrlVariable("localhost:1234"),
      apiVersionVariable("v1"),
      modelVariable("local-model"),
      userMessageVariable(),
      temperatureVariable(),
      maxTokensVariable(),
      streamVariable(),
    ],
  },
  {
    id: "gemini-chat",
    name: "Google Gemini API",
    description:
      "Google Gemini 的生成内容 API（流式时需将端点改为 streamGenerateContent）",
    urlTemplate:
      "{{protocol}}://{{baseUrl}}/{{apiVersion}}/models/{{model}}:{{endpoint}}?key={{apiKey}}",
    method: "POST",
    headers: jsonHeaders(),
    bodyTemplate: jsonBody({
      contents: [
        {
          parts: [
            {
              text: "{{userMessage}}",
            },
          ],
        },
      ],
      generationConfig: {
        temperature: "{{temperature}}",
        maxOutputTokens: "{{maxTokens}}",
      },
    }),
    variables: [
      protocolVariable(),
      baseUrlVariable("generativelanguage.googleapis.com"),
      apiVersionVariable("v1beta"),
      apiKeyVariable("Google API 密钥"),
      {
        key: "endpoint",
        value: "generateContent",
        type: "enum",
        label: "API 端点",
        options: ["generateContent", "streamGenerateContent"],
        required: true,
        description: "API 端点类型（流式请求使用 streamGenerateContent）",
      },
      modelVariable("gemini-2.5-pro"),
      userMessageVariable(),
      temperatureVariable(),
      maxTokensVariable(),
      streamVariable(),
    ],
  },
  {
    id: "gemini-embeddings",
    name: "Google Gemini Embeddings",
    description: "Google Gemini 文本向量化接口",
    urlTemplate:
      "{{protocol}}://{{baseUrl}}/{{apiVersion}}/models/{{model}}:embedContent?key={{apiKey}}",
    method: "POST",
    headers: jsonHeaders(),
    bodyTemplate: jsonBody({
      content: {
        parts: [
          {
            text: "{{inputText}}",
          },
        ],
      },
    }),
    variables: [
      protocolVariable(),
      baseUrlVariable("generativelanguage.googleapis.com"),
      apiVersionVariable("v1beta"),
      apiKeyVariable("Google API 密钥"),
      modelVariable("text-embedding-004"),
      inputTextVariable("AIO Hub makes API testing easier."),
    ],
  },
  {
    id: "anthropic-chat",
    name: "Anthropic Claude API",
    description: "Anthropic Claude 的消息 API",
    urlTemplate: "{{protocol}}://{{baseUrl}}/{{apiVersion}}/messages",
    method: "POST",
    headers: jsonHeaders({
      "anthropic-version": "2023-06-01",
    }),
    bodyTemplate: jsonBody({
      model: "{{model}}",
      messages: [
        {
          role: "user",
          content: "{{userMessage}}",
        },
      ],
      max_tokens: "{{maxTokens}}",
      temperature: "{{temperature}}",
      stream: "{{stream}}",
    }),
    variables: [
      protocolVariable(),
      baseUrlVariable("api.anthropic.com"),
      apiVersionVariable("v1"),
      apiKeyVariable("Anthropic API 密钥"),
      modelVariable("claude-3-5-sonnet-20241022"),
      userMessageVariable(),
      temperatureVariable("0.7", "0.0 - 1.0"),
      {
        ...maxTokensVariable(),
        required: true,
      },
      streamVariable(),
    ],
  },
  {
    id: "cohere-chat",
    name: "Cohere Chat",
    description: "Cohere v2 Chat API",
    urlTemplate: "{{protocol}}://{{baseUrl}}/{{apiVersion}}/chat",
    method: "POST",
    headers: jsonHeaders({
      Authorization: "Bearer {{apiKey}}",
    }),
    bodyTemplate: jsonBody({
      model: "{{model}}",
      messages: [
        {
          role: "user",
          content: "{{userMessage}}",
        },
      ],
      temperature: "{{temperature}}",
      max_tokens: "{{maxTokens}}",
      stream: "{{stream}}",
    }),
    variables: [
      protocolVariable(),
      baseUrlVariable("api.cohere.com"),
      apiVersionVariable("v2"),
      apiKeyVariable("Cohere API Key"),
      modelVariable("command-a-03-2025"),
      userMessageVariable(),
      temperatureVariable(),
      maxTokensVariable(),
      streamVariable(),
    ],
  },
];
