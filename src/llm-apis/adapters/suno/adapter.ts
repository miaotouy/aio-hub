import type { LlmProfile } from "@/types/llm-profiles";
import {
  type MediaGenerationOptions,
  type LlmResponse,
} from "@/llm-apis/common";
import type { LlmAdapter } from "../index";
import { SunoClient } from "./client";
import { clipsToLlmResponse } from "./utils";
import type { SunoMusicRequest, SunoModelVersion } from "./types";

/**
 * Suno 音乐生成适配器
 * 将 SunoClient 包装为系统统一的 LlmAdapter 接口
 */
export const sunoAdapter: LlmAdapter = {
  /**
   * Suno 不支持文本对话，返回提示
   */
  async chat() {
    return {
      content: "Suno 仅支持音乐生成，请在媒体工具中使用。",
    };
  },

  /**
   * 音频/音乐生成实现
   */
  async audio(
    profile: LlmProfile,
    options: MediaGenerationOptions
  ): Promise<LlmResponse> {
    const {
      prompt,
      params = {},
      signal,
      timeout,
    } = options;

    // 1. 初始化客户端
    const client = new SunoClient({
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKeys?.[0] || "",
      signal,
      timeout,
      forceProxy: options.forceProxy,
      relaxIdCerts: options.relaxIdCerts,
      http1Only: options.http1Only,
    });

    // 2. 构造请求
    // 优先从 params 中读取 suno_mode，默认为灵感模式 (simple)
    const mode = params?.suno_mode || "simple";
    let request: SunoMusicRequest;

    const mv = (params?.mv || "chirp-v4") as SunoModelVersion;
    const make_instrumental = !!params?.make_instrumental;

    if (mode === "custom") {
      request = {
        prompt: prompt || "", // 自定义模式下 prompt 是歌词
        tags: params?.tags || "",
        title: params?.title || "",
        make_instrumental,
        mv,
        continue_at: params?.continue_at,
        continue_clip_id: params?.continue_clip_id,
      };
    } else {
      request = {
        gpt_description_prompt: prompt || "", // 灵感模式下 prompt 是描述
        make_instrumental,
        mv,
      };
    }

    // 3. 调用生成并等待结果 (轮询逻辑已在 SunoClient 内部实现)
    const result = await client.generateMusic(request, (progress) => {
      // 如果有进度回调需求，可以在这里处理
      // 暂且依赖 MediaGenerationOptions 的同步等待
      console.log(`[Suno] ${progress.status}: ${progress.progressText}`);
    });

    if (result.status === "FAILURE") {
      throw new Error(`Suno 生成失败: ${result.failReason || "未知原因"}`);
    }

    // 4. 转换结果为标准格式
    return clipsToLlmResponse(result.clips, result.taskId);
  },
};