import type {
  LongTextChunk,
  LongTextConfig,
  LongTextMode,
  LongTextTask,
  TranslationChannel,
  TranslationResult,
  TranslatorLanguageCode,
} from "../types";
import { recursiveSplitText } from "../core/textSplitter";
import type { TranslateChannelOptions } from "./useTranslatorCore";

const MAX_LONG_TEXT_CHARS = 1_000_000;
const MAX_RETRY_ATTEMPTS = 3;

type TranslateChannelFn = (
  text: string,
  channel: TranslationChannel,
  options: TranslateChannelOptions
) => Promise<TranslationResult>;

export interface LongTextTranslateOptions {
  text: string;
  channel: TranslationChannel;
  sourceLang: TranslatorLanguageCode;
  targetLang: TranslatorLanguageCode;
  basePrompt: string;
  chunkSize: number;
  mode: LongTextMode;
  maxConcurrentChunks: number;
  temperature: number;
  streaming: boolean;
  signal: AbortSignal;
  existingTask?: LongTextTask;
  getMaxTokens: (chunkText: string) => number;
  translateChannel: TranslateChannelFn;
  onTaskUpdate?: (task: LongTextTask) => void;
}

class ConcurrencyLimiter {
  private activeCount = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.activeCount++;
    try {
      return await fn();
    } finally {
      this.activeCount--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

function cloneTask(task: LongTextTask): LongTextTask {
  return {
    ...task,
    chunks: task.chunks.map((chunk) => ({ ...chunk })),
  };
}

function completedCount(task: LongTextTask) {
  return task.chunks.filter((chunk) => chunk.status === "completed").length;
}

function updateTaskProgress(task: LongTextTask) {
  const total = task.chunks.length || 1;
  task.progress = Math.round((completedCount(task) / total) * 100);
}

function appendStreamChunk(
  task: LongTextTask,
  chunk: LongTextChunk,
  piece: string
) {
  chunk.translatedText = `${chunk.translatedText || ""}${piece}`;
  updateTaskProgress(task);
}

export function joinTranslatedChunks(chunks: LongTextChunk[]) {
  return chunks.map((chunk) => chunk.translatedText || "").join("");
}

function renderTemplate(
  template: string,
  values: Record<string, string | undefined>
) {
  return template.replace(
    /\{(text|sourceLang|targetLang|sourceContext|translationContext)\}/g,
    (_, key: string) => values[key] || ""
  );
}

function buildLongTextPrompt(options: {
  template: string;
  chunkText: string;
  sourceLang: TranslatorLanguageCode;
  targetLang: TranslatorLanguageCode;
  previousChunk?: LongTextChunk;
}) {
  const sourceContext = options.previousChunk?.sourceText || "";
  const translationContext = options.previousChunk?.translatedText || "";
  const taskPrompt = renderTemplate(options.template, {
    text: options.chunkText,
    sourceLang: options.sourceLang,
    targetLang: options.targetLang,
    sourceContext,
    translationContext,
  });

  if (!options.previousChunk || !translationContext.trim()) {
    return [
      "你正在进行长文本分片翻译。请只翻译当前分片，保持上下文连续，不要添加解释、标题或 Markdown 标记。",
      "",
      "# 当前分片任务",
      taskPrompt,
    ].join("\n");
  }

  return [
    "你正在进行长文本分片翻译。请只翻译当前分片，并参考上一个分片的术语、人称、语气和风格。不要重复翻译上文参考，不要添加解释、标题或 Markdown 标记。",
    "",
    "# 上文参考",
    "<source_context>",
    sourceContext,
    "</source_context>",
    "<translation_context>",
    translationContext,
    "</translation_context>",
    "",
    "# 当前分片任务",
    taskPrompt,
  ].join("\n");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

function shouldRetry(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate limit|timeout|temporar|overloaded|503|502/i.test(message);
}

export function createLongTextTask(
  channel: TranslationChannel,
  chunks: string[]
): LongTextTask {
  return {
    id: channel.id,
    channelName: channel.displayName,
    status: "idle",
    progress: 0,
    chunks: chunks.map((sourceText, index) => ({
      index,
      sourceText,
      status: "waiting",
    })),
  };
}

export function toLongTextConfig(
  options: LongTextTranslateOptions
): LongTextConfig {
  return {
    sourceLang: options.sourceLang,
    targetLang: options.targetLang,
    profileId: options.channel.profileId,
    modelId: options.channel.modelId,
    chunkSize: options.chunkSize,
    mode: options.mode,
    maxConcurrentChunks: options.maxConcurrentChunks,
    temperature: options.temperature,
    promptTemplate: options.channel.prompt || options.basePrompt,
    streaming: options.streaming,
  };
}

export function useLongTextTranslator() {
  async function translateChunkWithRetry(
    task: LongTextTask,
    chunk: LongTextChunk,
    options: LongTextTranslateOptions,
    previousChunk?: LongTextChunk
  ) {
    const template = options.channel.prompt?.trim() || options.basePrompt;
    const prompt = buildLongTextPrompt({
      template,
      chunkText: chunk.sourceText,
      sourceLang: options.sourceLang,
      targetLang: options.targetLang,
      previousChunk,
    });
    const channelForChunk: TranslationChannel = {
      ...options.channel,
      prompt,
      maxTokens: options.getMaxTokens(chunk.sourceText),
    };

    let attempt = 0;
    let lastError: unknown;
    let lastStartedAt = Date.now();

    while (attempt < MAX_RETRY_ATTEMPTS) {
      if (options.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      chunk.status = "translating";
      chunk.error = undefined;
      chunk.translatedText = "";
      const startedAt = Date.now();
      lastStartedAt = startedAt;
      options.onTaskUpdate?.(cloneTask(task));

      try {
        const result = await options.translateChannel(
          chunk.sourceText,
          channelForChunk,
          {
            sourceLang: options.sourceLang,
            targetLang: options.targetLang,
            basePrompt: prompt,
            maxTokens: channelForChunk.maxTokens,
            temperature: options.temperature,
            signal: options.signal,
            onStream: options.streaming
              ? (piece) => {
                  if (options.signal.aborted) return;
                  appendStreamChunk(task, chunk, piece);
                  options.onTaskUpdate?.(cloneTask(task));
                }
              : undefined,
          }
        );

        chunk.translatedText =
          result.content.length >= (chunk.translatedText || "").length
            ? result.content
            : chunk.translatedText;
        chunk.status = "completed";
        chunk.duration = Date.now() - startedAt;
        chunk.tokenUsage = result.tokenUsage;
        updateTaskProgress(task);
        options.onTaskUpdate?.(cloneTask(task));
        return;
      } catch (error) {
        lastError = error;
        if (options.signal.aborted || isAbortError(error)) throw error;
        if (!shouldRetry(error) || attempt === MAX_RETRY_ATTEMPTS - 1) break;
        attempt++;
        await sleep(800 * 2 ** attempt, options.signal);
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    chunk.status = "failed";
    chunk.error = message;
    chunk.duration = Date.now() - lastStartedAt;
    updateTaskProgress(task);
    options.onTaskUpdate?.(cloneTask(task));
    throw new Error(message);
  }

  async function translateLongText(options: LongTextTranslateOptions) {
    if (Array.from(options.text).length > MAX_LONG_TEXT_CHARS) {
      throw new Error("长文本分片翻译单次最多支持 100 万字符");
    }

    const task = options.existingTask
      ? cloneTask(options.existingTask)
      : createLongTextTask(
          options.channel,
          recursiveSplitText(options.text, { chunkSize: options.chunkSize })
        );
    task.status = "splitting";
    task.error = undefined;
    for (const chunk of task.chunks) {
      if (chunk.status === "failed") {
        chunk.status = "waiting";
        chunk.error = undefined;
      }
    }
    options.onTaskUpdate?.(cloneTask(task));

    task.status = "translating";
    task.startedAt = Date.now();
    options.onTaskUpdate?.(cloneTask(task));

    try {
      if (options.mode === "sequential") {
        let previousCompleted: LongTextChunk | undefined;
        for (const chunk of task.chunks) {
          if (chunk.status === "completed") {
            previousCompleted = chunk;
            continue;
          }
          await translateChunkWithRetry(
            task,
            chunk,
            options,
            previousCompleted
          );
          previousCompleted = chunk;
        }
      } else {
        const limiter = new ConcurrencyLimiter(
          Math.max(1, Math.min(4, options.maxConcurrentChunks))
        );
        await Promise.all(
          task.chunks
            .filter((chunk) => chunk.status !== "completed")
            .map((chunk) =>
              limiter.run(() => translateChunkWithRetry(task, chunk, options))
            )
        );
      }

      task.status = "completed";
      task.duration = Date.now() - (task.startedAt || Date.now());
      task.progress = 100;
      options.onTaskUpdate?.(cloneTask(task));
      return task;
    } catch (error) {
      task.duration = Date.now() - (task.startedAt || Date.now());
      if (options.signal.aborted || isAbortError(error)) {
        task.status = "aborted";
      } else {
        task.status = "failed";
        task.error = error instanceof Error ? error.message : String(error);
      }
      options.onTaskUpdate?.(cloneTask(task));
      return task;
    }
  }

  return {
    translateLongText,
    toLongTextConfig,
  };
}
