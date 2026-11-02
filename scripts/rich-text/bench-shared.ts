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

import { createHash } from "node:crypto";
import type { AstNode } from "../../src/tools/rich-text-renderer/types";
import type { BenchCase } from "./bench-corpus";

export interface Distribution {
  count: number;
  median: number;
  p95: number;
  min: number;
  max: number;
}
export function distribution(values: number[]): Distribution {
  if (
    !values.length ||
    values.some((value) => !Number.isFinite(value) || value < 0)
  )
    throw new Error("Expected finite nonnegative samples");
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    median:
      sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}
export function shuffled<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function astValue(nodes: AstNode[], finalized = false): unknown {
  return nodes.map((node) => {
    const props: Record<string, unknown> = { ...node.props };
    if (node.type === "list" && props.ordered) props.start ??= 1;
    if (finalized && node.type === "llm_think") props.isThinking = false;
    return {
      type: node.type,
      props: Object.fromEntries(
        Object.entries(props).sort(([a], [b]) => a.localeCompare(b))
      ),
      ...(node.children
        ? { children: astValue(node.children, finalized) }
        : {}),
    };
  });
}
export function signature(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export interface BenchSettings {
  samples: number;
  batches: number;
  batchMs: number;
  warmup: number;
}
export interface Engine {
  id: string;
  root?: string;
}
export interface BenchJob {
  engine: Engine;
  corpus: BenchCase;
  mode: "static" | "stream";
  round: number;
  settings: BenchSettings;
  chunkSize: number;
}
export interface StaticMeasurement {
  singleMs: number[];
  batchPerOpMs: number[];
  batchIterations: number;
  outputSignature: string;
  semanticSignature?: string;
  semanticError?: string;
  outputNodes: number;
}
export interface StreamMeasurement {
  totalMs: number;
  updateMs: number[];
  finalizeMs: number;
  patchApplyMs: number;
  parseMs: number;
  parsedCharacters: number;
  parseCalls: number;
  patchCount: number;
  chunks: number;
  finalMatches: boolean;
  outputSignature: string;
  finalDifference?: { path: string; expected: unknown; actual: unknown };
}
export interface BenchResult {
  engine: string;
  caseId: string;
  mode: BenchJob["mode"];
  round: number;
  chunkSize: number;
  status: "ok" | "error" | "timeout";
  error?: string;
  static?: StaticMeasurement;
  stream?: StreamMeasurement;
}
export interface BenchMetadata {
  createdAt: string;
  runtime: string;
  os: string;
  cpu: string;
  logicalCpus: number;
  sourceRevision: string;
  sourceChanges: string;
  baselineRevision?: string;
  markdownItVersion: string;
  seed: number;
  rounds: number;
  settings: BenchSettings;
  chunkSizes: number[];
  mode: string;
  execution: string;
}
export interface BenchReport {
  metadata: BenchMetadata;
  corpus: (Omit<BenchCase, "markdown"> & { characters: number })[];
  results: BenchResult[];
}
