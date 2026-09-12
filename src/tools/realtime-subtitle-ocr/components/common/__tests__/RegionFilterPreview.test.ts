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

import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import RegionFilterPreview from "../RegionFilterPreview.vue";
import { releaseCaptureSource } from "@/tools/realtime-subtitle-ocr/utils/frameCapture";

vi.mock("@/tools/realtime-subtitle-ocr/composables/useScreenMonitor", () => ({
  useScreenMonitor: () => ({
    config: {
      value: {
        imageFilter: {},
        engineConfig: { type: "native", name: "native" },
      },
    },
  }),
}));

vi.mock("@/tools/realtime-subtitle-ocr/utils/frameCapture", () => {
  const renderFilteredRegion = vi.fn((source: { id: string }) => ({
    originalCanvas: null,
    filteredCanvas: null,
    originalUrl: `original:${source.id}`,
    filteredUrl: `filtered:${source.id}`,
  }));
  return {
    getSourceDimensions: () => ({ width: 100, height: 100 }),
    isSourceReady: () => true,
    releaseCaptureSource: vi.fn(),
    recognizeCanvas: vi.fn(() => Promise.resolve("")),
    renderFilteredRegion,
  };
});

interface ExposedPreview {
  refresh: () => Promise<void>;
  originalUrl: string;
}

function mountPreview(capture: () => Promise<unknown>) {
  return mount(RegionFilterPreview, {
    props: { capture: capture as never },
    global: { stubs: { FrameFilterPreview: true } },
  });
}

describe("RegionFilterPreview refresh concurrency", () => {
  it("discards a stale capture result when a newer refresh is in flight", async () => {
    const pending: Array<(value: unknown) => void> = [];
    const capture = vi.fn(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        })
    );
    const wrapper = mountPreview(capture);
    const vm = wrapper.vm as unknown as ExposedPreview;

    const first = vm.refresh();
    const second = vm.refresh();
    expect(capture).toHaveBeenCalledTimes(2);

    // 旧请求后返回，不能覆盖尚未完成的新预览。
    pending[0]({ id: "first" });
    await flushPromises();
    expect(vm.originalUrl).toBe("");

    pending[1]({ id: "second" });
    await flushPromises();
    await first;
    await second;

    expect(vm.originalUrl).toBe("original:second");
    expect(releaseCaptureSource).toHaveBeenCalledWith({ id: "first" });
  });
});
