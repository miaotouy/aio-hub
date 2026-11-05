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

import fs from "node:fs/promises";
import path from "node:path";

export interface GitNetworkOptions {
  env?: Record<string, string>;
  gitArgs?: string[];
}
/** Read only the proxy projection, never emit settings or proxy credentials to logs. */
export async function gitNetworkOptions(
  userData: string
): Promise<GitNetworkOptions> {
  const file = path.join(userData, "app-settings", "settings.json");
  let settings;
  try {
    if ((await fs.stat(file)).size > 4 * 1024 ** 2) throw Error("size");
    settings = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("无法读取代理设置，请在设置中重新保存网络配置");
  }
  const proxy = settings?.proxy;
  if (!proxy || proxy.mode === "system") return {};
  let url = "";
  if (proxy.mode === "custom") {
    if (
      typeof proxy.customUrl !== "string" ||
      !proxy.customUrl ||
      /[\r\n\0]/.test(proxy.customUrl)
    )
      throw new Error("自定义代理地址无效");
    try {
      const parsed = new URL(proxy.customUrl);
      if (
        ![
          "http:",
          "https:",
          "socks5:",
          "socks5h:",
          "socks4:",
          "socks4a:",
        ].includes(parsed.protocol)
      )
        throw Error();
      url = proxy.customUrl;
    } catch {
      throw new Error("自定义代理地址无效，请检查地址与协议");
    }
  } else if (proxy.mode !== "none")
    throw new Error("代理模式无效，请重新选择网络配置");
  return {
    env: Object.fromEntries(
      [
        "http_proxy",
        "https_proxy",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "all_proxy",
      ].map((key) => [key, url])
    ),
    gitArgs: ["-c", "http.proxy=" + url],
  };
}
