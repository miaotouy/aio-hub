// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
vi.unmock("./native/core");
const host = vi.hoisted(() => ({
  assetUrl: vi.fn(
    (path: string) => "asset://owned/" + encodeURIComponent(path)
  ),
}));
vi.mock("./electron/client", () => ({
  getElectronBridge: () => host,
  request: vi.fn(),
}));
import { convertFileSrc } from "./native/core";
it("keeps local asset conversion on the registered owner-aware file handler", () => {
  const path = "C:/pictures/红色.bmp";
  expect(convertFileSrc(path)).toBe(
    "asset://owned/" + encodeURIComponent(path)
  );
  expect(host.assetUrl).toHaveBeenCalledWith(path);
});
it("rejects unregistered file protocols before authorizing any local path", () => {
  host.assetUrl.mockClear();
  expect(() => convertFileSrc("C:/private.txt", "unregistered")).toThrow(
    expect.objectContaining({
      code: "RESOURCE_PROTOCOL_NOT_REGISTERED",
      protocol: "unregistered",
    })
  );
  expect(host.assetUrl).not.toHaveBeenCalled();
});
