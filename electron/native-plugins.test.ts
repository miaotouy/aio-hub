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
import os from "node:os";
import { fork, execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";
import { NativePlugins, type NativeWorker } from "./native-plugins";
import { resolveNative } from "./plugin-runtime-paths";
let scratch: string,
  root: string,
  binary: string,
  workerFile: string,
  service: NativePlugins;
const processes: NativeWorker[] = [];
beforeAll(async () => {
  scratch = await fs.mkdtemp(path.join(os.tmpdir(), "aio-native-"));
  binary = path.join(
    scratch,
    process.platform === "win32"
      ? "fixture.dll"
      : process.platform === "darwin"
        ? "fixture.dylib"
        : "fixture.so"
  );
  execFileSync(
    "rustc",
    [
      "--crate-type",
      "cdylib",
      "--edition=2021",
      path.resolve("electron/fixtures/native-plugin.rs"),
      "-o",
      binary,
    ],
    { windowsHide: true }
  );
  workerFile = path.join(scratch, "worker.cjs");
  execFileSync(
    "bun",
    [
      "build",
      path.resolve("electron/native-worker.ts"),
      "--outfile",
      workerFile,
      "--target=node",
      "--format=cjs",
      "--external",
      "koffi",
    ],
    { windowsHide: true }
  );
  // External native runtime resolves through the repository's installed dependencies.
  await fs.symlink(
    path.resolve("node_modules"),
    path.join(scratch, "node_modules"),
    process.platform === "win32" ? "junction" : "dir"
  );
}, 30000);
afterAll(async () => {
  await fs.rm(scratch, { recursive: true, force: true });
});
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(scratch, "data-"));
  processes.length = 0;
  service = makeService();
});
afterEach(async () => {
  await service.shutdown();
});
function makeService(
  options: { timeoutMs?: number; unloadTimeoutMs?: number } = {}
) {
  return new NativePlugins({
    root,
    ...options,
    spawnWorker: (spec) => {
      const child = fork(workerFile, [], {
        cwd: spec.directory,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        execArgv: [],
        windowsHide: true,
      });
      const events = new EventEmitter() as NativeWorker;
      Object.defineProperty(events, "pid", { get: () => child.pid });
      events.postMessage = (value) => {
        child.send(value as object);
      };
      events.kill = () => child.kill();
      for (const name of ["message", "spawn", "exit", "error"])
        child.on(name, (...args: unknown[]) => events.emit(name, ...args));
      processes.push(events);
      return events;
    },
  });
}
async function fixture(id = "native-fixture", reloadable = true) {
  const directory = path.join(root, "plugins", id);
  await fs.mkdir(path.join(directory, "bin"), { recursive: true });
  const library = path.join(directory, "bin", path.basename(binary));
  await fs.copyFile(binary, library);
  await fs.writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      id,
      type: "native",
      native: {
        reloadable,
        library: {
          [process.platform + "-" + process.arch]:
            "bin/" + path.basename(binary),
        },
      },
    })
  );
  return {
    pluginId: id,
    installPath: directory,
    libraryPath: library,
    reloadable,
  };
}
function load(args: Record<string, unknown>, owner = 1) {
  return service.run(owner, "load_native_plugin", args);
}
function call(method: string, payload = "", owner = 1, id = "native-fixture") {
  return service.run(owner, "call_native_plugin_method", {
    request: { plugin_id: id, method_name: method, payload },
  });
}
function unload(owner = 1, id = "native-fixture") {
  return service.run(owner, "unload_native_plugin", { pluginId: id });
}
async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
it("loads manifest artifact, round-trips Unicode/concurrent payloads and frees returned memory", async () => {
  await load(await fixture());
  expect(
    await Promise.all([
      call("echo", "你好 🐈"),
      call("echo", "false"),
      call("echo", ""),
    ])
  ).toEqual(["你好 🐈", "false", ""]);
  expect(await call("count")).toBe("3");
  await unload();
  expect(service.hasPendingOperations).toBe(false);
  await load(await fixture());
  expect(await call("count")).toBe("0");
});
it("rejects null, invalid UTF-8, oversized output and NUL input while preserving healthy calls and freeing failures", async () => {
  await load(await fixture());
  await expect(call("null")).rejects.toThrow("空指针");
  await expect(call("invalid")).rejects.toThrow();
  await expect(call("large")).rejects.toThrow("16 MiB");
  await expect(call("echo", "a\0b")).rejects.toThrow("载荷");
  expect(await call("count")).toBe("2");
  expect(await call("echo", "ok")).toBe("ok");
});
it("validates manifest identity, platform library, reloadable policy and real-path redirects before spawning", async () => {
  const args = await fixture();
  await expect(
    load({ ...args, libraryPath: process.execPath })
  ).rejects.toThrow("manifest");
  await expect(load({ ...args, reloadable: false })).rejects.toThrow(
    "manifest"
  );
  await expect(load({ ...args, pluginId: "other" })).rejects.toThrow();
  const file = path.join(args.installPath, "manifest.json"),
    manifest = JSON.parse(await fs.readFile(file, "utf8"));
  manifest.native.library = { other: "bin/fixture.dll" };
  await fs.writeFile(file, JSON.stringify(manifest));
  await expect(load(args)).rejects.toThrow("当前平台");
  manifest.native.library[process.platform + "-" + process.arch] =
    "redirect/" + path.basename(binary);
  await fs.writeFile(file, JSON.stringify(manifest));
  await fs.symlink(
    path.dirname(binary),
    path.join(args.installPath, "redirect"),
    process.platform === "win32" ? "junction" : "dir"
  );
  await expect(
    load({
      ...args,
      libraryPath: path.join(
        args.installPath,
        "redirect",
        path.basename(binary)
      ),
    })
  ).rejects.toThrow();
  expect(processes).toHaveLength(0);
});
it("shares one worker only with leased windows and releases one owner without disrupting its peer", async () => {
  const args = await fixture();
  await Promise.all([load(args), load(args, 2)]);
  expect(processes).toHaveLength(1);
  await expect(call("echo", "foreign", 3)).rejects.toThrow("当前窗口");
  await unload();
  expect(await call("echo", "peer", 2)).toBe("peer");
  await expect(call("echo", "released")).rejects.toThrow("当前窗口");
  await load(args);
  service.disposeOwner(1);
  expect(await call("echo", "still-ready", 2)).toBe("still-ready");
  await unload(2);
  expect(service.hasPendingOperations).toBe(false);
});
it("waits for in-flight calls before unload and permits retry after the unload wait expires", async () => {
  service = makeService({ unloadTimeoutMs: 20 });
  await load(await fixture());
  const pending = call("sleep", "100");
  await expect(unload()).rejects.toThrow("卸载超时");
  expect(await pending).toBe("100");
  expect(await call("echo", "after-timeout")).toBe("after-timeout");
  const final = call("sleep", "5");
  await unload();
  expect(await final).toBe("5");
});
it("keeps nonreloadable libraries loaded until app shutdown and refuses recycle while loaded", async () => {
  const args = await fixture("native-fixture", false);
  await load(args);
  await expect(unload()).rejects.toThrow("重启");
  await expect(
    service.recyclePlugin(args.pluginId, async () => {
      throw Error("should not recycle");
    })
  ).rejects.toThrow("重启");
  service.disposeOwner(1);
  await load(args, 2);
  expect(processes).toHaveLength(1);
  expect(await call("echo", "pinned", 2)).toBe("pinned");
  await service.shutdown();
  expect(service.hasPendingOperations).toBe(false);
});
it("isolates a native crash and allows a clean explicit reload", async () => {
  const args = await fixture();
  await load(args);
  await expect(call("crash")).rejects.toThrow("进程已退出");
  await load(args);
  expect(await call("echo", "reloaded")).toBe("reloaded");
  expect(processes).toHaveLength(2);
});
it("terminates timed-out native calls and shuts down a busy worker", async () => {
  service = makeService({ timeoutMs: 500 });
  const args = await fixture();
  await load(args);
  await expect(call("sleep", "10000")).rejects.toThrow("超时");
  await service.shutdown();
  expect(service.hasPendingOperations).toBe(false);
  service = makeService();
  await load(args);
  const pending = expect(call("sleep", "10000")).rejects.toThrow("已停止");
  await service.shutdown();
  await pending;
  expect(service.hasPendingOperations).toBe(false);
});
it("cancels departing window calls but lets a shared worker finish and answer its peer", async () => {
  const args = await fixture();
  await load(args);
  await load(args, 2);
  const pending = expect(call("sleep", "50")).rejects.toThrow("窗口已离开");
  service.disposeOwner(1);
  await pending;
  expect(await call("echo", "peer", 2)).toBe("peer");
});
it("stops library before recycle and invalidates navigation/shutdown acquisitions queued behind it", async () => {
  const args = await fixture();
  await load(args);
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const recycle = service.recyclePlugin(args.pluginId, async () => {
    await fs.rename(args.libraryPath, args.libraryPath + ".old");
    enter();
    await hold;
  });
  await entered;
  const pending = expect(load(args, 2)).rejects.toThrow("窗口已离开");
  service.disposeOwner(2);
  release();
  await recycle;
  await pending;
  await expect(load(args)).rejects.toThrow();
  const next = await fixture();
  const queued = expect(load(next, 3)).rejects.toThrow("退出");
  await service.shutdown();
  await queued;
});
it("allows development workspace paths only through the explicit host workspace", async () => {
  const args = await fixture();
  const workspace = path.join(scratch, "workspace");
  await fs.mkdir(path.join(workspace, "plugins"), { recursive: true });
  const directory = path.join(workspace, "plugins", "repository-folder");
  await fs.cp(args.installPath, directory, { recursive: true });
  const input = {
    ...args,
    installPath: directory,
    libraryPath: path.join(directory, "bin", path.basename(binary)),
  };
  await expect(resolveNative({ root }, input)).rejects.toThrow("安装目录");
  expect(
    (await resolveNative({ root, workspaceRoot: workspace }, input)).id
  ).toBe(args.pluginId);
});
