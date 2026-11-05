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

import { Minimatch } from "minimatch";
type Decision = "ignored" | "unignored" | null;
interface Rule {
  matcher: Minimatch;
  directoryOnly: boolean;
  decision: Exclude<Decision, null>;
}

/** Root-relative entry matching mirrors the Rust ignore/override precedence. */
export class DirectoryRules {
  private readonly rules: Rule[] = [];
  readonly whitelist: boolean;
  constructor(lines: string[], override = false) {
    for (const source of lines) {
      let line = override
        ? source.startsWith("!")
          ? source.slice(1)
          : "!" + source
        : source;
      if (line.startsWith("#")) continue;
      if (!line.endsWith("\\ ")) line = line.trimEnd();
      if (!line) continue;
      let negative = false,
        anchored = false;
      if (line.startsWith("\\!") || line.startsWith("\\#"))
        line = line.slice(1);
      else {
        if (line.startsWith("!")) {
          negative = true;
          line = line.slice(1);
        }
        if (line.startsWith("/")) {
          anchored = true;
          line = line.slice(1);
        }
      }
      const directoryOnly = line.endsWith("/");
      if (directoryOnly) {
        line = line.slice(0, -1);
        if (line.endsWith("\\")) line = line.slice(0, -1);
      }
      if (!line) continue;
      if (!anchored && !line.includes("/") && line !== "**")
        line = "**/" + line;
      if (line.endsWith("/**")) line += "/*";
      this.rules.push({
        matcher: new Minimatch(line, {
          dot: true,
          nonegate: true,
          nocomment: true,
          noext: true,
          nocase: false,
          platform: "linux",
          windowsPathsNoEscape: false,
          optimizationLevel: 0,
        }),
        directoryOnly,
        decision: negative !== override ? "unignored" : "ignored",
      });
    }
    this.whitelist =
      override && this.rules.some((rule) => rule.decision === "unignored");
  }
  test(relative: string, directory: boolean): Decision {
    for (let index = this.rules.length - 1; index >= 0; index--) {
      const rule = this.rules[index];
      if ((!rule.directoryOnly || directory) && rule.matcher.match(relative))
        return rule.decision;
    }
    return null;
  }
}
