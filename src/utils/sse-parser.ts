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
 * @param signal AbortSignal 用于取消流读取
 */
export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (chunk: string) => void,
  onError?: (error: Error) => void,
  signal?: AbortSignal
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  let _chunkCount = 0;
  let _crlfDetected = false;

  try {
    while (true) {
      // 检查是否被中止
      if (signal?.aborted) {
        await reader.cancel();
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      _chunkCount++;
      // 解码新数据并添加到缓冲区
      const decoded = decoder.decode(value, { stream: true });

      // 诊断：检测 \r\n 行分隔符（只在前几个 chunk 检测，避免性能影响）
      if (_chunkCount <= 3 && !_crlfDetected && decoded.includes('\r\n')) {
        _crlfDetected = true;
        console.warn('[SSE-Debug] 检测到 \\r\\n 行分隔符！服务器使用 CRLF，可能导致解析异常。chunk #' + _chunkCount);
      }
      if (_chunkCount === 1) {
        console.log(`[SSE-Debug] 首个 chunk 大小: ${decoded.length} chars, 前100字符: ${JSON.stringify(decoded.slice(0, 100))}`);
      }

      buffer += decoded;

      // 按行分割（同时兼容 \r\n 和 \n）
      const lines = buffer.split('\n');
      
      // 保留最后一个不完整的行
      buffer = lines.pop() || '';

      // 处理完整的行
      for (const line of lines) {
        // 去除可能的 \r（兼容 CRLF）
        const trimmedLine = line.endsWith('\r') ? line.slice(0, -1) : line;
        if (trimmedLine.startsWith('data: ')) {
          const data = trimmedLine.slice(6);
          
          // 跳过 [DONE] 标记
          if (data === '[DONE]') {
            continue;
          }

          onChunk(data);
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
        // Cohere V1 格式: text
        if (json.text) return json.text;
        // Cohere V2 格式: delta.message.content.text
        if (json.type === 'content-delta' && json.delta?.message?.content?.type === 'text') {
          return json.delta.message.content.text;
        }
        return null;

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
        // 兼容其他可能的格式: reasoning, thinking, thought
        return (
          json.choices?.[0]?.delta?.reasoning_content ||
          json.choices?.[0]?.delta?.reasoning ||
          json.choices?.[0]?.delta?.thinking ||
          json.choices?.[0]?.delta?.thought ||
          null
        );

      case 'cohere':
        // Cohere V2 格式: delta.message.content.thinking
        if (json.type === 'content-delta' && json.delta?.message?.content?.type === 'thinking') {
          return json.delta.message.content.thinking;
        }
        return null;

      default:
        return null;
    }
  } catch {
    return null;
  }
}