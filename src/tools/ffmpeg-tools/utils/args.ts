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

const QUOTE_REQUIRED = /[\s"'$;|&<>()]/;

/**
 * 将命令行参数字符串拆分为 argv。
 *
 * 双引号和单引号分组视为单个参数并去掉最外层引号；双引号内 `\"` 表示字面量
 * `"`，其余反斜杠原样保留（Windows 路径与滤镜表达式依赖此行为）。
 */
export function parseCommandLine(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let hasToken = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quote === '"') {
      if (char === "\\" && input[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (quote === "'") {
      if (char === "'") {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
    } else if (/\s/.test(char)) {
      if (hasToken) {
        args.push(current);
        current = "";
        hasToken = false;
      }
    } else {
      current += char;
      hasToken = true;
    }
  }

  if (hasToken) {
    args.push(current);
  }

  return args;
}

/**
 * 将 argv 序列化回可编辑字符串。仅对空串或含分隔语义的字符加双引号，
 * 并对内部 `"` 转义，保证 `parseCommandLine(serializeCommandLine(x))` 还原 x。
 */
export function serializeCommandLine(args: string[]): string {
  return args
    .map((arg) =>
      arg === "" || QUOTE_REQUIRED.test(arg)
        ? `"${arg.replace(/"/g, '\\"')}"`
        : arg
    )
    .join(" ");
}

/**
 * 将单个 argv 转为 PowerShell 单引号字面量，内部 `'` 通过双写转义。
 */
export function quotePowerShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "''")}'`;
}
