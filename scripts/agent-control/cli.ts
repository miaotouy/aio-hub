#!/usr/bin/env bun
import net from "node:net";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  MAX_REQUEST_BYTES,
  MAX_REPLY_BYTES,
  type ControlManifest,
  type ControlCommand,
  type ControlReply,
} from "../../src/services/agent-control/protocol";

class CliError extends Error {}

export async function discover(
  directory = path.join(os.homedir(), ".aiohub", "control")
): Promise<ControlManifest[]> {
  const found: ControlManifest[] = [];
  for (const entry of await fs.readdir(directory).catch(() => [] as string[])) {
    if (!/^\d+\.json$/.test(entry)) continue;
    try {
      const m = JSON.parse(
        await fs.readFile(path.join(directory, entry), "utf8")
      ) as ControlManifest;
      if (
        m.protocolVersion !== 1 ||
        !Number.isInteger(m.pid) ||
        typeof m.endpoint !== "string" ||
        typeof m.token !== "string"
      )
        continue;
      process.kill(m.pid, 0);
      found.push(m);
    } catch {
      /* stale instance / inaccessible descriptor */
    }
  }
  return found;
}
export function send(
  manifest: ControlManifest,
  command: ControlCommand,
  window = "main"
): Promise<ControlReply> {
  const text =
    JSON.stringify({
      id: randomUUID(),
      token: manifest.token,
      window,
      command,
    }) + "\n";
  if (Buffer.byteLength(text) > MAX_REQUEST_BYTES)
    return Promise.reject(new CliError("指令超过容量限制。"));
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(manifest.endpoint);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new CliError("连接超时；请先观察当前界面，避免重复执行。"));
    }, 18000);
    let data = Buffer.alloc(0);
    let done = false;
    socket.once("connect", () => socket.write(text));
    socket.on("data", (chunk) => {
      data = Buffer.concat([data, chunk]);
      if (data.length > MAX_REPLY_BYTES + 1) {
        done = true;
        socket.destroy();
        reject(new CliError("回复超过容量限制。"));
        return;
      }
      const newline = data.indexOf(10);
      if (newline < 0) return;
      done = true;
      try {
        resolve(JSON.parse(data.subarray(0, newline).toString("utf8")));
      } catch {
        reject(new CliError("控制回复格式无效。"));
      }
      socket.end();
    });
    socket.on("error", () =>
      reject(
        new CliError(
          "连接失败，请在应用的设置 → 日志与诊断中开启本机调试接管。"
        )
      )
    );
    socket.on("close", () => {
      clearTimeout(timer);
      if (!done)
        reject(new CliError("连接已关闭；如指令有副作用，请先确认当前状态。"));
    });
  });
}
const help = `aiohubctl <instances|windows|observe|inspect|click|fill|select|press|scroll|navigate|state|diagnostics|mark|export|actions|action>
  --pid <进程号>             多实例时选择目标，默认仅在唯一实例时连接
  --window <窗口标签>        默认 main；windows 查看可用窗口
  --data-dir <应用数据目录>  直接读取该目录的 control.json
  --ref e12 --snapshot <id>  使用 observe 返回的短期引用
  --css <唯一选择器>         按 CSS 定位，用于滚动/布局排查
  --text <内容>              fill；--value <值> 用于原生 select
  --key <按键>               press（页面键盘事件）
  --delta-y <像素> --delta-x <像素>  scroll
  --path /llm-chat           navigate
  --tool <id> --method <名称> --args '<JSON对象>'  action
  --out <文件路径>           export 保存当前观察和滚动/布局记录
  --stdin                    从标准输入读取 JSON 指令，可避免内容进入 shell 历史
示例：
  aiohubctl observe
  aiohubctl inspect --css .sessions-list
  aiohubctl export --out evidence.json`;
export async function main(argv: string[]) {
  if (!argv.length || argv.includes("--help")) {
    console.log(help);
    return;
  }
  const [op, ...options] = argv;
  const allowed = new Set([
    "instances",
    "windows",
    "observe",
    "inspect",
    "click",
    "fill",
    "select",
    "press",
    "scroll",
    "navigate",
    "state",
    "diagnostics",
    "mark",
    "export",
    "actions",
    "action",
  ]);
  if (!allowed.has(op)) throw new CliError("未知命令，使用 --help 查看用法。");
  const flags = new Map<string, string>();
  const known = new Set([
    "--pid",
    "--window",
    "--data-dir",
    "--ref",
    "--snapshot",
    "--css",
    "--text",
    "--value",
    "--key",
    "--delta-y",
    "--delta-x",
    "--path",
    "--limit",
    "--tool",
    "--method",
    "--args",
    "--out",
    "--stdin",
  ]);
  for (let i = 0; i < options.length; i++) {
    const key = options[i];
    if (!known.has(key) || flags.has(key))
      throw new CliError("选项无效或重复，请使用 --help 查看用法。");
    if (key === "--stdin") {
      flags.set(key, "true");
      continue;
    }
    const value = options[++i];
    if (value === undefined || value.startsWith("--"))
      throw new CliError(`缺少参数：${key}`);
    flags.set(key, value);
  }
  let instances: ControlManifest[];
  if (flags.has("--data-dir")) {
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(flags.get("--data-dir")!, "control.json"),
        "utf8"
      )
    );
    if (
      manifest.protocolVersion !== 1 ||
      typeof manifest.endpoint !== "string" ||
      typeof manifest.token !== "string"
    )
      throw new CliError("控制连接文件无效。");
    instances = [manifest];
  } else instances = await discover();
  if (op === "instances") {
    const alive = await Promise.all(
      instances.map(async (m) => {
        try {
          const reply = await send(m, { op: "windows" });
          return reply.ok
            ? {
                pid: m.pid,
                host: m.host,
                dataDir: m.dataDir,
                windows: reply.result,
              }
            : null;
        } catch {
          return null;
        }
      })
    );
    console.log(JSON.stringify(alive.filter(Boolean), null, 2));
    return;
  }
  const targets = flags.has("--pid")
    ? instances.filter((m) => String(m.pid) === flags.get("--pid"))
    : instances;
  if (targets.length !== 1)
    throw new CliError(
      targets.length
        ? "发现多个实例，请用 --pid 选择目标。"
        : "未找到目标实例，请在应用设置 → 日志与诊断中开启本机调试接管。"
    );
  let command: ControlCommand = { op };
  if (flags.has("--stdin")) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_REQUEST_BYTES) throw new CliError("指令超过容量限制。");
      chunks.push(bytes);
    }
    const input = Buffer.concat(chunks).toString("utf8");
    command = JSON.parse(input);
    if (command.op !== op) throw new CliError("标准输入 op 需要与命令一致。");
  } else {
    const mapping: Record<string, keyof ControlCommand> = {
      "--ref": "ref",
      "--snapshot": "snapshotId",
      "--css": "css",
      "--text": "text",
      "--value": "value",
      "--key": "key",
      "--path": "path",
      "--tool": "tool",
      "--method": "method",
    };
    for (const [flag, key] of Object.entries(mapping))
      if (flags.has(flag)) Object.assign(command, { [key]: flags.get(flag) });
    for (const [flag, key] of [
      ["--delta-y", "deltaY"],
      ["--delta-x", "deltaX"],
      ["--limit", "limit"],
    ])
      if (flags.has(flag)) {
        const value = Number(flags.get(flag));
        if (!Number.isFinite(value))
          throw new CliError(`${flag} 需要有限数值。`);
        Object.assign(command, { [key]: value });
      }
    if (flags.has("--args")) {
      command.args = JSON.parse(flags.get("--args")!);
      if (
        !command.args ||
        Array.isArray(command.args) ||
        typeof command.args !== "object"
      )
        throw new CliError("args 需要 JSON 对象。");
    }
  }
  const target = targets[0];
  const window = flags.get("--window") || "main";
  if (op === "export") {
    if (!flags.has("--out")) throw new CliError("export 需要 --out 指定文件。");
    const recording = await send(target, { op: "mark" }, window);
    const observation = await send(target, { op: "observe" }, window);
    if (!recording.ok || !observation.ok)
      throw new CliError("现场采集失败，请先确认目标窗口已就绪。");
    const out = path.resolve(flags.get("--out")!);
    await fs.writeFile(
      out,
      JSON.stringify(
        {
          version: 1,
          capturedAt: new Date().toISOString(),
          host: target.host,
          pid: target.pid,
          window,
          recording: recording.result,
          observation: observation.result,
        },
        null,
        2
      ),
      { flag: "wx" }
    );
    console.log(JSON.stringify({ saved: out }));
    return;
  }
  const reply = await send(target, command, window);
  console.log(JSON.stringify(reply, null, 2));
  if (!reply.ok) process.exitCode = 1;
}
if (import.meta.main)
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(
      error instanceof CliError
        ? error.message
        : "命令失败，请检查 JSON 格式、连接文件与输出路径；使用 --help 查看用法。"
    );
    process.exitCode = 1;
  });
