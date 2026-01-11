import type { Token } from "./types";

/**
 * TokenizerService
 * 封装 Tokenizer Worker 的调用，支持单例 Worker 复用。
 */

class TokenizerService {
  private worker: Worker | null = null;
  private nextId = 0;
  private callbacks = new Map<number, { resolve: (tokens: Token[]) => void; reject: (err: any) => void }>();

  private initWorker() {
    if (this.worker) return;

    // 使用 Vite 的 Worker 导入方式
    this.worker = new Worker(new URL("./tokenizer.worker.ts", import.meta.url), {
      type: "module",
    });

    this.worker.onmessage = (e: MessageEvent<any>) => {
      const { id, status, tokens, error } = e.data;
      const callback = this.callbacks.get(id);
      if (!callback) return;

      this.callbacks.delete(id);
      if (status === "success") {
        callback.resolve(tokens);
      } else {
        callback.reject(new Error(error));
      }
    };

    this.worker.onerror = (e) => {
      console.error("Tokenizer Worker Error:", e);
      // 发生错误时清空所有回调
      const error = new Error("Tokenizer Worker crashed");
      this.callbacks.forEach((cb) => cb.reject(error));
      this.callbacks.clear();
      this.worker = null; // 允许下次调用重新初始化
    };
  }

  public tokenize(text: string): Promise<Token[]> {
    this.initWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.worker!.postMessage({ text, id });
    });
  }

  /**
   * 销毁 Worker
   */
  public terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.callbacks.forEach((cb) => cb.reject(new Error("Tokenizer Worker terminated")));
      this.callbacks.clear();
    }
  }
}

export const tokenizerService = new TokenizerService();