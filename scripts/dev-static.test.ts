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

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { get, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acquireBuildLock,
  createSnapshot,
  createStaticServer,
  publishSnapshot,
  removeSnapshot,
} from "./dev-static-server";

let root: string;
let server: Server;
let url: string;

function write(directory: string, file: string, contents: string) {
  const target = path.join(directory, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}
function build(html: string, files: Record<string, string> = {}) {
  const directory = createSnapshot(root);
  write(directory, "index.html", html);
  for (const [file, contents] of Object.entries(files))
    write(directory, file, contents);
  return directory;
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "aiohub-static-test-"));
  server = createStaticServer(root);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected a TCP address");
  url = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  // 仅删除本用例创建的临时目录。
  const target = path.resolve(root);
  if (
    path.dirname(target) !== path.resolve(os.tmpdir()) ||
    !path.basename(target).startsWith("aiohub-static-test-")
  ) {
    throw new Error("Unexpected cleanup target");
  }
  fs.rmSync(target, { recursive: true, force: true });
});

describe("static frontend serving", () => {
  it("serves history routes and independent HTML entries, with fresh responses after publication", async () => {
    publishSnapshot(
      root,
      build("main-v1", {
        "background-js.html": "background-v1",
        "assets/app-v1.js": "export {}",
      })
    );
    // 真实组件 ID 的原始和编码地址都应刷新到当前 SPA，不能落入文件读取。
    for (const componentId of [
      "chat-area",
      "llm-chat:chat-area",
      "llm-chat%3Achat-area",
    ]) {
      const route = await fetch(
        `${url}/detached-component/${componentId}?config=test`,
        {
          headers: { Accept: "text/html" },
        }
      );
      expect(route.status).toBe(200);
      expect(await route.text()).toBe("main-v1");
      expect(route.headers.get("cache-control")).toBe("no-store");
    }
    expect(await (await fetch(`${url}/background-js.html`)).text()).toBe(
      "background-v1"
    );
    const script = await fetch(`${url}/assets/app-v1.js`, { method: "HEAD" });
    expect(script.headers.get("content-type")).toContain("javascript");
    expect(script.headers.get("content-length")).toBe(
      String("export {}".length)
    );
    expect(await script.text()).toBe("");
    expect(
      (
        await fetch(`${url}/assets/missing.js`, {
          headers: { Accept: "text/html" },
        })
      ).status
    ).toBe(404);
  });

  it("updates on refresh while retaining one previous set of lazy chunks", async () => {
    const first = build("main-v1", {
      "assets/lazy-v1.js": "v1",
      "background-js.html": "old-background",
    });
    publishSnapshot(root, first);
    const second = build("main-v2", { "assets/lazy-v2.js": "v2" });
    publishSnapshot(root, second);
    expect(await (await fetch(url)).text()).toBe("main-v2");
    expect(await (await fetch(`${url}/assets/lazy-v1.js`)).text()).toBe("v1");
    expect((await fetch(`${url}/background-js.html`)).status).toBe(404);
    publishSnapshot(root, build("main-v3"));
    expect(await (await fetch(url)).text()).toBe("main-v3");
    expect(await (await fetch(`${url}/assets/lazy-v2.js`)).text()).toBe("v2");
    expect((await fetch(`${url}/assets/lazy-v1.js`)).status).toBe(404);
    expect(fs.existsSync(first)).toBe(false);
  });

  it("continues serving the published build when the next output is incomplete", async () => {
    publishSnapshot(root, build("working"));
    const incomplete = createSnapshot(root);
    write(incomplete, "assets/partial.js", "partial");
    expect(() => publishSnapshot(root, incomplete)).toThrow("index.html");
    expect(await (await fetch(url)).text()).toBe("working");
    expect((await fetch(`${url}/assets/partial.js`)).status).toBe(404);
  });

  it("rejects traversal, malformed paths, foreign hosts and writes", async () => {
    publishSnapshot(root, build("working"));
    for (const requestPath of [
      "/%2e%2e%5csecret",
      "/assets/%2f..%2f..%2fsecret",
      "/C%3a/secret",
      "/assets/app.js:secret",
      "/assets/app.js%3A%24DATA",
      "/detached-component/llm-chat:chat-area/secret",
    ]) {
      expect(
        (
          await fetch(`${url}${requestPath}`, {
            headers: { Accept: "text/html" },
          })
        ).status
      ).toBe(403);
    }
    expect((await fetch(`${url}/%ZZ`)).status).toBe(400);
    const foreignHostStatus = await new Promise<number | undefined>(
      (resolve, reject) => {
        get(url, { headers: { Host: "example.com" } }, (response) => {
          response.resume();
          resolve(response.statusCode);
        }).on("error", reject);
      }
    );
    expect(foreignHostStatus).toBe(403);
    expect((await fetch(url, { method: "POST" })).status).toBe(405);
  });
});

describe("static build ownership", () => {
  it("keeps watch output across publications and confines cleanup to managed directories", () => {
    const work = createSnapshot(root, "work");
    write(work, "index.html", "watch-output");
    publishSnapshot(root, build("first"));
    publishSnapshot(root, build("second"));
    expect(fs.readFileSync(path.join(work, "index.html"), "utf8")).toBe(
      "watch-output"
    );
    expect(() =>
      removeSnapshot(root, path.join(path.dirname(root), path.basename(work)))
    ).toThrow("越界");
    expect(() => removeSnapshot(root, root)).toThrow();
  });

  it("allows one writer and makes release idempotent across subsequent builds", () => {
    const releaseFirst = acquireBuildLock(root);
    expect(() => acquireBuildLock(root)).toThrow("正在构建");
    releaseFirst();
    const releaseSecond = acquireBuildLock(root);
    releaseFirst();
    expect(() => acquireBuildLock(root)).toThrow("正在构建");
    releaseSecond();
    acquireBuildLock(root)();
  });
});
