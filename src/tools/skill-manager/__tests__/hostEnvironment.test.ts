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
import { resolveTerminalEnvironment } from "../utils/hostEnvironment";

// 环境上下文是模型生成宿主命令的输入，自动偏好需遵循平台，显式偏好需保留。
describe("技能宿主终端环境", () => {
  it.each([
    ["windows", "powershell"],
    ["linux", "bash"],
    ["macos", "zsh"],
  ])("%s 的自动终端", (os, shell) => {
    expect(
      resolveTerminalEnvironment(os, {
        defaultShell: "auto-detect",
        commandChainStyle: "auto",
      }).shell
    ).toBe(shell);
  });
  it("保留用户显式终端与命令串联偏好", () => {
    const actual = resolveTerminalEnvironment("linux", {
      defaultShell: "powershell",
      commandChainStyle: "ampersand",
    });
    expect(actual.shell).toBe("powershell");
    expect(actual.chainStyle).toContain("&&");
  });
});
