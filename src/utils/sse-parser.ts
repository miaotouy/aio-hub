/**
 * Server-Sent Events (SSE) 解析器
 * 用于处理流式响应
 */

/**
 * SSE 事件数据
 */
export interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
}

/**
 * 解析 SSE 流
 * @param reader ReadableStreamDefaultReader
 * @param onChunk 接收到数据块时的回调
 * @param onError 发生错误时的回调
 */
export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (chunk: string) => void,
  onError?: (error: Error) => void
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      // 解码新数据并添加到缓冲区
      buffer += decoder.decode(value, { stream: true });

      // 按行分割
      const lines = buffer.split('\n');
      
      // 保留最后一个不完整的行
      buffer = lines.pop() || '';

      // 处理完整的行
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          // 跳过 [DONE] 标记
          if (data === '[DONE]') {
            continue;
          }

          // 尝试解析 JSON
          try {
            onChunk(data);
          } catch (error) {
            // 如果不是 JSON，直接传递原始数据
            onChunk(data);
          }
        }
      }
    }
  } catch (error) {
    if (onError) {
      onError(error as Error);
    } else {
      throw error;
    }
  }
}

/**
 * 从 SSE 数据中提取文本内容
 * 支持多种 Provider 的响应格式
 */
export function extractTextFromSSE(data: string, providerType: string): string | null {
  try {
    const json = JSON.parse(data);

    switch (providerType) {
      case 'openai':
        // OpenAI 格式: choices[0].delta.content
        return json.choices?.[0]?.delta?.content || null;

      case 'openai-responses':
        // OpenAI Responses API 格式: type 为 'response.output_text.delta' 时提取 delta 字段
        if (json.type === 'response.output_text.delta') {
          return json.delta || null;
        }
        return null;

      case 'gemini':
        // Gemini 格式: candidates[0].content.parts[0].text
        return json.candidates?.[0]?.content?.parts?.[0]?.text || null;

      case 'claude':
        // Claude 格式: delta.text
        if (json.type === 'content_block_delta') {
          return json.delta?.text || null;
        }
        return null;

      case 'cohere':
        // Cohere 格式: text
        return json.text || null;

      case 'huggingface':
        // Hugging Face 格式: token.text
        return json.token?.text || null;

      case 'vertexai':
        // Vertex AI 格式同 Gemini
        return json.candidates?.[0]?.content?.parts?.[0]?.text || null;

      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * 从 SSE 数据中提取推理内容（DeepSeek reasoning）
 * @param data SSE 数据字符串
 * @param providerType Provider 类型
 * @returns 推理内容或 null
 */
export function extractReasoningFromSSE(data: string, providerType: string): string | null {
  try {
    const json = JSON.parse(data);

    switch (providerType) {
      case 'openai':
        // DeepSeek reasoning 格式: choices[0].delta.reasoning_content
        return json.choices?.[0]?.delta?.reasoning_content || null;

      default:
        return null;
    }
  } catch {
    return null;
  }
}