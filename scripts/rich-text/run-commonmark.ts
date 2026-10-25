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

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { normalizeHtml } from "./semantics";
import {
  createReport,
  evaluateExample,
  renderMarkdown,
  type ParseOutcome,
  type SpecExample,
} from "./report";

// Reuse the project's declared jsdom dependency; keep DOM parsing outside the worker.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: { fragment: (html: string) => DocumentFragment };
};

export class IsolatedParser {
  private worker: Worker | undefined;
  constructor(
    private readonly timeoutMs: number,
    private readonly workerUrl = new URL("./parser.worker.ts", import.meta.url)
  ) {}

  private async start(): Promise<Worker> {
    const worker = new Worker(this.workerUrl.href, { type: "module" });
    await new Promise<void>((accept, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        worker.removeEventListener("message", ready);
        worker.removeEventListener("error", fail);
      };
      const timer = setTimeout(() => {
        cleanup();
        worker.terminate();
        reject(new Error("Parser worker startup timed out"));
      }, 10_000);
      const ready = (event: MessageEvent) => {
        cleanup();
        if (event.data.status === "ready") accept();
        else {
          worker.terminate();
          reject(new Error("Unexpected worker startup response"));
        }
      };
      const fail = (event: ErrorEvent) => {
        cleanup();
        worker.terminate();
        reject(new Error(event.message));
      };
      worker.addEventListener("message", ready);
      worker.addEventListener("error", fail);
    });
    this.worker = worker;
    return worker;
  }

  async parse(markdown: string): Promise<ParseOutcome> {
    const worker = this.worker ?? (await this.start());
    return new Promise<ParseOutcome>((accept) => {
      const cleanup = () => {
        clearTimeout(timer);
        worker.removeEventListener("message", receive);
        worker.removeEventListener("error", fail);
      };
      const timer = setTimeout(() => {
        cleanup();
        this.dispose();
        accept({
          status: "timeout",
          error:
            "Parsing exceeded " + this.timeoutMs + " ms; worker terminated",
        });
      }, this.timeoutMs);
      const receive = (event: MessageEvent<ParseOutcome>) => {
        cleanup();
        accept(event.data);
      };
      const fail = (event: ErrorEvent) => {
        cleanup();
        this.dispose();
        accept({ status: "parse-error", error: event.message });
      };
      worker.addEventListener("message", receive);
      worker.addEventListener("error", fail);
      worker.postMessage({ markdown });
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = undefined;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !["--out-dir", "--timeout-ms"].includes(args[i]) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    ) {
      throw new Error(
        "Usage: bun run rich-text:commonmark [--out-dir PATH] [--timeout-ms 2000]"
      );
    }
    options[args[i]] = args[i + 1];
  }
  const timeoutMs = Number(options["--timeout-ms"] ?? 2000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new Error("--timeout-ms must be a positive integer");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const outDir = resolve(
    root,
    options["--out-dir"] ?? ".tmp/rich-text-commonmark"
  );
  const fixture: unknown = JSON.parse(
    await readFile(
      new URL("./fixtures/commonmark-0.31.2/spec.json", import.meta.url),
      "utf8"
    )
  );
  if (
    !Array.isArray(fixture) ||
    fixture.length !== 652 ||
    fixture.some(
      (item, index) =>
        item.example !== index + 1 ||
        typeof item.markdown !== "string" ||
        typeof item.html !== "string" ||
        typeof item.section !== "string" ||
        !Number.isInteger(item.start_line) ||
        !Number.isInteger(item.end_line)
    )
  ) {
    throw new Error("Invalid local CommonMark 0.31.2 fixture");
  }
  const examples = fixture as SpecExample[];
  const parser = new IsolatedParser(timeoutMs);
  const results = [];
  try {
    for (const example of examples) {
      const expected = normalizeHtml(JSDOM.fragment(example.html));
      results.push(
        evaluateExample(example, expected, await parser.parse(example.markdown))
      );
      if (results.length % 100 === 0)
        console.log("CommonMark: " + results.length + "/" + examples.length);
    }
  } finally {
    parser.dispose();
  }
  const report = createReport(results, { bun: Bun.version, timeoutMs });
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    "utf8"
  );
  await writeFile(join(outDir, "report.md"), renderMarkdown(report), "utf8");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("Report: " + join(outDir, "report.md"));
  // Compatibility differences are report data. Infrastructure/adapter bugs fail the command.
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
