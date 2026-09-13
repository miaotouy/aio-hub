// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except compliance with the License.
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
import { createSubtitleTimelineStore } from "../useSubtitleTimelineStore";
import type { SubtitleEntry } from "../../types";

function entry(overrides: Partial<SubtitleEntry>): SubtitleEntry {
  return {
    id: "sub-1",
    text: "hello",
    startMs: 0,
    endMs: 1000,
    status: "done",
    ...overrides,
  };
}

describe("createSubtitleTimelineStore", () => {
  it("isolates subtitles between independent stores", () => {
    const screen = createSubtitleTimelineStore();
    const video = createSubtitleTimelineStore();

    screen.addSubtitle(entry({ id: "screen-1", text: "屏幕字幕" }));
    video.addSubtitle(entry({ id: "video-1", text: "视频字幕" }));

    expect(screen.subtitles.value.map((s) => s.text)).toEqual(["屏幕字幕"]);
    expect(video.subtitles.value.map((s) => s.text)).toEqual(["视频字幕"]);

    // 视频清空不应影响屏幕 store。
    video.clearSubtitles();
    expect(video.subtitles.value).toHaveLength(0);
    expect(screen.subtitles.value).toHaveLength(1);
  });

  it("splits and merges within a single store", () => {
    const store = createSubtitleTimelineStore();
    store.addSubtitle(entry({ id: "a", text: "hello world", startMs: 1000, endMs: 5000 }));

    const splitId = store.splitSubtitle("a", 3000);
    expect(splitId).not.toBeNull();
    expect(store.subtitles.value).toHaveLength(2);

    const mergedId = store.mergeSubtitles(["a", splitId!]);
    expect(mergedId).toBe("a");
    expect(store.subtitles.value).toHaveLength(1);
    expect(store.subtitles.value[0]).toMatchObject({
      id: "a",
      startMs: 1000,
      endMs: 5000,
    });
  });

  it("removes only the targeted entry", () => {
    const store = createSubtitleTimelineStore();
    store.addSubtitle(entry({ id: "a" }));
    store.addSubtitle(entry({ id: "b" }));

    store.removeSubtitle("a");
    expect(store.subtitles.value.map((s) => s.id)).toEqual(["b"]);
  });

  it("exports plain text and time-stamped text", () => {
    const store = createSubtitleTimelineStore();
    store.addSubtitle(
      entry({ id: "a", text: "  first  ", startMs: 0, endMs: 1000 })
    );
    store.addSubtitle(
      entry({ id: "b", text: "second", startMs: 1000, endMs: 2500 })
    );

    expect(store.exportPlainText()).toBe("first\nsecond");
    expect(store.exportTextWithTime()).toBe(
      "[00:00:00,000 --> 00:00:01,000] first\n[00:00:01,000 --> 00:00:02,500] second"
    );
  });

  describe("frame URL lifecycle", () => {
    beforeEach(() => {
      vi.stubGlobal("URL", {
        ...URL,
        createObjectURL: vi.fn(() => "blob:test"),
        revokeObjectURL: vi.fn(),
      });
    });

    it("revokes a removed entry's frame URL", () => {
      const store = createSubtitleTimelineStore();
      store.registerFrameUrl("blob:frame-a");
      store.addSubtitle(entry({ id: "a", frameUrl: "blob:frame-a" }));
      store.removeSubtitle("a");
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:frame-a");
    });

    it("revokes every tracked frame URL on clear", () => {
      const store = createSubtitleTimelineStore();
      store.registerFrameUrl("blob:frame-a");
      store.registerFrameUrl("blob:frame-b");
      store.clearSubtitles();
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });
  });
});
