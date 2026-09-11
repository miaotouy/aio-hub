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
  formatTrimTime,
  hasTrimRange,
  parseTrimTime,
  snapToKeyframe,
  trimNameTag,
  validateTrimRange,
} from "../utils/trim";

describe("parseTrimTime", () => {
  it("解析 HH:MM:SS.mmm", () => {
    expect(parseTrimTime("01:02:03.500")).toBeCloseTo(3723.5, 5);
  });

  it("解析 MM:SS", () => {
    expect(parseTrimTime("02:03")).toBe(123);
  });

  it("解析纯秒数", () => {
    expect(parseTrimTime("12.5")).toBe(12.5);
  });

  it("忽略首尾空白", () => {
    expect(parseTrimTime("  00:00:05  ")).toBe(5);
  });

  it("非法输入返回 null", () => {
    expect(parseTrimTime("")).toBeNull();
    expect(parseTrimTime("abc")).toBeNull();
    expect(parseTrimTime("1:2:3:4")).toBeNull();
    expect(parseTrimTime("12:xx")).toBeNull();
  });
});

describe("formatTrimTime", () => {
  it("格式化为 HH:MM:SS.mmm", () => {
    expect(formatTrimTime(3723.5)).toBe("01:02:03.500");
    expect(formatTrimTime(0)).toBe("00:00:00.000");
  });

  it("毫秒四舍五入并进位", () => {
    expect(formatTrimTime(59.9999)).toBe("00:01:00.000");
  });

  it("与 parseTrimTime 往返一致", () => {
    const seconds = 3723.5;
    expect(parseTrimTime(formatTrimTime(seconds))).toBeCloseTo(seconds, 5);
  });
});

describe("hasTrimRange", () => {
  it("起点或终点大于零时为真", () => {
    expect(hasTrimRange({ trimStart: 1 })).toBe(true);
    expect(hasTrimRange({ trimEnd: 1 })).toBe(true);
    expect(hasTrimRange({ trimStart: 0, trimEnd: 0 })).toBe(false);
    expect(hasTrimRange({})).toBe(false);
  });
});

describe("validateTrimRange", () => {
  it("结束时间小于开始时间时报错", () => {
    const result = validateTrimRange({ trimStart: 10, trimEnd: 5 });
    expect(result.error).toBe("结束时间必须大于开始时间");
    expect(result.duration).toBe(-5);
  });

  it("结束时间等于开始时间时为零时长错误", () => {
    const result = validateTrimRange({ trimStart: 5, trimEnd: 5 });
    expect(result.error).toBe("裁剪时长必须大于零");
    expect(result.duration).toBe(0);
  });

  it("超出源时长时给出截取警告", () => {
    const result = validateTrimRange(
      { trimStart: 0, trimEnd: 100 },
      50,
      true
    );
    expect(result.error).toBeUndefined();
    expect(result.warning).toBe("结束时间超出源时长，将按源结尾截取");
  });

  it("缺少源时长且只有起点时按无效范围处理", () => {
    const result = validateTrimRange({ trimStart: 20 });
    expect(result.error).toBe("结束时间必须大于开始时间");
  });

  it("音频快速裁剪给出信息性警告", () => {
    const result = validateTrimRange(
      { trimStart: 0, trimEnd: 10, trimMode: "fast" },
      100,
      false
    );
    expect(result.error).toBeUndefined();
    expect(result.warning).toBe(
      "音频流拷贝裁剪按关键帧/时间基执行，不保证精确到毫秒"
    );
  });
});

describe("snapToKeyframe", () => {
  const keyframes = [0, 4, 6, 10];

  it("最近策略选择差值最小的关键帧", () => {
    expect(snapToKeyframe(5, keyframes, "nearest")).toBe(4);
  });

  it("向前策略选择不小于时间的最小关键帧", () => {
    expect(snapToKeyframe(5, keyframes, "forward")).toBe(6);
  });

  it("向后策略选择不大于时间的最大关键帧", () => {
    expect(snapToKeyframe(5, keyframes, "backward")).toBe(4);
  });

  it("请求方向无候选时回退到原时间", () => {
    expect(snapToKeyframe(11, keyframes, "forward")).toBe(11);
    expect(snapToKeyframe(-1, keyframes, "backward")).toBe(-1);
  });

  it("空关键帧列表回退到原时间", () => {
    expect(snapToKeyframe(5, [], "nearest")).toBe(5);
  });
});

describe("trimNameTag", () => {
  it("有裁剪范围时返回 _trim", () => {
    expect(trimNameTag({ trimStart: 1 })).toBe("_trim");
    expect(trimNameTag({})).toBe("");
  });
});
