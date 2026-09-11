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

import { describe, expect, it } from "vitest";
import {
  isTerminalStatus,
  shouldIgnoreStatusUpdate,
  isCancellationError,
  isProgressIndeterminate,
  normalizeOutputPathKey,
  isPathReserved,
  reservePath,
} from "../utils/lifecycle";

describe("ffmpeg-tools task lifecycle", () => {
  it("isTerminalStatus 只认可终态", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("pending")).toBe(false);
    expect(isTerminalStatus("processing")).toBe(false);
    expect(isTerminalStatus("unknown")).toBe(false);
  });

  it("shouldIgnoreStatusUpdate 阻止终态被迟到回调覆盖", () => {
    expect(shouldIgnoreStatusUpdate("cancelled", "completed")).toBe(true);
    expect(shouldIgnoreStatusUpdate("cancelled", "failed")).toBe(true);
    expect(shouldIgnoreStatusUpdate("cancelled", "processing")).toBe(true);
    expect(shouldIgnoreStatusUpdate("failed", "completed")).toBe(true);
    expect(shouldIgnoreStatusUpdate("completed", "completed")).toBe(false);
    expect(shouldIgnoreStatusUpdate("processing", "completed")).toBe(false);
    expect(shouldIgnoreStatusUpdate("pending", "processing")).toBe(false);
  });

  it("isCancellationError 识别取消标记与 AbortError", () => {
    expect(isCancellationError("FFMPEG_CANCELLED")).toBe(true);
    expect(
      isCancellationError(new Error("process failed: FFMPEG_CANCELLED"))
    ).toBe(true);
    expect(isCancellationError({ name: "AbortError" })).toBe(true);
    expect(isCancellationError(new Error("Some other failure"))).toBe(false);
    expect(isCancellationError(undefined)).toBe(false);
  });

  it("isProgressIndeterminate 仅在未知或非正时长时为真", () => {
    expect(isProgressIndeterminate({})).toBe(true);
    expect(isProgressIndeterminate({ totalDuration: 0 })).toBe(true);
    expect(isProgressIndeterminate({ totalDuration: -1 })).toBe(true);
    expect(isProgressIndeterminate({ totalDuration: 12 })).toBe(false);
  });

  it("normalizeOutputPathKey 统一分隔符、大小写并处理空值", () => {
    expect(normalizeOutputPathKey("  C:\\Media\\Out.MP4  ")).toBe(
      "c:/media/out.mp4"
    );
    expect(normalizeOutputPathKey("c:/media//out.mp4")).toBe("c:/media/out.mp4");
    expect(normalizeOutputPathKey("C:/Media/Out.MP4")).toBe("c:/media/out.mp4");
    expect(normalizeOutputPathKey("")).toBe("");
    expect(normalizeOutputPathKey("   ")).toBe("");
  });

  it("reservePath / isPathReserved 避免同一输出路径被重复占用", () => {
    const reservations: Record<string, string> = {};

    expect(reservePath(reservations, "task-a", "C:\\out\\video.mp4")).toBe(true);
    expect(reservePath(reservations, "task-a", "C:\\out\\video.mp4")).toBe(true);
    expect(isPathReserved(reservations, "C:\\out\\video.mp4", "task-a")).toBe(
      false
    );

    expect(reservePath(reservations, "task-b", "c:/out/video.mp4")).toBe(false);
    expect(isPathReserved(reservations, "c:/out//video.mp4", "task-b")).toBe(
      true
    );

    expect(reservePath(reservations, "task-b", "C:\\out\\other.mp4")).toBe(true);
    expect(isPathReserved(reservations, "C:\\out\\other.mp4", "task-b")).toBe(
      false
    );
    expect(isPathReserved(reservations, "C:\\out\\other.mp4", "task-a")).toBe(
      true
    );
  });
});
