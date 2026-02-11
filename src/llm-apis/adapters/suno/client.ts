/**
 * Suno 音乐生成客户端
 */
import type {
  SunoClientConfig,
  SunoMusicRequest,
  SunoLyricsRequest,
  SunoConcatRequest,
  SunoTagsRequest,
  SunoVoxRequest,
  SunoSubmitResponse,
  SunoFetchResponse,
  SunoClipInfo,
  SunoTagsResponse,
  SunoVoxResponse,
  SunoMusicResult,
  SunoLyricsResult,
  SunoProgressCallback,
} from "./types";
import {
  buildSunoUrl,
  sunoFetch,
  parseProgressPercentage,
  isTaskTerminal,
  SUNO_PATHS,
  SUNO_DEFAULTS,
} from "./utils";

export class SunoClient {
  private readonly config: SunoClientConfig;
  private readonly pollInterval: number;
  private readonly maxPollAttempts: number;

  constructor(config: SunoClientConfig) {
    this.config = config;
    this.pollInterval = config.pollInterval ?? SUNO_DEFAULTS.pollInterval;
    this.maxPollAttempts = config.maxPollAttempts ?? SUNO_DEFAULTS.maxPollAttempts;
  }

  /** 提交音乐生成并轮询至完成 */
  async generateMusic(request: SunoMusicRequest, onProgress?: SunoProgressCallback): Promise<SunoMusicResult> {
    const taskId = await this.submitMusic(request);
    onProgress?.({ status: "SUBMITTED", progressText: "0%", percentage: 0 });
    const fetchResult = await this.pollUntilDone(taskId, onProgress);
    if (fetchResult.data.status === "FAILURE") {
      return { taskId, clips: [], status: "FAILURE", failReason: fetchResult.data.fail_reason || "Unknown error" };
    }
    const clips = await this.extractClipsFromTask(fetchResult);
    return { taskId, clips, status: "SUCCESS" };
  }

  /** 提交歌词生成并轮询至完成 */
  async generateLyrics(request: SunoLyricsRequest, onProgress?: SunoProgressCallback): Promise<SunoLyricsResult> {
    const taskId = await this.submitLyrics(request);
    onProgress?.({ status: "SUBMITTED", progressText: "0%", percentage: 0 });
    const fetchResult = await this.pollUntilDone(taskId, onProgress);
    if (fetchResult.data.status === "FAILURE") {
      return { taskId, title: "", text: "", status: "FAILURE" };
    }
    const taskData = fetchResult.data.data || {};
    return { taskId, title: taskData.title || "", text: taskData.text || "", status: "SUCCESS" };
  }

  /** 提交拼接任务并轮询至完成 */
  async concat(request: SunoConcatRequest, onProgress?: SunoProgressCallback): Promise<SunoMusicResult> {
    const taskId = await this.submitConcat(request);
    onProgress?.({ status: "SUBMITTED", progressText: "0%", percentage: 0 });
    const fetchResult = await this.pollUntilDone(taskId, onProgress);
    if (fetchResult.data.status === "FAILURE") {
      return { taskId, clips: [], status: "FAILURE", failReason: fetchResult.data.fail_reason || "Unknown error" };
    }
    const clips = await this.extractClipsFromTask(fetchResult);
    return { taskId, clips, status: "SUCCESS" };
  }

  // === 低级方法 ===

  async submitMusic(request: SunoMusicRequest): Promise<string> {
    const url = buildSunoUrl(this.config.baseUrl, SUNO_PATHS.submitMusic);
    const res = await this.request<SunoSubmitResponse>("POST", url, request);
    this.ensureSunoSuccess(res);
    return res.data;
  }

  async submitLyrics(request: SunoLyricsRequest): Promise<string> {
    const url = buildSunoUrl(this.config.baseUrl, SUNO_PATHS.submitLyrics);
    const res = await this.request<SunoSubmitResponse>("POST", url, request);
    this.ensureSunoSuccess(res);
    return res.data;
  }

  async submitConcat(request: SunoConcatRequest): Promise<string> {
    const url = buildSunoUrl(this.config.baseUrl, SUNO_PATHS.submitConcat);
    const res = await this.request<SunoSubmitResponse>("POST", url, request);
    this.ensureSunoSuccess(res);
    return res.data;
  }

  async fetchTask(taskId: string): Promise<SunoFetchResponse> {
    const url = buildSunoUrl(this.config.baseUrl, `${SUNO_PATHS.fetch}/${taskId}`);
    return this.request<SunoFetchResponse>("GET", url);
  }

  async getClipInfo(clipId: string): Promise<SunoClipInfo[]> {
    const url = buildSunoUrl(this.config.baseUrl, `${SUNO_PATHS.feed}/${clipId}`);
    return this.request<SunoClipInfo[]>("GET", url);
  }

  async upsampleTags(request: SunoTagsRequest): Promise<SunoTagsResponse> {
    const url = buildSunoUrl(this.config.baseUrl, SUNO_PATHS.actTags);
    return this.request<SunoTagsResponse>("POST", url, request);
  }

  async separateVocals(clipId: string, request?: SunoVoxRequest): Promise<SunoVoxResponse> {
    const url = buildSunoUrl(this.config.baseUrl, `${SUNO_PATHS.actVox}/${clipId}`);
    return this.request<SunoVoxResponse>("POST", url, request ?? {});
  }

  // === 内部方法 ===

  private async pollUntilDone(taskId: string, onProgress?: SunoProgressCallback): Promise<SunoFetchResponse> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      // 检查中止信号
      if (this.config.signal?.aborted) {
        throw new DOMException("Suno task polling aborted", "AbortError");
      }

      const result = await this.fetchTask(taskId);
      const status = result.data.status;
      const progressText = result.data.progress || "0%";
      const percentage = parseProgressPercentage(progressText);

      onProgress?.({ status, progressText, percentage });

      if (isTaskTerminal(status)) {
        return result;
      }

      // 等待下一次轮询
      await this.sleep(this.pollInterval);
    }

    throw new Error(`Suno task ${taskId} timed out after ${this.maxPollAttempts} poll attempts`);
  }

  private async extractClipsFromTask(fetchResult: SunoFetchResponse): Promise<SunoClipInfo[]> {
    const taskData = fetchResult.data.data;
    if (!taskData) return [];

    // 任务结果可能包含 clip ID，需要通过 feed 接口获取完整信息
    // 结果格式可能是单个对象或数组
    const items = Array.isArray(taskData) ? taskData : [taskData];
    const clipIds: string[] = [];

    for (const item of items) {
      if (typeof item === "string") {
        clipIds.push(item);
      } else if (item && typeof item === "object" && item.id) {
        clipIds.push(item.id);
      }
    }

    if (clipIds.length === 0) return [];

    // 通过 feed 接口获取完整的歌曲信息
    const allClips: SunoClipInfo[] = [];
    for (const clipId of clipIds) {
      try {
        const clips = await this.getClipInfo(clipId);
        allClips.push(...clips);
      } catch {
        // 单个 clip 获取失败不影响整体
      }
    }

    return allClips;
  }

  private async request<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
    return sunoFetch<T>(this.config, method, url, body);
  }

  private ensureSunoSuccess(response: SunoSubmitResponse): void {
    if (response.code !== "success") {
      throw new Error(`Suno API error: ${response.message || response.code}`);
    }
    if (!response.data) {
      throw new Error("Suno API returned empty task ID");
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      // 如果有中止信号，监听它以提前结束等待
      if (this.config.signal) {
        const onAbort = () => {
          clearTimeout(timer);
          reject(new DOMException("Suno task polling aborted", "AbortError"));
        };
        if (this.config.signal.aborted) {
          clearTimeout(timer);
          reject(new DOMException("Suno task polling aborted", "AbortError"));
          return;
        }
        this.config.signal.addEventListener("abort", onAbort, { once: true });
        // 清理监听器
        const originalResolve = resolve;
        resolve = () => {
          this.config.signal?.removeEventListener("abort", onAbort);
          originalResolve();
        };
      }
    });
  }
}