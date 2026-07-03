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

import { computed, type ComputedRef, type Ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("composables/useFFmpeg");

type MaybePathRef = Ref<string | undefined> | ComputedRef<string | undefined>;

const normalizePath = (path?: string) => path?.trim() || "";

export function useFFmpeg(toolPrivatePath?: MaybePathRef) {
  const settingsStore = useAppSettingsStore();

  const globalFfmpegPath = computed(
    () => normalizePath(settingsStore.environment.ffmpegPath) || "ffmpeg"
  );

  const globalFfprobePath = computed(
    () => normalizePath(settingsStore.environment.ffprobePath) || "ffprobe"
  );

  const activeFfmpegPath = computed(() => {
    const privatePath = normalizePath(toolPrivatePath?.value);
    return privatePath || globalFfmpegPath.value;
  });

  const isUsingGlobal = computed(() => !normalizePath(toolPrivatePath?.value));

  const checkAvailability = async (pathToCheck?: string): Promise<boolean> => {
    const targetPath = normalizePath(pathToCheck) || activeFfmpegPath.value;
    try {
      return await invoke<boolean>("check_ffmpeg_availability", {
        path: targetPath,
      });
    } catch (error) {
      logger.error("检查 FFmpeg 可用性失败", error, { path: targetPath });
      return false;
    }
  };

  return {
    globalFfmpegPath,
    globalFfprobePath,
    activeFfmpegPath,
    isUsingGlobal,
    checkAvailability,
  };
}
