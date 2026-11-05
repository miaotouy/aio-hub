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

import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { gitNetworkOptions } from "./git-network";
import { openGitTerminal } from "./git-terminal";

describe("Git network and terminal boundaries", () => {
  it("projects system, direct and custom proxy settings without leaking unrelated configuration", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aio-git-proxy-"));
    try {
      expect(await gitNetworkOptions(root)).toEqual({});
      await fs.mkdir(path.join(root, "app-settings"));
      const file = path.join(root, "app-settings", "settings.json");
      await fs.writeFile(file, JSON.stringify({ proxy: { mode: "system" } }));
      expect(await gitNetworkOptions(root)).toEqual({});
      await fs.writeFile(file, JSON.stringify({ proxy: { mode: "none" } }));
      expect(await gitNetworkOptions(root)).toEqual({
        gitArgs: ["-c", "http.proxy="],
        env: {
          http_proxy: "",
          https_proxy: "",
          HTTP_PROXY: "",
          HTTPS_PROXY: "",
          ALL_PROXY: "",
          all_proxy: "",
        },
      });
      const url = "socks5h://127.0.0.1:1080";
      await fs.writeFile(
        file,
        JSON.stringify({
          unrelated: "fixture-only",
          proxy: { mode: "custom", customUrl: url },
        })
      );
      const result = await gitNetworkOptions(root);
      expect(result).toEqual({
        gitArgs: ["-c", "http.proxy=" + url],
        env: {
          http_proxy: url,
          https_proxy: url,
          HTTP_PROXY: url,
          HTTPS_PROXY: url,
          ALL_PROXY: url,
          all_proxy: url,
        },
      });
      await fs.writeFile(
        file,
        JSON.stringify({
          proxy: { mode: "custom", customUrl: "file:///invalid" },
        })
      );
      await expect(gitNetworkOptions(root)).rejects.toThrow("代理地址无效");
      await fs.writeFile(file, "{");
      await expect(gitNetworkOptions(root)).rejects.toThrow("重新保存网络配置");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it("opens a user-owned terminal with an argv/cwd boundary and a safe Windows fallback", async () => {
    const root = "C:/workspace/中文 'quoted' & directory";
    const launch = vi.fn(async (exe: string) => {
      if (exe === "wt.exe")
        throw Object.assign(Error("missing"), { code: "ENOENT" });
    });
    await openGitTerminal(root, launch, "win32");
    expect(launch.mock.calls).toEqual([
      [
        "wt.exe",
        ["-d", root],
        { cwd: root, detached: true, stdio: "ignore", windowsHide: false },
      ],
      [
        "powershell.exe",
        ["-NoLogo", "-NoExit"],
        { cwd: root, detached: true, stdio: "ignore", windowsHide: false },
      ],
    ]);
    const mac = vi.fn(async () => {});
    await openGitTerminal(root, mac, "darwin");
    expect(mac).toHaveBeenCalledWith(
      "open",
      ["-a", "Terminal", root],
      expect.objectContaining({ cwd: root })
    );
    const linux = vi.fn(async () => {});
    await openGitTerminal(root, linux, "linux");
    expect(linux).toHaveBeenCalledWith(
      "x-terminal-emulator",
      ["--working-directory=" + root],
      expect.objectContaining({ cwd: root })
    );
  });
  it("reports terminal launch failures without silently starting a different executable", async () => {
    const launch = vi.fn(async () => {
      throw Object.assign(Error("denied"), { code: "EACCES" });
    });
    await expect(
      openGitTerminal("C:/fixture", launch, "win32")
    ).rejects.toThrow("无法打开系统终端");
    expect(launch).toHaveBeenCalledTimes(1);
  });
});
