/**
 * Token 计算 Worker 代理
 *
 * v2 协议：
 * - 创建 Worker → 等 ready → 拉取 store 快照 → 推送 init → 等 initialized → 处理请求
 * - 启动期 / 重启期：业务请求进入 startupQueue，待 initialized 后 flush
 * - Worker 请求 needProfileData → proxy 通过 tokenizerAssetService 读文件 → 推回 profileData
 * - 注册表变化（profile / rules）调用 restartWorker() 重新走 init 流程
 *
 * 详见 docs/Plan/分词器资产注册表方案.md §9
 */

import type { VisionTokenCost } from "@/types/llm-profiles";
import type { TokenCalculationResult } from "../core/tokenCalculatorEngine";
import type {
  TokenizerProfile,
  TokenizerRule,
} from "../types/tokenizer-profile";
import type { WorkerInbound, WorkerOutbound } from "./workerProtocol";
import CalculatorWorker from "./calculator.worker?worker";

/**
 * 注册表快照提供函数
 *
 * Store 模块会在自身就绪时通过 `setSnapshotProvider` 把 getter 注入进来。
 * 这是为了打破 proxy ↔ store 之间潜在的循环依赖（store 会用 calculator 服务）。
 */
type SnapshotProvider = () => {
  profiles: TokenizerProfile[];
  rules: TokenizerRule[];
};

/**
 * 按需推送 profile 的数据读取函数
 *
 * 同样由外部注入，避免在 worker 模块内直接依赖 Tauri 文件系统模块。
 */
type ProfileDataReader = (profileId: string) => Promise<{
  tokenizerJSON: string;
  tokenizerConfigJSON?: string;
}>;

class TokenCalculatorProxy {
  private worker: Worker | null = null;
  private pendingRequests = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: any) => void }
  >();
  private nextId = 0;

  /** Worker 在启动期/重启期接到的业务请求 */
  private startupQueue: Array<{
    id: number;
    method: string;
    params: unknown;
  }> = [];

  /** 当前是否处于"已 init"状态 */
  private workerReady = false;

  /** 注册表快照来源（由 store 注入） */
  private snapshotProvider: SnapshotProvider | null = null;

  /** profile 数据读取器（由 asset service 注入） */
  private profileDataReader: ProfileDataReader | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.initWorker();
    }
  }

  // =================================================================
  // 注入点
  // =================================================================

  setSnapshotProvider(provider: SnapshotProvider): void {
    this.snapshotProvider = provider;
    // 如果 worker 在等 init（snapshot 之前还拿不到），现在补一次
    if (this.worker && !this.workerReady) {
      this.tryPushInit();
    }
  }

  setProfileDataReader(reader: ProfileDataReader): void {
    this.profileDataReader = reader;
  }

  /**
   * 注册表数据变化（profile / rules 改动），重启 Worker
   */
  async restartWorker(): Promise<void> {
    // 把 in-flight 请求标记为失败前，先尝试给一个友好提示
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error("Worker is restarting due to registry change"));
    });
    this.pendingRequests.clear();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.workerReady = false;
    this.initWorker();
  }

  // =================================================================
  // 内部：启动 / 握手
  // =================================================================

  private initWorker() {
    try {
      this.worker = new CalculatorWorker();
      this.worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
        this.handleWorkerMessage(event.data);
      };
      this.worker.onerror = (error) => {
        console.error("TokenCalculator Worker error:", error);
        this.handleWorkerError();
      };
    } catch (e) {
      console.error("Failed to initialize TokenCalculator Worker:", e);
    }
  }

  private handleWorkerMessage(data: WorkerOutbound) {
    // ============ 协议控制消息 ============
    if ((data as any).type === "ready") {
      this.tryPushInit();
      return;
    }

    if ((data as any).type === "initialized") {
      this.workerReady = true;
      this.flushStartupQueue();
      return;
    }

    if ((data as any).type === "needProfileData") {
      const msg = data as Extract<WorkerOutbound, { type: "needProfileData" }>;
      this.handleNeedProfileData(msg.profileId);
      return;
    }

    // ============ 业务响应 ============
    const resp = data as Extract<
      WorkerOutbound,
      { id: number; type: "response" | "error" }
    >;
    const pending = this.pendingRequests.get(resp.id);
    if (!pending) return;

    if (resp.type === "response") {
      pending.resolve((resp as any).result);
    } else {
      pending.reject(new Error((resp as any).error));
    }
    this.pendingRequests.delete(resp.id);
  }

  private tryPushInit() {
    if (!this.worker || !this.snapshotProvider) return;
    const snapshot = this.snapshotProvider();
    // 深克隆剥离 Vue 响应式 Proxy（structured clone 无法克隆 Proxy(Array)）。
    // snapshot 里只有纯数据（无函数 / Map / Set），用 JSON 来回最稳。
    const initMsg: WorkerInbound = JSON.parse(
      JSON.stringify({
        type: "init",
        profiles: snapshot.profiles,
        rules: snapshot.rules,
      })
    );
    this.worker.postMessage(initMsg);
  }

  private flushStartupQueue() {
    if (!this.worker) return;
    while (this.startupQueue.length > 0) {
      const req = this.startupQueue.shift()!;
      this.worker.postMessage(req);
    }
  }

  private async handleNeedProfileData(profileId: string) {
    if (!this.worker) return;
    if (!this.profileDataReader) {
      this.worker.postMessage({
        type: "profileData",
        profileId,
        tokenizerJSON: "",
        error: "profileDataReader 未注入",
      } as WorkerInbound);
      return;
    }
    try {
      const { tokenizerJSON, tokenizerConfigJSON } =
        await this.profileDataReader(profileId);
      this.worker.postMessage({
        type: "profileData",
        profileId,
        tokenizerJSON,
        tokenizerConfigJSON,
      } as WorkerInbound);
    } catch (error) {
      this.worker.postMessage({
        type: "profileData",
        profileId,
        tokenizerJSON: "",
        error: error instanceof Error ? error.message : String(error),
      } as WorkerInbound);
    }
  }

  private handleWorkerError() {
    this.pendingRequests.forEach((pending) => {
      pending.reject(new Error("Worker error"));
    });
    this.pendingRequests.clear();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.workerReady = false;

    setTimeout(() => {
      console.log("Attempting to restart TokenCalculator Worker...");
      this.initWorker();
    }, 1000);
  }

  // =================================================================
  // 业务接口（兼容 v1）
  // =================================================================

  private request<T>(method: string, params: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pendingRequests.set(id, { resolve, reject });

      const payload = { id, method, params };
      // 未 ready 时入队，否则直接 post
      if (!this.worker) {
        // worker 还没创建，先入队（initWorker 会在后续阶段读它）
        this.startupQueue.push(payload);
      } else if (!this.workerReady) {
        this.startupQueue.push(payload);
      } else {
        this.worker.postMessage(payload);
      }
    });
  }

  async calculateTokens(
    text: string,
    modelId: string
  ): Promise<TokenCalculationResult> {
    return this.request("calculateTokens", { text, modelId });
  }

  async calculateTokensByTokenizer(
    text: string,
    tokenizerName: string
  ): Promise<TokenCalculationResult> {
    return this.request("calculateTokensByTokenizer", { text, tokenizerName });
  }

  async getTokenizedText(
    text: string,
    identifier: string,
    useTokenizerName: boolean = false
  ): Promise<{ tokens: Array<{ text: string; id: number }> } | null> {
    return this.request("getTokenizedText", {
      text,
      identifier,
      useTokenizerName,
    });
  }

  async calculateImageTokens(
    width: number,
    height: number,
    visionTokenCost: VisionTokenCost
  ): Promise<number> {
    return this.request("calculateImageTokens", {
      width,
      height,
      visionTokenCost,
    });
  }

  async calculateVideoTokens(durationSeconds: number): Promise<number> {
    return this.request("calculateVideoTokens", { durationSeconds });
  }

  async calculateAudioTokens(durationSeconds: number): Promise<number> {
    return this.request("calculateAudioTokens", { durationSeconds });
  }

  clearCache(): void {
    if (!this.worker) return;
    if (!this.workerReady) {
      // 启动期，clearCache 本身就没意义（缓存还是空的），直接忽略
      return;
    }
    this.worker.postMessage({
      id: this.nextId++,
      method: "clearCache",
      params: {},
    });
  }
}

export const calculatorProxy = new TokenCalculatorProxy();
