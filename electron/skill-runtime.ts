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
import { constants } from "node:fs";
import path from "node:path";
import type { CapturedProcess } from "./process-runner";
import { skillPath } from "./skill-files";
import type {
  RuntimeSettings,
  SkillManifest,
  SkillScriptResult,
} from "../src/tools/skill-manager/types";

/** Argument tokenization only; shell operators remain literal arguments. */
export function splitSkillArguments(value: string): string[] {
  const result: string[] = [];
  let current = "",
    quote = "",
    started = false;
  if (value.includes("\0")) throw new Error("脚本参数包含无效字符");
  for (let index = 0; index < value.length; index++) {
    const c = value[index];
    if (c === "\\" && value[index + 1] === '"' && quote !== "'") {
      current += value[++index];
      started = true;
    } else if (quote) {
      if (c === quote) quote = "";
      else current += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      started = true;
    } else if (/\s/.test(c)) {
      if (started) {
        result.push(current);
        current = "";
        started = false;
      }
    } else {
      current += c;
      started = true;
    }
  }
  if (quote) throw new Error("脚本参数的引号未闭合");
  if (started) result.push(current);
  return result;
}
async function executableAvailable(
  name: string,
  platform: NodeJS.Platform
): Promise<boolean> {
  const candidates = path.isAbsolute(name)
    ? [name]
    : (process.env.PATH ?? "").split(path.delimiter).flatMap((base) => {
        const file = path.join(base.replace(/^"|"$/g, ""), name);
        return platform === "win32"
          ? [
              file,
              ...(process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
                .split(";")
                .map((ext) => file + ext.toLowerCase()),
            ]
          : [file];
      });
  for (const file of candidates)
    try {
      if ((await fs.stat(file)).isFile()) {
        await fs.access(
          file,
          platform === "win32" ? constants.F_OK : constants.X_OK
        );
        return true;
      }
    } catch {
      /* Try the next candidate. */
    }
  return false;
}
export async function executeSkillScript(
  manifest: SkillManifest,
  args: Record<string, unknown>,
  run: CapturedProcess,
  signal: AbortSignal,
  platform: NodeJS.Platform
): Promise<SkillScriptResult> {
  if (typeof args.scriptName !== "string" || !args.scriptName)
    throw new Error("请选择技能脚本");
  const base = await skillPath(manifest.basePath, "scripts");
  const script = await skillPath(base, args.scriptName.replaceAll("\\", "/"));
  if (!(await fs.stat(script)).isFile()) throw new Error("技能脚本不存在");
  const extension = path.extname(script).toLowerCase();
  const settings = (args.runtimeSettings ?? {}) as Partial<RuntimeSettings>;
  let configured: unknown,
    candidates: string[],
    prefix: string[] = [];
  if ([".js", ".ts"].includes(extension)) {
    configured = settings.javascript?.command;
    candidates = ["bun", "node"];
  } else if (extension === ".py") {
    configured = settings.python?.command;
    candidates =
      platform === "win32" ? ["python", "python3"] : ["python3", "python"];
  } else if ([".sh", ".bash"].includes(extension)) {
    configured = settings.shell?.command;
    candidates = ["bash", "sh"];
  } else if (extension === ".ps1") {
    configured = settings.powershell?.command;
    candidates =
      platform === "win32" ? ["powershell", "pwsh"] : ["pwsh", "powershell"];
    prefix = ["-NoLogo", "-NoProfile", "-NonInteractive", "-File"];
  } else throw new Error("不支持的脚本类型: " + extension);
  let command = typeof configured === "string" ? configured.trim() : "";
  if (!command)
    for (const candidate of candidates)
      if (await executableAvailable(candidate, platform)) {
        command = candidate;
        break;
      }
  if (!command)
    throw new Error(
      "未检测到技能脚本运行时，请在技能设置中配置 " + candidates.join(" / ")
    );
  const seconds = args.timeoutSecs == null ? 60 : Number(args.timeoutSecs);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 1800)
    throw new Error("脚本超时需为 1–1800 秒");
  if (args.args != null && typeof args.args !== "string")
    throw new Error("脚本参数需为文本");
  const env: Record<string, string> = Object.create(null);
  if (args.envVars != null) {
    if (typeof args.envVars !== "object" || Array.isArray(args.envVars))
      throw new Error("脚本环境变量格式无效");
    for (const [key, value] of Object.entries(args.envVars)) {
      if (
        !key ||
        /[=\0]/.test(key) ||
        typeof value !== "string" ||
        value.includes("\0")
      )
        throw new Error("脚本环境变量格式无效");
      env[key] = value;
    }
  }
  const started = Date.now();
  const result = await run(
    command,
    [...prefix, script, ...splitSkillArguments((args.args as string) ?? "")],
    {
      cwd: manifest.basePath,
      env,
      timeoutMs: seconds * 1000,
      maxOutputBytes: 4 * 1024 ** 2,
      signal,
    }
  );
  return {
    success: result.exitCode === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: Date.now() - started,
  };
}
