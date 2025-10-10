/**
 * 通用 LLM 请求中间件
 * 支持文本和视觉模型的统一调用
 */

import type { LlmProfile } from '../types/llm-profiles';
import { useLlmProfiles } from './useLlmProfiles';

/**
 * LLM 请求的消息内容
 */
export interface LlmMessageContent {
  type: 'text' | 'image';
  text?: string;
  imageBase64?: string;
}

/**
 * LLM 请求参数
 */
export interface LlmRequestOptions {
  profileId: string;
  modelId: string;
  messages: LlmMessageContent[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * LLM 响应结果
 */
export interface LlmResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export function useLlmRequest() {
  const { getProfileById } = useLlmProfiles();

  /**
   * 发送 LLM 请求
   */
  const sendRequest = async (options: LlmRequestOptions): Promise<LlmResponse> => {
    // 获取配置
    const profile = getProfileById(options.profileId);
    if (!profile) {
      throw new Error(`未找到配置 ID: ${options.profileId}`);
    }

    // 检查配置是否启用
    if (!profile.enabled) {
      throw new Error(`配置 "${profile.name}" 未启用`);
    }

    // 验证模型
    const model = profile.models.find(m => m.id === options.modelId);
    if (!model) {
      throw new Error(`未找到模型 ID: ${options.modelId}`);
    }

    // 根据提供商类型调用对应的 API
    switch (profile.type) {
      case 'openai':
        return await callOpenAiCompatibleApi(profile, options);
      case 'gemini':
        return await callGeminiApi(profile, options);
      case 'claude':
        return await callClaudeApi(profile, options);
      default:
        throw new Error(`不支持的提供商类型: ${profile.type}`);
    }
  };

  /**
   * 调用 OpenAI 兼容格式的 API
   */
  const callOpenAiCompatibleApi = async (
    profile: LlmProfile,
    options: LlmRequestOptions
  ): Promise<LlmResponse> => {
    const url = `${profile.baseUrl}/v1/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (profile.apiKey) {
      headers['Authorization'] = `Bearer ${profile.apiKey}`;
    }

    // 构建消息内容
    const messageContent: any[] = [];
    for (const msg of options.messages) {
      if (msg.type === 'text' && msg.text) {
        messageContent.push({ type: 'text', text: msg.text });
      } else if (msg.type === 'image' && msg.imageBase64) {
        messageContent.push({
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${msg.imageBase64}`
          }
        });
      }
    }

    const messages: any[] = [];
    
    // 添加系统提示（如果有）
    if (options.systemPrompt) {
      messages.push({
        role: 'system',
        content: options.systemPrompt
      });
    }

    // 添加用户消息
    messages.push({
      role: 'user',
      content: messageContent
    });

    const body = {
      model: options.modelId,
      messages,
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature ?? 0.5
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices[0].message.content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined
    };
  };

  /**
   * 调用 Google Gemini API
   */
  const callGeminiApi = async (
    profile: LlmProfile,
    options: LlmRequestOptions
  ): Promise<LlmResponse> => {
    const url = `${profile.baseUrl}/v1beta/models/${options.modelId}:generateContent?key=${profile.apiKey}`;

    // 构建 parts
    const parts: any[] = [];
    for (const msg of options.messages) {
      if (msg.type === 'text' && msg.text) {
        parts.push({ text: msg.text });
      } else if (msg.type === 'image' && msg.imageBase64) {
        parts.push({
          inline_data: {
            mime_type: 'image/png',
            data: msg.imageBase64
          }
        });
      }
    }

    const body: any = {
      contents: [
        {
          parts
        }
      ],
      generationConfig: {
        maxOutputTokens: options.maxTokens || 4000,
        temperature: options.temperature ?? 0.5
      }
    };

    // Gemini 使用 systemInstruction 而不是 system message
    if (options.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: options.systemPrompt }]
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    return {
      content: data.candidates[0].content.parts[0].text,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount
      } : undefined
    };
  };

  /**
   * 调用 Anthropic Claude API
   */
  const callClaudeApi = async (
    profile: LlmProfile,
    options: LlmRequestOptions
  ): Promise<LlmResponse> => {
    const url = `${profile.baseUrl}/v1/messages`;

    // 构建消息内容
    const content: any[] = [];
    for (const msg of options.messages) {
      if (msg.type === 'text' && msg.text) {
        content.push({
          type: 'text',
          text: msg.text
        });
      } else if (msg.type === 'image' && msg.imageBase64) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: msg.imageBase64
          }
        });
      }
    }

    const body: any = {
      model: options.modelId,
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature ?? 0.5,
      messages: [
        {
          role: 'user',
          content
        }
      ]
    };

    // Claude 使用 system 参数
    if (options.systemPrompt) {
      body.system = options.systemPrompt;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': profile.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    return {
      content: data.content[0].text,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
      } : undefined
    };
  };

  return {
    sendRequest
  };
}