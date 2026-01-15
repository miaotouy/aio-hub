import type { VisionTokenCost } from '@/types/llm-profiles';
import type { TokenCalculationResult } from '../composables/useTokenCalculator';
import CalculatorWorker from './calculator.worker?worker';

/**
 * Token 计算 Worker 代理
 * 
 * 负责与 Worker 线程通信，提供 Promise 风格的 API
 */
class TokenCalculatorProxy {
  private worker: Worker | null = null;
  private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
  private nextId = 0;

  constructor() {
    // 只有在浏览器环境下才初始化 Worker
    if (typeof window !== 'undefined') {
      this.initWorker();
    }
  }

  private initWorker() {
    try {
      // 使用 Vite 推荐的 Worker 导入方式
      // 这种方式在生产环境下会自动处理路径和 MIME 类型
      this.worker = new CalculatorWorker();

      this.worker.onmessage = (event) => {
        const { id, type, result, error } = event.data;
        const pending = this.pendingRequests.get(id);

        if (pending) {
          if (type === 'response') {
            pending.resolve(result);
          } else {
            pending.reject(new Error(error));
          }
          this.pendingRequests.delete(id);
        }
      };

      this.worker.onerror = (error) => {
        console.error('TokenCalculator Worker error:', error);
        this.handleWorkerError();
      };
    } catch (e) {
      console.error('Failed to initialize TokenCalculator Worker:', e);
    }
  }

  private handleWorkerError() {
    // 出错时通知所有待处理的请求
    this.pendingRequests.forEach((pending) => {
      pending.reject(new Error('Worker error'));
    });
    this.pendingRequests.clear();

    // 销毁旧 Worker 并尝试重启
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    // 延迟重启，避免在严重错误下陷入死循环
    setTimeout(() => {
      console.log('Attempting to restart TokenCalculator Worker...');
      this.initWorker();
    }, 1000);
  }

  private request<T>(method: string, params: any): Promise<T> {
    if (!this.worker) {
      return Promise.reject(new Error('Worker not initialized'));
    }

    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pendingRequests.set(id, { resolve, reject });
      this.worker!.postMessage({ id, method, params });
    });
  }

  async calculateTokens(text: string, modelId: string): Promise<TokenCalculationResult> {
    return this.request('calculateTokens', { text, modelId });
  }

  async calculateTokensByTokenizer(text: string, tokenizerName: string): Promise<TokenCalculationResult> {
    return this.request('calculateTokensByTokenizer', { text, tokenizerName });
  }

  async getTokenizedText(
    text: string,
    identifier: string,
    useTokenizerName: boolean = false
  ): Promise<{ tokens: string[] } | null> {
    return this.request('getTokenizedText', { text, identifier, useTokenizerName });
  }

  async calculateImageTokens(width: number, height: number, visionTokenCost: VisionTokenCost): Promise<number> {
    return this.request('calculateImageTokens', { width, height, visionTokenCost });
  }

  async calculateVideoTokens(durationSeconds: number): Promise<number> {
    return this.request('calculateVideoTokens', { durationSeconds });
  }

  async calculateAudioTokens(durationSeconds: number): Promise<number> {
    return this.request('calculateAudioTokens', { durationSeconds });
  }

  clearCache(): void {
    if (this.worker) {
      this.worker.postMessage({ method: 'clearCache' });
    }
  }
}

export const calculatorProxy = new TokenCalculatorProxy();