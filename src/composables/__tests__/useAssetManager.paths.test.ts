// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string, protocol: string) =>
    `${protocol}://localhost/${encodeURIComponent(path)}`,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(), emit: vi.fn() }));
vi.mock("@/services/registry", () => ({ toolRegistryManager: {} }));
vi.mock("@/utils/audioSampler", () => ({
  sampleAudioWaveform: vi.fn(),
  needsWaveformSampling: vi.fn(),
}));
vi.mock("@/utils/customMessage", () => ({ customMessage: {} }));
import { assetManagerEngine } from "../useAssetManager";

// The asset protocol must address the same file on POSIX, Windows drives and UNC shares.
it.each([
  [
    "/home/mty/AIO assets",
    "memory/图片 1.png",
    "/home/mty/AIO assets/memory/图片 1.png",
    false,
  ],
  [
    "/home/mty/assets/",
    "memory/image.png",
    "/home/mty/assets/memory/image.png",
    false,
  ],
  [
    "C:\\AIO assets",
    "memory\\image.png",
    "C:/AIO assets/memory/image.png",
    true,
  ],
  [
    "\\\\server\\share\\assets",
    "memory/image.png",
    "//server/share/assets/memory/image.png",
    true,
  ],
])("resolves an attachment under %s", (base, relative, expected, windows) => {
  const url = assetManagerEngine.convertToAssetProtocol(
    String(relative),
    String(base)
  );
  expect(url.startsWith("asset://localhost/")).toBe(true);
  const file = decodeURIComponent(url.slice("asset://localhost/".length));
  expect(windows ? file.replace(/\\/g, "/") : file).toBe(expected);
});
