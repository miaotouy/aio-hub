import { ref, watch, computed } from 'vue';
import { useAssetManager } from '@/composables/useAssetManager';
import { detectMimeTypeFromBuffer } from '@/utils/fileTypeDetector';
import { mapMimeToLanguage } from '@/utils/mimeToLanguage';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('useDocumentViewer');

export interface UseDocumentViewerOptions {
  content?: string | Uint8Array;
  filePath?: string;
  fileName?: string;
  fileTypeHint?: string;
}

export function useDocumentViewer(options: UseDocumentViewerOptions) {
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const rawContent = ref<Uint8Array | null>(null);
  const decodedContent = ref<string | null>(null);
  const mimeType = ref<string | null>(null);
  const language = ref<string | null>(null);

  const { getAssetBinary } = useAssetManager();

  const isTextContent = computed(() => {
    if (!mimeType.value) return false;
    // A more robust check for text-based content
    return mimeType.value.startsWith('text/') 
      || mimeType.value.includes('json') 
      || mimeType.value.includes('xml')
      || mimeType.value.includes('javascript')
      || mimeType.value.includes('typescript')
      || mimeType.value.includes('x-vue')
      || mimeType.value.includes('x-yaml');
  });

  const isMarkdown = computed(() => mimeType.value === 'text/markdown');

  async function loadDocument() {
    isLoading.value = true;
    error.value = null;
    rawContent.value = null;
    decodedContent.value = null;
    mimeType.value = null;
    language.value = null;

    try {
      let buffer: Uint8Array | null = null;
      const hint = options.fileTypeHint || options.fileName;

      if (options.content) {
        if (typeof options.content === 'string') {
          buffer = new TextEncoder().encode(options.content);
        } else {
          buffer = options.content;
        }
      } else if (options.filePath) {
        const arrayBuffer = await getAssetBinary(options.filePath);
        buffer = new Uint8Array(arrayBuffer);
      }

      if (!buffer) {
        return;
      }
      
      rawContent.value = buffer;

      // 优雅地处理空文件
      if (buffer.length === 0) {
        mimeType.value = 'text/plain';
        language.value = 'plaintext';
        decodedContent.value = '';
        error.value = null; // 确保清空之前的错误状态
        return;
      }

      const detectedMime = await detectMimeTypeFromBuffer(buffer, hint);
      mimeType.value = detectedMime;

      language.value = mapMimeToLanguage(detectedMime) || 'plaintext';
      
      // 即使被识别为二进制流，如果它是文本类型，也应该尝试解码
      if (isTextContent.value || detectedMime === 'application/octet-stream') {
        try {
          // Use TextDecoder with fatal: true to strictly check for UTF-8
          decodedContent.value = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        } catch (e) {
          console.warn('UTF-8 decoding failed, falling back to lenient decoder.');
          // Fallback for non-UTF8 text files
          decodedContent.value = new TextDecoder().decode(buffer);
        }
      }
    } catch (e: any) {
      logger.debug('[DocumentViewer]Error details:', {
        type: typeof e,
        isError: e instanceof Error,
        raw: e,
      });
      // --- 错误信息提取 ---
      let errorMessage: string;
      if (e instanceof Error) {
        // 对于标准的 Error 对象，优先使用 message
        // 对于 EndOfStreamError 这类自定义错误，e.message 可能是 "End-Of-Stream"，这是有用的信息
        errorMessage = e.message || '发生未知错误。';
      } else if (typeof e === 'string' && e) {
        errorMessage = e;
      } else if (e && typeof e === 'object' && 'message' in e) {
        // 捕获一些非标准 Error 对象，但包含 message 属性的情况
        errorMessage = String(e.message);
      } else {
        // 对于其他未知类型，尝试转换为字符串
        const rawString = String(e);
        // 避免显示无意义的 "[object Object]"
        errorMessage = rawString === '[object Object]' ? '发生未知错误。' : rawString;
      }

      // 避免显示空的 "{}", "[]" 或 "null"
      if (!errorMessage || ['{}', '[]', 'null'].includes(errorMessage.trim())) {
        errorMessage = '发生未知错误。';
      }

      error.value = errorMessage;
      logger.error(`[DocumentViewer]加载文档失败:`, e);
    } finally {
      isLoading.value = false;
    }
  }

  watch(
    () => [options.content, options.filePath],
    loadDocument,
    { immediate: true, deep: true }
  );

  return {
    isLoading,
    error,
    rawContent,
    decodedContent,
    mimeType,
    language,
    isTextContent,
    isMarkdown,
    loadDocument,
  };
}