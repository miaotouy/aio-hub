/**
 * Server-Sent Events (SSE) 解析器
 * 用于移动端流式响应处理
 */

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

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      
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
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

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
 * 移动端版本：逻辑与桌面端对齐，但作为全局工具提供
 */
export function extractTextFromSSE(data: string, providerType: string): string | null {
  try {
    const json = JSON.parse(data);

    switch (providerType) {
      case 'openai':
      case 'deepseek':
      case 'oneapi':
        return json.choices?.[0]?.delta?.content || null;

      case 'gemini':
      case 'vertexai':
        return json.candidates?.[0]?.content?.parts?.[0]?.text || null;

      case 'claude':
        if (json.type === 'content_block_delta') {
          return json.delta?.text || null;
        }
        return null;

      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * 从 SSE 数据中提取推理内容
 */
export function extractReasoningFromSSE(data: string, providerType: string): string | null {
  try {
    const json = JSON.parse(data);

    switch (providerType) {
      case 'openai':
      case 'deepseek':
        return (
          json.choices?.[0]?.delta?.reasoning_content ||
          json.choices?.[0]?.delta?.reasoning ||
          json.choices?.[0]?.delta?.thinking ||
          json.choices?.[0]?.delta?.thought ||
          null
        );

      default:
        return null;
    }
  } catch {
    return null;
  }
}