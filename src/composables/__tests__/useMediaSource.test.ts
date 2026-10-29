// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { useMediaSource } from "../useMediaSource";
import { getStreamingMediaPath, resolveMediaSource } from "@/utils/mediaSource";

const { invoke, platform, isTauri } = vi.hoisted(() => ({
  invoke: vi.fn(),
  platform: vi.fn(),
  isTauri: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri }));
vi.mock("@tauri-apps/plugin-os", () => ({ platform }));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ warn: vi.fn() }),
}));
const asset = (path: string) => `asset://localhost/${encodeURIComponent(path)}`;
const lease = (token: string) => ({
  token,
  url: `http://127.0.0.1:43123/media/${token}`,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks();
  platform.mockReturnValue("linux");
  isTauri.mockReturnValue(true);
  invoke.mockResolvedValue(undefined);
});

// 保护平台入口与文件路径语义，以及用户快速切换媒体/关闭预览时的授权生命周期。
describe("媒体读取地址与授权", () => {
  it("保留编码路径中的空格、百分号和 Unix 字面字符，只解码一次", async () => {
    const path = "/tmp/.hidden/a's $中文 & x\\y%20.mp4";
    invoke.mockResolvedValueOnce(lease("one"));
    const result = await resolveMediaSource(asset(path));
    expect(invoke).toHaveBeenCalledWith("acquire_media_stream", { path });
    expect(result.url).toBe(lease("one").url);
    await result.release();
    await result.release();
    expect(
      invoke.mock.calls.filter(
        ([command]) => command === "release_media_stream"
      )
    ).toEqual([["release_media_stream", { token: "one" }]]);
    expect(getStreamingMediaPath("file:///tmp/a%2520.mp4")).toBe(
      "/tmp/a%20.mp4"
    );
  });

  it("网络/Blob 地址与 Windows、macOS、浏览器预览保持原始地址", async () => {
    for (const src of [
      "https://example.com/v.mp4",
      "blob:tauri://localhost/id",
      "/assets/v.mp4",
      "asset://other/id",
    ]) {
      expect((await resolveMediaSource(src)).url).toBe(src);
    }
    const src = asset("/tmp/v.mp4");
    for (const os of ["windows", "macos"]) {
      platform.mockReturnValue(os);
      expect((await resolveMediaSource(src)).url).toBe(src);
    }
    platform.mockReturnValue("linux");
    isTauri.mockReturnValue(false);
    expect((await resolveMediaSource(src)).url).toBe(src);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("先后完成顺序相反时只播放最新文件，并释放过期结果", async () => {
    const first = deferred<ReturnType<typeof lease>>();
    const second = deferred<ReturnType<typeof lease>>();
    invoke.mockImplementation((command, { path }) =>
      command === "acquire_media_stream"
        ? path === "/tmp/first.mp4"
          ? first.promise
          : second.promise
        : Promise.resolve()
    );
    const source = ref(asset("/tmp/first.mp4"));
    const scope = effectScope();
    const state = scope.run(() => useMediaSource(source))!;
    expect(state.src.value).toBeUndefined();
    source.value = asset("/tmp/second.mp4");
    await nextTick();
    second.resolve(lease("second"));
    await flushPromises();
    expect(state.src.value).toBe(lease("second").url);
    first.resolve(lease("first"));
    await flushPromises();
    expect(state.src.value).toBe(lease("second").url);
    expect(invoke).toHaveBeenCalledWith("release_media_stream", {
      token: "first",
    });
    scope.stop();
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith("release_media_stream", {
      token: "second",
    });
  });

  it("预览关闭后才完成的授权也会释放", async () => {
    const waiting = deferred<ReturnType<typeof lease>>();
    invoke.mockReturnValueOnce(waiting.promise);
    const scope = effectScope();
    const state = scope.run(() => useMediaSource(asset("/tmp/wait.mp4")))!;
    scope.stop();
    waiting.resolve(lease("late"));
    await flushPromises();
    expect(state.src.value).toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("release_media_stream", {
      token: "late",
    });
  });

  it("读取失败可观察，切换有效文件或清空源后恢复", async () => {
    invoke.mockRejectedValueOnce("文件已移走");
    const source = ref(asset("/tmp/missing.mp4"));
    const scope = effectScope();
    const state = scope.run(() => useMediaSource(source))!;
    await flushPromises();
    expect(state.error.value).toBe("文件已移走");
    expect(state.pending.value).toBe(false);
    invoke.mockResolvedValueOnce(lease("recovered"));
    source.value = asset("/tmp/valid.mp4");
    await flushPromises();
    expect(state.error.value).toBeNull();
    expect(state.src.value).toBe(lease("recovered").url);
    source.value = "";
    await flushPromises();
    expect(state.src.value).toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("release_media_stream", {
      token: "recovered",
    });
    scope.stop();
  });
});
