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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildExecutionPlan, formatShellCommand } from "../utils/executionPlan";
import { useFFmpegCommand } from "../composables/useFFmpegCommand";
const { platform } = vi.hoisted(() => ({ platform: vi.fn() }));
vi.mock("@tauri-apps/plugin-os", () => ({ platform }));

// 防止真实平台接入时，复制入口选错终端格式。
describe("FFmpeg 命令的平台选择", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each([
    ["windows", "powershell"],
    ["linux", "posix"],
    ["macos", "posix"],
  ] as const)("%s", (os, shell) => {
    platform.mockReturnValue(os);
    const plan = buildExecutionPlan({
      mode: "video",
      ffmpegPath: "ffmpeg",
      hwaccel: false,
      inputPath: "/tmp/in's.mp4",
      outputPath: "/tmp/out.mp4",
    });
    expect(useFFmpegCommand().formatCommand(plan)).toBe(
      formatShellCommand(plan, shell)
    );
  });
});
