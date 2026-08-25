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

import type { FFmpegParams } from "../types";

const presetParamKeys = [
  "mode",
  "hwaccel",
  "videoEncoder",
  "preset",
  "crf",
  "videoBitrate",
  "scale",
  "fps",
  "pixelFormat",
  "audioEncoder",
  "audioBitrate",
  "sampleRate",
  "audioChannels",
  "customArgs",
  "maxSizeMb",
  "appendParamsToName",
] as const satisfies readonly (keyof FFmpegParams)[];

/**
 * 将预设的配置快照应用到当前参数，不覆盖输入、输出和 FFmpeg 可执行文件等运行时字段。
 */
export function applyPresetParams(
  params: FFmpegParams,
  presetParams: Partial<FFmpegParams>
) {
  // 视频预设应作为完整快照：先移除会改变编码、画质或尺寸的旧值，
  // 再应用预设实际定义的参数，避免 CRF、码率、缩放等状态残留。
  if (presetParams.mode === "video" || presetParams.mode === "convert") {
    params.videoEncoder = undefined;
    params.preset = undefined;
    params.crf = undefined;
    params.videoBitrate = undefined;
    params.scale = undefined;
    params.fps = undefined;
    params.pixelFormat = undefined;
    params.maxSizeMb = undefined;
  }

  for (const key of presetParamKeys) {
    if (Object.prototype.hasOwnProperty.call(presetParams, key)) {
      Object.assign(params, { [key]: presetParams[key] });
    }
  }
}
