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
    // 对基于文本的内容进行更健壮的检查
    return mimeType.value.startsWith('text/') 
      || mimeType.value.includes('json') 
      || mimeType.value.includes('xml')
      || mimeType.value.includes('javascript')
      || mimeType.value.includes('typescript')
      || mimeType.value.includes('x-vue')
      || mimeType.value.includes('x-yaml');
  });

  const isMarkdown = computed(() => mimeType.value === 'text/markdown');

  const isHtml = computed(() => mimeType.value === 'text/html');

  /**
   * 检查 HTML 内容是否可能是一个简单的、可渲染的 HTML 文件，
   * 而不是需要编译的 Vue 组件或其他模板。
   */
  const isRenderableHtml = computed(() => {
    if (!isHtml.value || !decodedContent.value) {
      return false;
    }
    // 使用更保守的正则表达式来检测明确的、需要编译的模板语法。
    // 这避免了因规则过于宽泛而导致对纯 HTML（如生成的报告）的错误拦截。
    const nonRenderablePattern = new RegExp(
      [
        '<script\\s+setup', // 明确的 Vue 3 <script setup>
        '\\s(v-[\\w-]+|@[\\w-]+)=', // 明确的 Vue 指令 (v-if, @click)，确保是作为属性
        '\\{\\{', // Vue 插值语法的起始部分
        '<script[^>]*src\\s*=\\s*["\'][^"\']+\\.tsx?', // 加载 TypeScript 的脚本
      ].join('|')
    );
    return !nonRenderablePattern.test(decodedContent.value);
  });

  async function loadDocument() {
    isLoading.value = true;
    error.value = null;
    rawContent.value = null;
    decodedContent.value = null;
    mimeType.value = null;
    language.value = null;

    try {
      const hint = options.fileTypeHint || options.fileName;
      let buffer: Uint8Array | null = null;

      if (typeof options.content === 'string') {
        // 如果内容是字符串，直接使用，并编码以获取原始数据和MIME类型
        decodedContent.value = options.content;
        buffer = new TextEncoder().encode(options.content);
        rawContent.value = buffer;
        
        mimeType.value = await detectMimeTypeFromBuffer(buffer, hint);
        language.value = mapMimeToLanguage(mimeType.value) || 'plaintext';
        
        if (buffer.length === 0) {
          error.value = null;
          return;
        }

      } else if (options.content instanceof Uint8Array) {
        // 如果内容是二进制数组
        buffer = options.content;
      } else if (options.filePath) {
        // 如果提供了文件路径
        const arrayBuffer = await getAssetBinary(options.filePath);
        buffer = new Uint8Array(arrayBuffer);
      }

      if (!buffer) {
        // 检查是否在字符串路径中已处理
        if (typeof options.content !== 'string') {
          decodedContent.value = '';
        }
        return;
      }
      
      rawContent.value = buffer;

      // 优雅地处理空文件
      if (buffer.length === 0) {
        mimeType.value = 'text/plain';
        language.value = 'plaintext';
        decodedContent.value = '';
        error.value = null;
        return;
      }
      
      let detectedMime: string;
      // 优先基于文件扩展名判断 Markdown，避免内容嗅探误判
      if (options.fileName?.toLowerCase().endsWith('.md') || options.fileName?.toLowerCase().endsWith('.markdown')) {
        detectedMime = 'text/markdown';
        logger.debug(`[DocumentViewer] Forced markdown mode for file: ${options.fileName}`);
      } else {
        detectedMime = await detectMimeTypeFromBuffer(buffer, hint);
      }
      mimeType.value = detectedMime;
      
      const detectedLanguage = mapMimeToLanguage(detectedMime) || 'plaintext';
      language.value = detectedLanguage;

      logger.debug(`[DocumentViewer] Mime: ${detectedMime}, Lang: ${detectedLanguage}, Hint: ${hint}`);
      
      // 只有在 decodedContent 尚未被设置时才解码
      if (decodedContent.value === null && (isTextContent.value || detectedMime === 'application/octet-stream')) {
        try {
          decodedContent.value = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        } catch (e) {
          logger.warn('UTF-8 decoding failed, falling back to lenient decoder.');
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
    isHtml,
    isRenderableHtml,
    loadDocument,
  };
}