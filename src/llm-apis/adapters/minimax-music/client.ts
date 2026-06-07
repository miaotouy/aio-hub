import type {
  MinimaxClientConfig,
  MinimaxLyricsRequest,
  MinimaxLyricsResponse,
  MinimaxMusicRequest,
  MinimaxMusicResponse,
} from "./types";
import {
  ensureMinimaxSuccess,
  minimaxMusicFetch,
  MINIMAX_MUSIC_PATHS,
} from "./utils";

export class MinimaxMusicClient {
  private readonly config: MinimaxClientConfig;

  constructor(config: MinimaxClientConfig) {
    this.config = config;
  }

  async generateLyrics(
    request: MinimaxLyricsRequest
  ): Promise<MinimaxLyricsResponse> {
    const response = await minimaxMusicFetch<MinimaxLyricsResponse>(
      this.config,
      MINIMAX_MUSIC_PATHS.lyricsGeneration,
      request
    );
    ensureMinimaxSuccess(response, "歌词生成失败");
    return response;
  }

  async generateMusic(
    request: MinimaxMusicRequest
  ): Promise<MinimaxMusicResponse> {
    const response = await minimaxMusicFetch<MinimaxMusicResponse>(
      this.config,
      MINIMAX_MUSIC_PATHS.musicGeneration,
      request
    );
    ensureMinimaxSuccess(response, "音乐生成失败");
    return response;
  }
}
