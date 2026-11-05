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

import { afterEach, describe, expect, it, vi } from "vitest";
import { getBrowserClipboard, openBrowserWindow } from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Preserve user-activation/permission failures and popup handles through the browser boundary.
describe("browser host compatibility", () => {
  it("retains clipboard method binding, rich items and permission rejections", async () => {
    const denied = new DOMException(
      "Clipboard access denied",
      "NotAllowedError"
    );
    const clipboard = {
      marker: "clipboard",
      readText: vi.fn(async function (this: { marker: string }) {
        expect(this.marker).toBe("clipboard");
        throw denied;
      }),
      write: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("navigator", { clipboard });
    await expect(getBrowserClipboard().readText()).rejects.toBe(denied);
    const items = [{ types: ["image/png"] }] as unknown as ClipboardItem[];
    await getBrowserClipboard().write(items);
    expect(clipboard.write).toHaveBeenCalledWith(items);
    expect(clipboard.write.mock.calls[0][0]).toBe(items);
  });

  it("returns a popup handle and preserves the supplied target and feature arguments", () => {
    const popup = { print: vi.fn() } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(popup);
    expect(openBrowserWindow("blob:print-preview", "_blank")).toBe(popup);
    expect(open).toHaveBeenLastCalledWith("blob:print-preview", "_blank");
    open.mockReturnValueOnce(null);
    expect(
      openBrowserWindow("https://example.com", "_blank", "noopener")
    ).toBeNull();
    expect(open).toHaveBeenLastCalledWith(
      "https://example.com",
      "_blank",
      "noopener"
    );
  });
});
