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

import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useFFmpeg } from "@/composables/useFFmpeg";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("ffmpeg-tools/useTrimKeyframes");

/**
 * 关键帧查询服务。
 *
 * 按输入文件缓存整份关键帧列表（后端扫描整份文件），命中缓存后不再请求。
 * 请求令牌单调递增，用于忽略已过期的响应。
 */
export function useTrimKeyframes() {
  const { activeFfmpegPath, globalFfprobePath } = useFFmpeg();
  const cache = new Map<string, number[]>();
  const currentToken = ref(0);

  const beginRequest = (): number => {
    currentToken.value += 1;
    return currentToken.value;
  };

  const isStale = (token: number): boolean => token !== currentToken.value;

  const loadKeyframes = async (
    inputPath: string,
    startSec: number,
    endSec: number,
    token: number = beginRequest()
  ): Promise<number[]> => {
    if (!inputPath) return [];

    const cached = cache.get(inputPath);
    if (cached) return cached;

    if (isStale(token)) return [];

    try {
      const keyframes = await invoke<number[]>("get_media_keyframes", {
        ffmpegPath: activeFfmpegPath.value,
        ffprobePath: globalFfprobePath.value,
        inputPath,
        startSec,
        endSec,
      });

      if (isStale(token)) return [];

      const result = Array.isArray(keyframes) ? keyframes : [];
      cache.set(inputPath, result);
      return result;
    } catch (error) {
      if (!isStale(token)) {
        logger.error("获取关键帧失败", error, { inputPath });
      }
      return [];
    }
  };

  const clearKeyframeCache = () => {
    cache.clear();
  };

  return {
    currentToken,
    beginRequest,
    isStale,
    loadKeyframes,
    clearKeyframeCache,
  };
}
