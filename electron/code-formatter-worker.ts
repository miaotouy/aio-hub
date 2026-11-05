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

import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runCapturedProcessBytes } from "./process-runner";
const parent = process.parentPort;
const addon = createRequire(import.meta.url)(process.argv[2]!) as {
  formatPhp(code: string, options: string): string;
  formatterPlan(language: string, options: string, scratch: string): string;
};
function hint(engine: string) {
  return engine === "rustfmt"
    ? "请运行 rustup component add rustfmt，或填写 rustfmt 可执行文件的绝对路径"
    : "请安装 LLVM / clang-format，或填写 clang-format 可执行文件的绝对路径";
}
async function receive(message: unknown) {
  const input = message as {
    id: string;
    command: string;
    configuration: string;
    scratch: string;
  };
  try {
    const args = JSON.parse(input.configuration);
    const options = JSON.stringify(args.options ?? {});
    let result: unknown;
    if (input.command === "format_code" && !args.code.trim()) {
      result = "";
    } else if (input.command === "format_code" && args.language === "php") {
      result = addon.formatPhp(args.code, options);
    } else {
      const engine = args.language === "rust" ? "rustfmt" : "clang-format";
      try {
        const plan = JSON.parse(
          addon.formatterPlan(
            args.language,
            input.command === "code_formatter_status"
              ? JSON.stringify({ formatterPath: args.formatterPath })
              : options,
            input.scratch
          )
        );
        const status = input.command === "code_formatter_status";
        if (!status && args.language === "rust")
          await writeFile(path.join(input.scratch, "rustfmt.toml"), "", "utf8");
        const output = await runCapturedProcessBytes(
          plan.executable,
          status ? ["--version"] : plan.args,
          {
            cwd: input.scratch,
            timeoutMs: status ? 5000 : 10000,
            maxOutputBytes: 16 * 1024 * 1024,
            input: status ? "" : args.code,
          }
        );
        const diagnostic = output.stderr.toString("utf8").trim().slice(0, 3000);
        if (output.exitCode !== 0)
          throw Error(engine + " 执行失败: " + diagnostic);
        if (status) {
          const version = output.stdout.toString("utf8").trim();
          if (!version.toLowerCase().includes(engine))
            throw Error(
              "可执行文件未返回有效的 " + engine + " 版本: " + diagnostic
            );
          result = {
            available: true,
            engine,
            version: version.slice(0, 200),
            error: null,
          };
        } else {
          const formatted = new TextDecoder("utf-8", { fatal: true }).decode(
            output.stdout
          );
          if (!formatted.trim())
            throw Error(engine + " 返回了空结果，请检查可执行文件");
          result = formatted;
        }
      } catch (error) {
        const detail =
          (error instanceof Error ? error.message : String(error)) +
          "；" +
          hint(engine);
        if (input.command !== "code_formatter_status") throw Error(detail);
        result = { available: false, engine, version: null, error: detail };
      }
    }
    const reply = { id: input.id, ok: true, result };
    if (parent) parent.postMessage(reply);
    else process.send?.(reply);
  } catch (error) {
    const reply = {
      id: input.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    if (parent) parent.postMessage(reply);
    else process.send?.(reply);
  }
}
// The host serializes requests; input/output and native arenas are scoped to one job.
if (parent)
  parent.on("message", (event) => {
    void receive(event.data);
  });
else
  process.on("message", (message) => {
    void receive(message);
  });
