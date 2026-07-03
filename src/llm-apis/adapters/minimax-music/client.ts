// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type {
  CoverPreprocessRequest,
  CoverPreprocessResponse,
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

  async coverPreprocess(
    request: CoverPreprocessRequest
  ): Promise<CoverPreprocessResponse> {
    const response = await minimaxMusicFetch<CoverPreprocessResponse>(
      this.config,
      MINIMAX_MUSIC_PATHS.coverPreprocess,
      request
    );
    ensureMinimaxSuccess(response, "翻唱前处理失败");
    return response;
  }
}
