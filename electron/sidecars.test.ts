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
import { beforeEach, afterEach, expect, it } from "vitest";
import { Sidecars } from "./sidecars";
let directory: string, root: string, service: Sidecars;
let events: { owner: number; event: string; payload: any }[];
const worker = `
const fs = require('node:fs');
const {spawn} = require('node:child_process');
const readline = require('node:readline');
function out(value) { process.stdout.write(JSON.stringify(value)+'\\n'); }
function work(input) {
 const p=input.params||{};
 if(input.method==='hang') return;
 if(input.method==='crash') process.exit(7);
 if(input.method==='shutdown') { fs.writeFileSync('shutdown.txt','saved'); process.exit(0); }
 if(input.method==='forward') { out({type:'forward',id:input.id,target:p.target,method:'echo',params:p}); return; }
 if(input.type==='event'&&input.event==='forward_result') { out({id:input.data.id,type:'result',data:input.data}); return; }
 if(input.method==='child') { const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true}); out({id:input.id,type:'result',data:{pid:child.pid}}); return; }
 if(input.method==='event') out({type:'event',event:'status',data:{value:p.value}});
 out({id:input.id,type:'progress',data:{percent:50}});
 const data={...p,pid:process.pid,cwd:process.cwd(),dataDir:process.env.AIOHUB_PLUGIN_DATA_DIR};
 setTimeout(()=>{out({id:input.id,type:'result',data}); if(!input.id)process.exit(input.method==='fail'?9:0);},p.delay||0);
}
if(process.argv[2]==='oneshot') {
 let text=''; process.stdin.on('data',part=>text+=part);process.stdin.on('end',()=>{process.stderr.write('diagnostic log\\n');work(JSON.parse(text));});
} else readline.createInterface({input:process.stdin}).on('line',line=>work(JSON.parse(line)));
`;
async function fixture(id = "fixture", mode = "resident") {
  const folder = path.join(root, "plugins", id);
  await fs.mkdir(path.join(folder, "bin"), { recursive: true });
  const executable = path.join(folder, "bin", path.basename(process.execPath));
  await fs
    .link(process.execPath, executable)
    .catch(() => fs.copyFile(process.execPath, executable));
  await fs.writeFile(path.join(folder, "worker.cjs"), worker);
  const args = ["worker.cjs", mode];
  const value = {
    id,
    type: "sidecar",
    sidecar: {
      resident: mode === "resident",
      executable: {
        [`${process.platform}-${process.arch}`]:
          "bin/" + path.basename(executable),
      },
      args,
    },
  };
  await fs.writeFile(path.join(folder, "manifest.json"), JSON.stringify(value));
  return {
    pluginId: id,
    executablePath: executable,
    installPath: folder,
    args,
  };
}
const send = async (
  method: string,
  params: unknown = {},
  owner = 1,
  id = "fixture"
) =>
  JSON.parse(
    (await service.run(owner, "sidecar_send_command", {
      pluginId: id,
      method,
      params,
    })) as string
  );
const spawn = (spec: Record<string, unknown>, owner = 1) =>
  service.run(owner, "sidecar_spawn_resident", spec);
const oneshot = (
  spec: Awaited<ReturnType<typeof fixture>>,
  method: string,
  params = {}
) =>
  service.run(1, "execute_sidecar", {
    request: {
      plugin_id: spec.pluginId,
      install_path: spec.installPath,
      executable_path: spec.executablePath,
      args: spec.args,
      input: JSON.stringify({ method, params }),
    },
  });
const alive = async (pid: number) => {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  if (process.platform !== "linux") return true;
  try {
    const stat = await fs.readFile("/proc/" + pid + "/stat", "utf8");
    const closingParen = stat.lastIndexOf(")");
    const state = stat.slice(closingParen + 2, closingParen + 3);
    return state !== "Z" && state !== "X";
  } catch {
    return false;
  }
};
const waitForExit = async (pid: number) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!(await alive(pid))) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return !(await alive(pid));
};
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-sidecars-"));
  root = path.join(directory, "app");
  await fs.mkdir(root);
  events = [];
  service = new Sidecars({
    root,
    commandTimeoutMs: 5000,
    shutdownGraceMs: 200,
    emit: (owner, event, payload) => events.push({ owner, event, payload }),
  });
});
afterEach(async () => {
  await service.shutdown();
  await fs.rm(directory, { recursive: true, force: true });
});

it("runs a one-shot process with JSON input, Unicode, manifest cwd and isolated plugin data", async () => {
  const spec = await fixture("fixture", "oneshot");
  const response = JSON.parse(
    (await oneshot(spec, "echo", { value: "中文 😀" })) as string
  );
  expect(response.data).toMatchObject({
    value: "中文 😀",
    cwd: spec.installPath,
    dataDir: path.join(root, "plugins-data/fixture"),
  });
  expect(events.some((event) => event.payload.event_type === "progress")).toBe(
    true
  );
  expect(
    events.some(
      (event) =>
        event.payload.event_type === "log" &&
        event.payload.data === "diagnostic log"
    )
  ).toBe(true);
  expect(
    events.every(
      (event) => event.owner === 1 && event.event === "sidecar-output"
    )
  ).toBe(true);
  expect(await alive(response.data.pid)).toBe(false);
});
it("rejects a nonzero one-shot exit even after a result was printed", async () => {
  const spec = await fixture("fixture", "oneshot");
  await expect(oneshot(spec, "fail")).rejects.toThrow("退出码: 9");
});
it("checks the manifest binary, arguments and symlink boundary before starting a process", async () => {
  const spec = await fixture();
  await expect(
    spawn({ ...spec, args: ["-e", "process.exit(0)"] })
  ).rejects.toThrow("参数");
  await expect(
    spawn({ ...spec, executablePath: process.execPath })
  ).rejects.toThrow("不匹配");
  const outside = path.join(directory, "outside");
  await fs.mkdir(outside);
  await fs.rename(
    path.join(spec.installPath, "bin"),
    path.join(outside, "bin")
  );
  await fs.symlink(
    path.join(outside, "bin"),
    path.join(spec.installPath, "bin"),
    process.platform === "win32" ? "junction" : "dir"
  );
  await expect(spawn(spec)).rejects.toThrow("重定向");
  expect(events).toEqual([]);
});
it("matches concurrent resident results by ID while routing generation-scoped progress and events", async () => {
  const generation = await spawn(await fixture());
  const [slow, fast] = await Promise.all([
    send("echo", { value: "slow", delay: 40 }),
    send("event", { value: "fast" }),
  ]);
  expect(slow.data.value).toBe("slow");
  expect(fast.data.value).toBe("fast");
  expect(events.some(({ payload }) => payload.event_type === "result")).toBe(
    false
  );
  expect(events.some(({ payload }) => payload.event_name === "status")).toBe(
    true
  );
  expect(
    events.every(
      ({ owner, payload }) =>
        owner === 1 && payload.generation_id === generation
    )
  ).toBe(true);
});
it("shares a resident process but cancels only a removed window's pending requests", async () => {
  const spec = await fixture();
  const generation = await spawn(spec);
  expect(await spawn(spec, 2)).toBe(generation);
  const pending = send("hang").catch((error: Error) => error);
  await send("echo", {}, 2);
  service.disposeOwner(1);
  expect(await pending).toMatchObject({
    message: expect.stringContaining("取消"),
  });
  const reply = await send("echo", { value: 2 }, 2);
  await expect(send("echo", {}, 3)).rejects.toThrow("当前窗口");
  await service.run(2, "sidecar_kill_resident", { pluginId: spec.pluginId });
  expect(await alive(reply.data.pid)).toBe(false);
  expect(
    await fs.readFile(path.join(spec.installPath, "shutdown.txt"), "utf8")
  ).toBe("saved");
});
it("rejects pending commands on crash and starts a fresh generation for later calls", async () => {
  const spec = await fixture();
  const first = await spawn(spec);
  await expect(send("crash")).rejects.toThrow("退出");
  expect(await spawn(spec)).not.toBe(first);
  expect((await send("echo", { value: "recovered" })).data.value).toBe(
    "recovered"
  );
  expect(
    events.some(
      ({ payload }) =>
        payload.event_type === "exit" && payload.generation_id === first
    )
  ).toBe(true);
});
it("times out a resident command and kills its process tree", async () => {
  await service.shutdown();
  service = new Sidecars({ root, commandTimeoutMs: 600, emit: () => {} });
  await spawn(await fixture());
  const child = (await send("child")).data.pid;
  await expect(send("hang")).rejects.toThrow("命令执行超时");
  await service.shutdown();
  expect(await waitForExit(child)).toBe(true);
});
it("forwards Broker requests only between sidecars acquired by the same window", async () => {
  await spawn(await fixture());
  await spawn(await fixture("target"));
  const response = await send("forward", { target: "target", value: "bridge" });
  expect(response.data).toMatchObject({
    targetId: "target",
    result: { value: "bridge" },
    error: null,
  });
  await spawn(await fixture("private"), 2);
  const denied = await send("forward", { target: "private" });
  expect(denied.data.error).toContain("当前窗口");
});
it("stops running work before recycling the plugin and prevents a queued restart", async () => {
  const spec = await fixture();
  await spawn(spec);
  const result = await send("echo");
  const recycled = service.recyclePlugin("fixture", async () => {
    await fs.rename(spec.installPath, path.join(directory, "recycled"));
  });
  const restart = spawn(spec).catch((error: Error) => error);
  await recycled;
  expect(await alive(result.data.pid)).toBe(false);
  expect(await restart).toBeInstanceOf(Error);
});
it("cancels one-shot work on window exit and prevents late acquisition during app shutdown", async () => {
  const spec = await fixture("fixture", "oneshot");
  const pending = oneshot(spec, "hang").catch((error: Error) => error);
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (events.length) {
        clearInterval(timer);
        resolve();
      }
    }, 5);
  });
  service.disposeOwner(1);
  expect(await pending).toMatchObject({
    message: expect.stringContaining("取消"),
  });
  const resident = await fixture("late");
  const starting = spawn(resident).catch((error: Error) => error);
  await service.shutdown();
  expect(await starting).toBeInstanceOf(Error);
  expect(service.hasPendingOperations).toBe(false);
});
