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

import { describe, expect, it } from "vitest";
import {
  blocksToArgs,
  createParamBlock,
  hasRawBlocks,
  parseArgsToBlocks,
} from "../utils/paramBlocks";

describe("parseArgsToBlocks", () => {
  it("将选项与其值配成一对", () => {
    const blocks = parseArgsToBlocks(
      ["-crf", "23", "-preset", "slow"],
      "output"
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ key: "-crf", value: "23", enabled: true });
    expect(blocks[1]).toMatchObject({ key: "-preset", value: "slow" });
    expect(blocks[0].raw).toBeUndefined();
  });

  it("已知无值开关不消费后续选项", () => {
    const blocks = parseArgsToBlocks(
      ["-hide_banner", "-c:v", "libx264", "-vn"],
      "global"
    );

    expect(blocks.map((block) => block.key)).toEqual([
      "-hide_banner",
      "-c:v",
      "-vn",
    ]);
    expect(blocks[0].value).toBeUndefined();
    expect(blocks[1].value).toBe("libx264");
    expect(blocks[2].value).toBeUndefined();
  });

  it("负数值作为上一个选项的值", () => {
    const blocks = parseArgsToBlocks(["-vf", "-1"], "input");

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ key: "-vf", value: "-1" });
  });

  it("含空格的滤镜表达式保持为单个值", () => {
    const argv = ["-vf", "drawtext=text='Hello World':x=10"];
    const blocks = parseArgsToBlocks(argv, "output");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].value).toBe("drawtext=text='Hello World':x=10");
  });

  it("重复的 -map 生成顺序独立的积木", () => {
    const blocks = parseArgsToBlocks(
      ["-map", "0:v", "-map", "1:a", "-map", "0:a"],
      "output"
    );

    expect(blocks.map((block) => `${block.key} ${block.value}`)).toEqual([
      "-map 0:v",
      "-map 1:a",
      "-map 0:a",
    ]);
  });

  it("未识别的裸 token 生成 raw 积木", () => {
    const blocks = parseArgsToBlocks(["-c:v", "libx264", "orphan"], "output");

    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({
      key: "orphan",
      raw: "orphan",
      enabled: true,
    });
    expect(hasRawBlocks(blocks)).toBe(true);
  });
});

describe("blocksToArgs", () => {
  it("跳过禁用积木但保留顺序与重复", () => {
    const blocks = parseArgsToBlocks(
      ["-map", "0:v", "-map", "1:a", "-an"],
      "output"
    );
    blocks[0].enabled = false;

    expect(blocksToArgs(blocks)).toEqual(["-map", "1:a", "-an"]);
  });

  it("raw 积木输出原始 token", () => {
    const blocks = parseArgsToBlocks(["-c:v", "libx264", "orphan"], "output");

    expect(blocksToArgs(blocks)).toEqual(["-c:v", "libx264", "orphan"]);
  });

  it("无值开关只输出 key", () => {
    const block = createParamBlock("global", "-hide_banner");

    expect(blocksToArgs([block])).toEqual(["-hide_banner"]);
  });

  it("enabled 积木可无损往返", () => {
    const argv = [
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-c:v",
      "libx264",
      "-crf",
      "23",
      "-vf",
      "scale=1920:-2",
      "-an",
    ];

    expect(blocksToArgs(parseArgsToBlocks(argv, "output"))).toEqual(argv);
  });
});

describe("hasRawBlocks", () => {
  it("无 raw 积木时返回 false", () => {
    expect(hasRawBlocks(parseArgsToBlocks(["-crf", "23"], "output"))).toBe(
      false
    );
  });
});
