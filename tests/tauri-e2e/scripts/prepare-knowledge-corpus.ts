// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultKnowledgeCorpusDir,
  prepareKnowledgeCorpus,
  resolveKnowledgeCorpusProxy,
  verifyKnowledgeCorpus,
} from "../support/knowledge-corpus";
import {
  KNOWLEDGE_CORPUS_DEFAULT_ENDPOINT,
  KNOWLEDGE_CORPUS_MIRROR_ENDPOINT,
  knowledgeCorpusSource,
} from "../fixtures/knowledge-corpus";

export interface PrepareKnowledgeCorpusCliOptions {
  checkOnly: boolean;
  force: boolean;
  dir: string;
  endpoint: string;
  proxy?: string;
  json: boolean;
  help: boolean;
}

function parseArgs(
  args: string[],
  projectRoot: string
): PrepareKnowledgeCorpusCliOptions {
  let checkOnly = false;
  let force = false;
  let dir = defaultKnowledgeCorpusDir(projectRoot);
  let endpoint = KNOWLEDGE_CORPUS_DEFAULT_ENDPOINT;
  let proxy: string | undefined;
  let json = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") {
      checkOnly = true;
    } else if (argument === "--force") {
      force = true;
    } else if (argument === "--json") {
      json = true;
    } else if (argument === "--dir") {
      const value = args[++index];
      if (!value) throw new Error("--dir requires a path.");
      dir = path.resolve(projectRoot, value);
    } else if (argument === "--endpoint") {
      const value = args[++index];
      if (!value) throw new Error("--endpoint requires an origin.");
      endpoint = value.trim();
    } else if (argument === "--proxy") {
      const value = args[++index];
      if (!value) throw new Error("--proxy requires an origin.");
      proxy = value.trim();
    } else if (argument === "--help" || argument === "-h") {
      help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}\n\n${usage()}`);
    }
  }

  if (help) {
    return { checkOnly, force, dir, endpoint, proxy, json, help };
  }
  if (checkOnly && force) {
    throw new Error("--check cannot be combined with --force.");
  }
  return { checkOnly, force, dir, endpoint, proxy, json, help };
}

function usage(): string {
  return [
    "Usage: bun tests/tauri-e2e/scripts/prepare-knowledge-corpus.ts [options]",
    "",
    "  --check             Only verify the cached corpus; never downloads.",
    "  --force             Rebuild even when the cached corpus verifies.",
    "  --dir <path>        Cache directory (default: .dev-data/e2e-resources/knowledge-corpus).",
    `  --endpoint <origin> Dataset origin (default: ${KNOWLEDGE_CORPUS_DEFAULT_ENDPOINT};`,
    `                      mirror fallback: ${KNOWLEDGE_CORPUS_MIRROR_ENDPOINT}).`,
    "  --proxy <origin>    HTTP(S) proxy for downloads (also read from HTTPS_PROXY/HTTP_PROXY).",
    "  --json              Print a machine-readable summary.",
    "",
    `Dataset: ${knowledgeCorpusSource.dataset}@${knowledgeCorpusSource.revision} (${knowledgeCorpusSource.license})`,
    "The derived corpus is cached outside version control and is never committed.",
  ].join("\n");
}

const projectRoot = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url))
);

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2), projectRoot);

  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.checkOnly) {
    const verification = await verifyKnowledgeCorpus(options.dir);
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            mode: "check",
            dir: verification.dir,
            ok: verification.ok,
            problems: verification.problems,
            counts: verification.manifest?.counts,
          },
          null,
          2
        )
      );
    } else if (verification.ok) {
      console.log(
        `[knowledge-corpus] ready: ${verification.dir} (${verification.manifest!.counts.documents} documents, ${verification.manifest!.counts.queries} queries)`
      );
    } else {
      console.error(
        `[knowledge-corpus] not ready: ${verification.dir}\n${verification.problems
          .map((problem) => `  - ${problem}`)
          .join("\n")}\n\nRun without --check to download and derive it.`
      );
    }
    process.exitCode = verification.ok ? 0 : 1;
    return;
  }

  const progress = new Map<string, number>();
  const proxy = options.proxy ?? resolveKnowledgeCorpusProxy(process.env);
  if (!options.json) {
    console.log(
      `[knowledge-corpus] endpoint: ${options.endpoint}\n` +
        `  proxy:    ${proxy ?? "(none)"}`
    );
  }
  const prepared = await prepareKnowledgeCorpus({
    dir: options.dir,
    endpoint: options.endpoint,
    proxy,
    force: options.force,
    onProgress: (role, received) => {
      const step = 5 * 1024 * 1024;
      const bucket = Math.floor(received / step);
      if (progress.get(role) !== bucket) {
        progress.set(role, bucket);
        if (!options.json && received >= step) {
          console.log(
            `[knowledge-corpus] downloading ${role}: ${(received / 1024 / 1024).toFixed(1)} MiB`
          );
        }
      }
    },
  });

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          mode: "prepare",
          dir: prepared.dir,
          endpoint: prepared.manifest.endpoint,
          proxy: proxy ?? null,
          counts: prepared.manifest.counts,
          documents: prepared.manifest.documents,
          queries: prepared.derived.queries.map((query) => ({
            id: query.id,
            query: query.query,
            relevantDocumentIds: query.relevantDocumentIds,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  console.log(
    `[knowledge-corpus] prepared: ${prepared.dir}\n` +
      `  dataset:   ${prepared.manifest.dataset}@${prepared.manifest.revision}\n` +
      `  license:   ${prepared.manifest.license}\n` +
      `  documents: ${prepared.manifest.counts.documents} (${prepared.manifest.counts.distractors} distractors)\n` +
      `  queries:   ${prepared.manifest.counts.queries} (${prepared.manifest.counts.qrelsPairs} qrels pairs)`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  console.error(`Knowledge corpus preparation failed: ${message}`);
  process.exitCode = 1;
});
