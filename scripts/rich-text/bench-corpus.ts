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

import { presets } from "../../src/tools/rich-text-renderer/config/presets";

export type MarkdownProfile = "commonmark" | "tables";
export interface BenchCase {
  id: string;
  group: "preset" | "generated";
  profile: MarkdownProfile;
  markdown: string;
  bytes: number;
  stream: boolean;
}

const encoder = new TextEncoder();
export function splitChunks(text: string, size: number): string[] {
  if (!Number.isInteger(size) || size < 1)
    throw new Error("Chunk size must be a positive integer");
  const chunks: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + size, text.length);
    const previous = text.charCodeAt(end - 1);
    const next = text.charCodeAt(end);
    if (
      previous >= 0xd800 &&
      previous <= 0xdbff &&
      next >= 0xdc00 &&
      next <= 0xdfff
    )
      end++;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

function generated(kind: string, kib: number): string {
  const units: string[] = [];
  let bytes = 0;
  for (let i = 0; bytes < kib * 1024; i++) {
    let unit: string;
    switch (kind) {
      case "prose":
        unit = `## Message ${i}\n\nHello **world**. A short message with [a link](https://example.com).\n中文段落与 emoji 🌿，保留单次回车。\n\n`;
        break;
      case "lists":
        unit = `3. Item ${i}\n   - Nested **detail**\n   - Another item\n4. Next item\n\n`;
        break;
      case "table":
        unit = `| Key | Value | State |\n| --- | --- | --- |\n| ${i} | **value** | ready |\n| next | 中文 | done |\n\n`;
        break;
      case "code":
        unit = `\`\`\`typescript\nconst value${i} = "中文 &amp; **literal**";\n// a line of code\n\`\`\`\n\n`;
        break;
      case "entities":
        unit = `Entity ${i}: &amp; &lt; &gt; &copy; &#128512; \\*literal\\* **bold** ~~strike~~ \`code\`.\n\n`;
        break;
      case "references":
        unit = `Reference ${i}: [label ${i}][ref-${i}].\n\n`;
        break;
      case "loose-list":
        unit = `- Item ${i}\n\n  Continued paragraph **inside** the item.\n\n`;
        break;
      case "unclosed-code":
        unit = `const line${i} = "pending code"; // 中文\n`;
        break;
      default:
        throw new Error("Unknown corpus kind: " + kind);
    }
    units.push(unit);
    bytes += encoder.encode(unit).length;
  }
  if (kind === "references") {
    const definitions = units.map(
      (_, i) => `[ref-${i}]: /target-${i} "Title ${i}"\n`
    );
    while (
      units.length > 1 &&
      encoder.encode(units.join("") + definitions.join("")).length > kib * 1024
    ) {
      units.pop();
      definitions.pop();
    }
    return units.join("") + definitions.join("");
  }
  return (kind === "unclosed-code" ? "```typescript\n" : "") + units.join("");
}

export function createCorpus(sizes = [1, 10, 100]): BenchCase[] {
  const cases: BenchCase[] = presets.map((preset) => ({
    id: "preset:" + preset.id,
    group: "preset",
    profile: "tables",
    markdown: preset.content,
    bytes: encoder.encode(preset.content).length,
    stream: ["basic", "long", "emoji", "action-button-test"].includes(
      preset.id
    ),
  }));
  for (const kib of sizes)
    for (const kind of [
      "prose",
      "lists",
      "table",
      "code",
      "entities",
      "references",
      "loose-list",
      "unclosed-code",
    ]) {
      const markdown = generated(kind, kib);
      cases.push({
        id: `${kind}:${kib}KiB`,
        group: "generated",
        profile:
          kind === "table" || kind === "entities" ? "tables" : "commonmark",
        markdown,
        bytes: encoder.encode(markdown).length,
        stream: kib === Math.min(...sizes) || kib === 10,
      });
    }
  return cases;
}
