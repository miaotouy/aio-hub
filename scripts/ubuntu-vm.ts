import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ControlError, errorResult } from "./dev-control/errors";

const root = fileURLToPath(new URL("../", import.meta.url));
const host = process.env.AIO_VM_SSH_HOST || "ubuntu-vm";
const repo = process.env.AIO_VM_REPO || "/home/mty/aio-hub-Ubuntu";
const shared =
  process.env.AIO_VM_SHARED_REPO || "/mnt/hgfs/CodexShared/aio-hub-Ubuntu";
const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
async function run(args: string[], capture = true, input?: string) {
  const child = Bun.spawn(args, {
    cwd: root,
    stdin: input === undefined ? "ignore" : "pipe",
    stdout: capture ? "pipe" : "inherit",
    stderr: "inherit",
    windowsHide: true,
  });
  if (input !== undefined) {
    child.stdin?.write(input);
    child.stdin?.end();
  }
  const output = capture ? await new Response(child.stdout).text() : "";
  if (await child.exited) {
    let result:
      | {
          error?: {
            code: string;
            message: string;
            hint?: string;
            details?: unknown;
          };
        }
      | undefined;
    try {
      result = JSON.parse(output);
    } catch {
      /* Non-JSON SSH diagnostics are on stderr. */
    }
    if (result?.error)
      throw new ControlError(
        result.error.code,
        result.error.message,
        result.error.hint,
        result.error.details
      );
    throw new ControlError(
      "COMMAND_FAILED",
      "虚拟机命令失败。",
      "查看上述 SSH 或启动错误。"
    );
  }
  return output;
}
async function main() {
  const [command, ...args] = process.argv.slice(2).filter((v) => v !== "--");
  if (!command || command === "--help")
    return {
      help: "bun run dev:vm -- <doctor|sync|start|status|stop|control|input|vm-start> [...args]；start/status/stop 接受 --instance；control 接 Dev Control 操作。",
    };
  if (!/^[a-zA-Z0-9_.-]+$/.test(host) || host.startsWith("-"))
    throw new ControlError("INVALID_REQUEST", "SSH 别名无效。");
  if (!path.posix.isAbsolute(repo) || !path.posix.isAbsolute(shared))
    throw new ControlError("INVALID_REQUEST", "虚拟机目录需要绝对路径。");
  if (command === "vm-start") {
    if (args.length && (args.length !== 2 || args[0] !== "--vmx"))
      throw new ControlError("INVALID_REQUEST", "vm-start 使用 --vmx <路径>。");
    return JSON.parse(
      await run([
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(root, "scripts", "ubuntu-vm-start.ps1"),
        "-Vmx",
        args[1] || process.env.AIO_VM_VMX || "",
      ])
    );
  }
  const prefix =
    'export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"; cd ' +
    quote(repo) +
    " && ";
  let script: string;
  if (command === "sync") {
    if (args.length)
      throw new ControlError(
        "INVALID_REQUEST",
        "sync 使用当前宿主工作区分支，无附加参数。"
      );
    const branch = (await run(["git", "branch", "--show-current"])).trim();
    if (!branch)
      throw new ControlError("INVALID_REQUEST", "宿主工作区需要命名分支。");
    script =
      prefix +
      '[ -z "$(git status --porcelain)" ] || { echo "Guest checkout has local changes; sync stopped." >&2; exit 1; }; ' +
      '[ "$(git branch --show-current)" = ' +
      quote(branch) +
      " ] || exit 1; git fetch " +
      quote(shared) +
      " " +
      quote(branch) +
      " && git merge --ff-only FETCH_HEAD";
    await run(["ssh", "-o", "BatchMode=yes", host, script], false);
    return { ok: true, synced: true };
  }
  if (command === "doctor") {
    script =
      prefix +
      'printf "Repository: "; pwd; git status --short --branch; for tool in bun node cargo rustc; do command -v "$tool" >/dev/null && "$tool" --version || true; done; pkg-config --modversion gtk+-3.0 webkit2gtk-4.1 2>/dev/null || true; test -d /run/user/$(id -u) && echo "Desktop runtime directory present"';
    await run(["ssh", "-o", "BatchMode=yes", host, script], false);
    return { ok: true };
  }
  if (command === "input") {
    if (args.length !== 1 || args[0] !== "--stdin")
      throw new ControlError(
        "INVALID_REQUEST",
        "input 使用 --stdin 接收客体桌面输入批次。"
      );
    const input = await Bun.stdin.text();
    if (Buffer.byteLength(input) > 65_536)
      throw new ControlError(
        "INVALID_REQUEST",
        "客体桌面输入 JSON 超过 64 KiB。"
      );
    return JSON.parse(
      await run(
        [
          "ssh",
          "-o",
          "BatchMode=yes",
          host,
          prefix + "python3 scripts/dev-control/mutter-input.py --stdin",
        ],
        true,
        input
      )
    );
  }
  if (!["start", "status", "stop", "control"].includes(command))
    throw new ControlError("INVALID_REQUEST", "未知虚拟机命令。");
  const remoteArgs =
    command === "control"
      ? ["bun", "scripts/dev-control/cli.ts", ...args]
      : ["bun", "scripts/dev-control/runtime.ts", command, ...args];
  const input =
    command === "control" && args.includes("--stdin")
      ? await Bun.stdin.text()
      : undefined;
  if (input !== undefined && Buffer.byteLength(input) > 2_000_000)
    throw new ControlError("INVALID_REQUEST", "输入 JSON 超过 2 MB。");
  const result = JSON.parse(
    await run(
      [
        "ssh",
        "-o",
        "BatchMode=yes",
        host,
        prefix + remoteArgs.map(quote).join(" "),
      ],
      true,
      input
    )
  );
  const artifacts =
    path.posix.join(repo, ".dev-data/dev-control/artifacts") + "/";
  const mapArtifacts = async (value: unknown): Promise<void> => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) await mapArtifacts(item);
      return;
    }
    const object = value as Record<string, unknown>;
    if (typeof object.path === "string" && object.path.startsWith(artifacts)) {
      const remote = object.path;
      const relative = remote.slice(artifacts.length);
      if (
        !/^[a-f0-9-]{36}\/screenshot-[a-zA-Z0-9-]+\.png$/.test(relative) ||
        path.posix.normalize(remote) !== remote
      )
        throw new ControlError("INVALID_ARTIFACT", "截图路径超出允许范围。");
      const local = path.join(
        root,
        ".dev-data/dev-control/artifacts",
        relative
      );
      await fs.mkdir(path.dirname(local), { recursive: true });
      await run(["scp", "-q", host + ":" + remote, local]);
      object.guestPath = remote;
      object.path = local;
    }
    for (const item of Object.values(object)) await mapArtifacts(item);
  };
  await mapArtifacts(result);
  if (result?.ok === false) process.exitCode = 1;
  return result;
}
try {
  console.log(JSON.stringify(await main(), null, 2));
} catch (error) {
  console.log(
    JSON.stringify({ ok: false, error: errorResult(error) }, null, 2)
  );
  process.exitCode = 1;
}
