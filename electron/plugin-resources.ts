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
import { applicationPath, relativeApplicationPath } from "./application-path";
import { filePath } from "./filesystem";
import { pluginId } from "./plugin-packages";

/** Installed plugin code shares the app origin; arbitrary asset grants remain data-only. */
export class PluginResources {
  constructor(
    private root: string,
    private validToken: (token: string) => boolean
  ) {}
  private async installation(id: string) {
    const directory = await applicationPath(
      this.root,
      "plugins/" + pluginId(id)
    );
    const manifest = await applicationPath(
      this.root,
      "plugins/" + id + "/manifest.json"
    );
    const info = await fs.stat(manifest);
    if (!info.isFile()) throw new Error("插件缺少 manifest.json");
    return {
      directory,
      generation: info.mtimeMs.toString(36) + "-" + info.ino.toString(36),
    };
  }
  async url(
    token: string,
    pluginPath: unknown,
    resourcePath: unknown
  ): Promise<string> {
    if (!this.validToken(token)) throw new Error("插件资源窗口已失效");
    const directory = filePath(pluginPath, undefined, {});
    const id = pluginId(
      path
        .relative(path.join(this.root, "plugins"), directory)
        .replaceAll(path.sep, "/")
    );
    const { generation } = await this.installation(id);
    const relative = relativeApplicationPath(
      path
        .relative(directory, filePath(resourcePath, undefined, {}))
        .replaceAll(path.sep, "/")
    );
    const url =
      "aiohub://app/__plugins/" +
      [token, id, generation, ...relative.split("/")]
        .map(encodeURIComponent)
        .join("/");
    await this.resolve(new URL(url));
    return url;
  }
  async resolve(url: URL): Promise<string> {
    const segments = url.pathname.slice(1).split("/").map(decodeURIComponent);
    const [route, token, id, generation, ...parts] = segments;
    if (
      url.protocol !== "aiohub:" ||
      url.host !== "app" ||
      route !== "__plugins" ||
      !token ||
      !this.validToken(token)
    )
      throw new Error("插件资源访问已失效");
    const installed = await this.installation(pluginId(id));
    if (installed.generation !== generation)
      throw new Error("插件已更新，请重新加载");
    const relative = relativeApplicationPath(parts.join("/"));
    const file = await applicationPath(
      this.root,
      "plugins/" + id + "/" + relative
    );
    if (!(await fs.stat(file)).isFile()) throw new Error("插件资源不是文件");
    return file;
  }
}
