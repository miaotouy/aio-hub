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

export type ParamScope = "global" | "input" | "output";

export interface ParamBlock {
  id: string;
  scope: ParamScope;
  key: string;
  value?: string;
  enabled: boolean;
  raw?: string;
}

const VALUELESS_SWITCHES = new Set([
  "-vn",
  "-an",
  "-y",
  "-n",
  "-shortest",
  "-copyts",
  "-start_at_zero",
  "-nostdin",
  "-re",
  "-benchmark",
  "-stats",
  "-nostats",
  "-hide_banner",
  "-ignore_unknown",
  "-accurate_seek",
  "-noaccurate_seek",
]);

let idCounter = 0;

export function createParamBlockId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `param-block-${idCounter}`;
}

const NEGATIVE_NUMBER = /^-\d/;

/**
 * 将 argv 拆成有序积木：选项与其值成对，无值开关独立成块，
 * 未识别的裸 token 作为原始积木保留。
 */
export function parseArgsToBlocks(
  args: string[],
  scope: ParamScope
): ParamBlock[] {
  const blocks: ParamBlock[] = [];
  let i = 0;

  while (i < args.length) {
    const token = args[i];

    if (token.startsWith("-")) {
      if (VALUELESS_SWITCHES.has(token)) {
        blocks.push(createParamBlock(scope, token));
        i += 1;
        continue;
      }

      const next = args[i + 1];
      if (next !== undefined && (!next.startsWith("-") || NEGATIVE_NUMBER.test(next))) {
        blocks.push(createParamBlock(scope, token, next));
        i += 2;
        continue;
      }

      blocks.push(createParamBlock(scope, token));
      i += 1;
      continue;
    }

    blocks.push({
      id: createParamBlockId(),
      scope,
      key: token,
      enabled: true,
      raw: token,
    });
    i += 1;
  }

  return blocks;
}

export function blocksToArgs(blocks: ParamBlock[]): string[] {
  const args: string[] = [];
  for (const block of blocks) {
    if (!block.enabled) continue;
    if (block.raw !== undefined) {
      args.push(block.raw);
      continue;
    }
    args.push(block.key);
    if (block.value !== undefined) {
      args.push(block.value);
    }
  }
  return args;
}

export function createParamBlock(
  scope: ParamScope,
  key: string,
  value?: string
): ParamBlock {
  return {
    id: createParamBlockId(),
    scope,
    key,
    value,
    enabled: true,
  };
}

export function hasRawBlocks(blocks: ParamBlock[]): boolean {
  return blocks.some((block) => block.raw !== undefined);
}
