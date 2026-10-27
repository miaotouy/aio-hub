// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { PERF_AGENT_ID, PERF_FIXTURE_TIMESTAMP } from "../fixture";

type RecordValue = Record<string, any>;
export interface SessionStats {
  nodes: number;
  activePath: number;
  branches: number;
  characters: number;
  longestMessage: number;
  textCharacters: number;
  longestTextMessage: number;
  codeBlocks: number;
  tables: number;
  math: number;
  diagrams: number;
  html: number;
  reasoningChars: number;
  toolNodes: number;
  toolCalls: number;
  translations: number;
  images: number;
  attachments: number;
}
export interface CorpusSession {
  id: string;
  profile: string;
  source: SessionStats;
  replay: SessionStats;
  detail: RecordValue;
}
export interface ImageSpec {
  width: number;
  height: number;
  source: "embedded" | "html-hint" | "fallback";
}
export type CorpusTextMode = "readable" | "masked";
export interface MemoryCorpus {
  textMode?: CorpusTextMode;
  readableEntityRuleCount?: number;
  images?: Record<string, ImageSpec>;
  version: 1;
  createdAt: string;
  inventory: {
    indexed: number;
    readable: number;
    skipped: number;
    quantiles: Record<string, number[]>;
  };
  // Anonymous lightweight library entries preserve sidebar/index scale.
  libraryCount: number;
  sessions: CorpusSession[];
  limitations: string[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
const count = (value: string, pattern: RegExp) =>
  [...value.matchAll(pattern)].length;
export function inspectSession(detail: RecordValue): SessionStats {
  const nodes = Object.values(detail.nodes ?? {}) as RecordValue[];
  const lengths = nodes.map((node) => text(node.content).length);
  const textLengths = nodes.map(
    (node) =>
      text(node.content)
        .replace(/data:[^,\s]+,[a-zA-Z0-9+/=]+/g, "")
        .replace(/<[^>]*>/g, "").length
  );
  const bodies = nodes.map((node) => text(node.content)).join("\n");
  const visited = new Set<string>();
  let cursor = detail.activeLeafId;
  while (cursor && detail.nodes?.[cursor] && !visited.has(cursor)) {
    visited.add(cursor);
    cursor = detail.nodes[cursor].parentId;
  }
  return {
    nodes: nodes.length,
    activePath: visited.size,
    branches: nodes.reduce(
      (n, node) => n + Math.max(0, (node.childrenIds?.length ?? 0) - 1),
      0
    ),
    characters: lengths.reduce((a, b) => a + b, 0),
    longestMessage: Math.max(0, ...lengths),
    textCharacters: textLengths.reduce((a, b) => a + b, 0),
    longestTextMessage: Math.max(0, ...textLengths),
    codeBlocks: Math.floor(count(bodies, /^\s*(`{3,}|~{3,})\w*/gm) / 2),
    tables: count(bodies, /^\s*\|?.*\|.*\n\s*\|?\s*:?-{3,}/gm),
    math: count(bodies, /\$\$|\\\[|\\\(/g),
    diagrams: count(bodies, /^\s*```(?:mermaid|plantuml|dot)\b/gm),
    html: count(bodies, /<(?:details|table|div|svg|iframe|style|script)\b/gi),
    reasoningChars: nodes.reduce(
      (n, node) => n + text(node.metadata?.reasoningContent).length,
      0
    ),
    toolNodes: nodes.filter((node) => node.role === "tool").length,
    toolCalls: nodes.reduce(
      (n, node) =>
        n +
        (node.metadata?.toolCallsRequested?.length ?? 0) +
        (node.metadata?.toolCalls?.length ?? 0) +
        Number(!!node.metadata?.toolCall),
      0
    ),
    translations: nodes.filter((node) => !!node.metadata?.translation?.content)
      .length,
    images:
      count(bodies, /!\[|<img\b/gi) +
      nodes.reduce(
        (n, node) =>
          n +
          (node.attachments ?? []).filter(
            (asset: RecordValue) => asset.type === "image"
          ).length,
        0
      ),
    attachments: nodes.reduce(
      (n, node) => n + (node.attachments?.length ?? 0),
      0
    ),
  };
}

// A closed vocabulary preserves parser/highlighter syntax. All other words are
// pseudonymized with a per-extraction, discarded key (including names/paths/keys).
const syntax = new Set(
  `const let var function return if else for while do switch case break default import from export async await class extends new null undefined true false try catch finally throw typeof interface type public private readonly void string number boolean def self None True False print in is not and or as with yield lambda pass int float bool include std return graph flowchart subgraph end TD TB LR RL BT sequenceDiagram participant actor as Note over loop alt opt par and rect autonumber activate deactivate style classDef linkStyle stateDiagram direction section title gantt pie journey gitGraph erDiagram C4Context mindmap timeline quadrantChart xychart sankey block beta left right top bottom center syntax jsx tsx json javascript typescript python rust bash sh shell powershell sql html css scss vue yaml yml markdown md diff text plaintext mermaid plantuml dot tex latex cpp c java go ruby kotlin swift xml toml dockerfile console log SELECT FROM WHERE JOIN ON AS INSERT INTO VALUES UPDATE SET CREATE TABLE PRIMARY KEY NULL AND OR ORDER BY GROUP LIMIT DISTINCT union`.split(
    /\s+/
  )
);
const safeTags = new Set(
  "details summary table thead tbody tfoot tr td th caption colgroup col div span p br hr h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code strong em b i u s del ins a sup sub dl dt dd figure figcaption".split(
    " "
  )
);
export type ReadableEntityReplacements = Record<string, string>;

// Literal, longest-first and single-pass: overlapping aliases stay consistent and
// replacement values are never interpreted as more source names or regex syntax.
// Keep the private mapping in an ignored local file, separate from code/reports.
export function createReadableEntityReplacer(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error(
      "Entity replacements must be a JSON object of source/alias strings"
    );
  const entries = Object.entries(input);
  if (
    entries.some(
      ([source, alias]) =>
        !source.trim() || typeof alias !== "string" || !alias.trim()
    )
  )
    throw new Error(
      "Entity replacement sources and aliases must be non-empty strings"
    );
  const aliases = new Map(entries as [string, string][]);
  const pattern = entries.length
    ? new RegExp(
        entries
          .map(([source]) => source)
          .sort((a, b) => b.length - a.length)
          .map((source) => source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("|"),
        "gu"
      )
    : null;
  return (value: string): string =>
    pattern ? value.replace(pattern, (source) => aliases.get(source)!) : value;
}

export function redactReadableText(value: string): string {
  return value
    .replace(
      /-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/g,
      "[私钥已脱敏]"
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/=-]+/gi, "Bearer [凭据已脱敏]")
    .replace(
      /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g,
      "[凭据已脱敏]"
    )
    .replace(
      /((?:["']?)(?:api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|authorization|password|passwd|secret|token|密码|密钥)(?:["']?)\s*[:=：]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\r\n]+)/gi,
      '$1"[凭据已脱敏]"'
    )
    .replace(
      /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g,
      "[邮箱已脱敏]"
    )
    .replace(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, "[手机号已脱敏]")
    .replace(
      /\b[A-Za-z]:[\\/][^\s<>"'`]+|\\\\[^\s<>"'`]+/g,
      "local-replay-path"
    )
    .replace(/(?:\/Users\/|\/home\/)[^\s<>"'`]+/g, "local-replay-path");
}

export function createRedactor(
  key: Buffer = randomBytes(32),
  textMode: CorpusTextMode = "masked",
  entityReplacements: ReadableEntityReplacements = {}
) {
  const replaceEntities = createReadableEntityReplacer(entityReplacements);
  const wordCache = new Map<string, string>();
  const imageReferences = new Map<string, string>();
  const imageSpecs: Record<string, ImageSpec> = {};
  const imageReference = (source: string, width?: number, height?: number) => {
    // Deduplicate by source identity without retaining it in generated artifacts.
    const token = createHmac("sha256", key).update(source).digest("hex");
    if (!imageReferences.has(token))
      imageReferences.set(token, `memory-image-${imageReferences.size}`);
    const marker = imageReferences.get(token)!;
    if (!imageSpecs[marker]) {
      let spec: ImageSpec = { width: 640, height: 480, source: "fallback" };
      if (source.startsWith("data:image/png;base64,")) {
        const header = Buffer.from(
          source.slice(source.indexOf(",") + 1, source.indexOf(",") + 65),
          "base64"
        );
        if (header.length >= 24 && header.toString("ascii", 1, 4) === "PNG")
          spec = {
            width: Math.min(4096, Math.max(1, header.readUInt32BE(16))),
            height: Math.min(4096, Math.max(1, header.readUInt32BE(20))),
            source: "embedded",
          };
      } else if (width && height)
        spec = {
          width: Math.min(4096, width),
          height: Math.min(4096, height),
          source: "html-hint",
        };
      imageSpecs[marker] = spec;
    }
    return marker;
  };
  const redact = (input: string): string => {
    // External/embedded media is replaced with local replay markers, never fetched.
    let value = input
      .replace(
        /<(script|style|iframe|object|embed|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
        "[active-html-omitted]"
      )
      .replace(
        /<img\b[^>]*>/gi,
        (tag) =>
          `![image](${imageReference(tag.match(/\bsrc=["']([^"']*)["']/i)?.[1] ?? tag, Number(tag.match(/\bwidth=["']?(\d+)/i)?.[1]), Number(tag.match(/\bheight=["']?(\d+)/i)?.[1]))})`
      )
      .replace(
        /!\[([^\]]*)\]\(([^\n]*?)\)/g,
        (_, label: string, url: string) =>
          `![${label}](${url.startsWith("memory-image-") ? url : imageReference(url)})`
      )
      .replace(
        /(?:https?|file|data|blob|asset|javascript):[^\s<>"')]+/gi,
        "memory-resource"
      )
      .replace(/<\/?([a-z][\w:-]*)\b[^>]*>/gi, (tag, name: string) => {
        const lower = name.toLowerCase();
        if (!safeTags.has(lower)) return "[html]";
        // Keep structural HTML, discard all event/style/navigation attributes.
        const attrs = [
          ...tag.matchAll(
            /\b(colspan|rowspan|width|height|start)\s*=\s*["']?(\d{1,4})/gi
          ),
        ]
          .map((m) => ` ${m[1].toLowerCase()}="${m[2]}"`)
          .join("");
        return `<${tag.startsWith("</") ? "/" : ""}${lower}${attrs}>`;
      });
    if (textMode === "readable")
      return replaceEntities(redactReadableText(value));
    // Protected tokens contain syntax only. No source text is inserted afterwards.
    const protectedTokens: string[] = [];
    const protect = (s: string) => `\u0001${protectedTokens.push(s) - 1}\u0002`;
    value = value
      .replace(/<\/?[a-z]+(?: [a-z]+="\d+")*>/g, protect)
      .replace(/memory-image-\d+|memory-resource/g, protect);
    value = value.replace(
      /[\p{L}\p{N}_]+/gu,
      (word, offset: number, full: string) => {
        if (
          full[offset - 1] === "\u0001" &&
          full[offset + word.length] === "\u0002"
        )
          return word;
        if (syntax.has(word)) return word;
        // Preserve Markdown list numbers and mathematical numeric shape, not secrets.
        if (/^\d+$/.test(word)) return "1".repeat(word.length);
        const cached = wordCache.get(word);
        if (cached) return cached;
        const bytes = createHmac("sha256", key).update(word).digest();
        const masked = [...word]
          .map((ch, i) => {
            const n = bytes[i % bytes.length];
            if (/\p{Script=Han}/u.test(ch))
              return String.fromCharCode(0x4e00 + n * 17);
            if (/[^\x00-\x7f]/.test(ch)) return "文";
            if (/\d/.test(ch)) return String(n % 10);
            if (ch === "_") return ch;
            return String.fromCharCode(
              (ch === ch.toUpperCase() ? 65 : 97) + (n % 26)
            );
          })
          .join("");
        wordCache.set(word, masked);
        return masked;
      }
    );
    return value.replace(
      /\u0001(\d+)\u0002/g,
      (_, i: string) => protectedTokens[Number(i)] ?? ""
    );
  };
  return Object.assign(redact, { images: imageSpecs });
}

export function anonymizeSession(
  detail: RecordValue,
  id: string,
  redact = createRedactor()
): RecordValue {
  const entries = Object.entries(detail.nodes ?? {}) as [string, RecordValue][];
  const ids = new Map(entries.map(([old], i) => [old, `${id}-n${i}`]));
  if (!ids.has(detail.rootNodeId) || !ids.has(detail.activeLeafId))
    throw new Error("Invalid session endpoints");
  const requestIds = new Map<string, string>();
  const requestId = (old: string) => {
    if (!requestIds.has(old))
      requestIds.set(old, `${id}-request-${requestIds.size}`);
    return requestIds.get(old)!;
  };
  const tool = (item: RecordValue) => ({
    requestId: requestId(text(item.requestId)),
    toolName: redact(text(item.toolName)),
    status: ["success", "error", "denied", "completed", "cancelled"].includes(
      item.status
    )
      ? item.status
      : "completed",
    ...(Number.isFinite(item.durationMs)
      ? { durationMs: item.durationMs }
      : {}),
    ...(item.args
      ? {
          args: Object.fromEntries(
            Object.entries(item.args).map(([k, v]) => [
              redact(k),
              /^(?:apikey|accesstoken|refreshtoken|clientsecret|authorization|password|passwd|secret|token|密码|密钥)$/i.test(
                k.replace(/[-_ ]/g, "")
              )
                ? "[凭据已脱敏]"
                : redact(typeof v === "string" ? v : JSON.stringify(v)),
            ])
          ),
        }
      : {}),
    ...(item.rawArgs
      ? { rawArgs: { replay: redact(JSON.stringify(item.rawArgs)) } }
      : {}),
  });
  const nodes = Object.fromEntries(
    entries.map(([old, node]) => {
      const m = node.metadata ?? {};
      const metadata: RecordValue = {
        agentId: PERF_AGENT_ID,
        agentName: "Memory Replay",
        modelId: "memory-offline-model",
      };
      if (typeof m.reasoningContent === "string")
        metadata.reasoningContent = redact(m.reasoningContent);
      if (m.translation?.content)
        metadata.translation = {
          content: redact(m.translation.content),
          targetLang: "zh-CN",
          visible: !!m.translation.visible,
          displayMode: ["original", "translation", "both"].includes(
            m.translation.displayMode
          )
            ? m.translation.displayMode
            : "both",
        };
      if (m.toolCall) metadata.toolCall = tool(m.toolCall);
      for (const key of ["toolCalls", "toolCallsRequested"] as const) {
        if (Array.isArray(m[key])) metadata[key] = m[key].map(tool);
      }
      for (const key of [
        "isCompressionNode",
        "isContinuation",
        "isContinuationPrefix",
        "isCancelled",
      ])
        if (typeof m[key] === "boolean") metadata[key] = m[key];
      if (Array.isArray(m.compressedNodeIds))
        metadata.compressedNodeIds = m.compressedNodeIds
          .map((v: string) => ids.get(v))
          .filter(Boolean);
      return [
        ids.get(old),
        {
          id: ids.get(old),
          parentId: ids.get(node.parentId) ?? null,
          childrenIds: (node.childrenIds ?? [])
            .map((v: string) => ids.get(v))
            .filter(Boolean),
          role: ["user", "assistant", "system", "tool"].includes(node.role)
            ? node.role
            : "assistant",
          content: redact(text(node.content)),
          status: "complete",
          isEnabled: node.isEnabled !== false,
          timestamp: PERF_FIXTURE_TIMESTAMP,
          metadata,
          // Image pixels are rebuilt locally at replay time; original assets are never read.
          attachments: (node.attachments ?? []).map(
            (asset: RecordValue, i: number) => ({
              id: `${id}-${ids.get(old)}-asset-${i}`,
              type: asset.type === "image" ? "image" : "document",
              name: `replay-${i}.${asset.type === "image" ? "png" : "txt"}`,
              mimeType: asset.type === "image" ? "image/png" : "text/plain",
              path: "memory-placeholder",
              size: 0,
              sourceModule: "llm-chat",
              origins: [],
              createdAt: PERF_FIXTURE_TIMESTAMP,
              importStatus: "complete",
              metadata:
                asset.type === "image"
                  ? {
                      width: Math.min(
                        4096,
                        Math.max(1, Number(asset.metadata?.width) || 1024)
                      ),
                      height: Math.min(
                        4096,
                        Math.max(1, Number(asset.metadata?.height) || 768)
                      ),
                    }
                  : {},
            })
          ),
        },
      ];
    })
  );
  return {
    id,
    nodes,
    rootNodeId: ids.get(detail.rootNodeId),
    activeLeafId: ids.get(detail.activeLeafId),
    updatedAt: PERF_FIXTURE_TIMESTAMP,
    history: [],
    historyIndex: -1,
  };
}

export function selectCandidates(
  items: { file: string; stats: SessionStats }[]
) {
  const selected: { profile: string; file: string; stats: SessionStats }[] = [];
  const sorted = [...items].sort(
    (a, b) => a.stats.textCharacters - b.stats.textCharacters
  );
  const median =
    sorted[Math.floor(sorted.length / 2)]?.stats.textCharacters ?? 0;
  const profiles: [string, (s: SessionStats) => number][] = [
    [
      "typical",
      (s) => (s.nodes >= 3 ? 1 / (1 + Math.abs(s.textCharacters - median)) : 0),
    ],
    ["long-thread", (s) => s.activePath],
    ["long-answer", (s) => s.longestTextMessage],
    [
      "rich-text",
      (s) =>
        s.tables * 8 + s.math * 3 + s.diagrams * 30 + s.html * 2 + s.codeBlocks,
    ],
    ["reasoning", (s) => s.reasoningChars],
    ["tools", (s) => s.toolNodes * 5 + s.toolCalls * 5],
    ["branches", (s) => s.branches],
    ["media", (s) => s.images * 5 + s.attachments + s.translations * 2],
  ];
  for (const [profile, score] of profiles) {
    const ranked = items
      .filter((item) => !selected.some((s) => s.file === item.file))
      .sort((a, b) => score(b.stats) - score(a.stats));
    if (ranked[0] && score(ranked[0].stats) > 0)
      selected.push({ profile, ...ranked[0] });
  }
  return selected;
}

export function extractCorpus(
  chatDir: string,
  maxFileMiB = 64,
  textMode: CorpusTextMode = "readable",
  entityReplacements: ReadableEntityReplacements = {}
): MemoryCorpus {
  const index = JSON.parse(
    fs.readFileSync(path.join(chatDir, "sessions-index.json"), "utf8")
  );
  const items: { file: string; stats: SessionStats }[] = [];
  let skipped = 0;
  // Read only explicitly indexed session bodies. Never traverse provider/settings files.
  for (const item of index.sessions ?? []) {
    if (!/^[a-zA-Z0-9_-]+$/.test(item.id)) {
      skipped++;
      continue;
    }
    const file = path.join(chatDir, "sessions", `${item.id}.json`);
    try {
      if (fs.statSync(file).size > maxFileMiB * 1048576) {
        skipped++;
        continue;
      }
      const detail = JSON.parse(fs.readFileSync(file, "utf8"));
      if (
        !detail.nodes?.[detail.rootNodeId] ||
        !detail.nodes?.[detail.activeLeafId]
      ) {
        skipped++;
        continue;
      }
      items.push({ file, stats: inspectSession(detail) });
    } catch {
      skipped++;
    }
  }
  if (!items.length) throw new Error("No readable indexed sessions");
  const redact = createRedactor(randomBytes(32), textMode, entityReplacements);
  const sessions = selectCandidates(items).map((item, i) => {
    const id = `memory-real-${i}`;
    const detail = anonymizeSession(
      JSON.parse(fs.readFileSync(item.file, "utf8")),
      id,
      redact
    );
    return {
      id,
      profile: item.profile,
      source: item.stats,
      replay: inspectSession(detail),
      detail,
    };
  });
  const quantiles = Object.fromEntries(
    [
      "nodes",
      "activePath",
      "characters",
      "longestMessage",
      "textCharacters",
      "longestTextMessage",
    ].map((key) => {
      const sorted = items
        .map((s) => s.stats[key as keyof SessionStats])
        .sort((a, b) => a - b);
      return [
        key,
        [0.5, 0.9, 0.99, 1].map(
          (p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]
        ),
      ];
    })
  );
  return {
    version: 1,
    textMode,
    ...(textMode === "readable"
      ? { readableEntityRuleCount: Object.keys(entityReplacements).length }
      : {}),
    createdAt: new Date().toISOString(),
    images: redact.images,
    inventory: {
      indexed: index.sessions.length,
      readable: items.length,
      skipped,
      quantiles,
    },
    libraryCount: index.sessions.length,
    sessions,
    limitations: [
      textMode === "readable"
        ? "保留可读正文、数字和代码标识符；定向处理常见凭据、联系方式、本机路径与资源地址；网名及特定指代按本地替换表处理。仍可能含私人语境，仅限本机测试，上传或分享前人工审阅。"
        : "旧版 masked 模式按词替换正文，会生成难以阅读的汉字串；只适合结构负载，正文语义和排版保真受限。",
      "活动 HTML、外部资源、原始附件与撤销历史已处理；PNG 嵌入图读取头部尺寸，HTML 尺寸仅作提示，其余图片用 640×480 重建；音视频用文档卡替代。",
      "推理和工具展示结构保留；请求参数、供应商状态与执行能力省略，测试通过页面操作离线浏览。",
      "样本按单项复杂度选取；source/replay 统计用于识别重建损失，缺失形态需补充专项样本。",
    ],
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2).filter((v) => v !== "--"),
    options: {
      source: { type: "string" },
      out: { type: "string", default: ".tmp/app-memory/corpus.json" },
      "text-mode": { type: "string", default: "readable" },
      replacements: { type: "string" },
      "max-file-mib": { type: "string", default: "64" },
    },
  });
  if (!values.source)
    throw new Error(
      "Usage: bun run perf:memory:corpus -- --source <app-data>/llm-chat [--out <ignored-file>]"
    );
  const out = path.resolve(values.out!);
  // Extracted material stays in ignored local directories even after redaction.
  const relative = path.relative(process.cwd(), out).replace(/\\/g, "/");
  if (!relative.startsWith(".tmp/") && !relative.startsWith(".dev-data/"))
    throw new Error("Corpus output must stay in .tmp/ or .dev-data/");
  const max = Number(values["max-file-mib"]);
  if (!Number.isFinite(max) || max <= 0)
    throw new Error("Invalid --max-file-mib");
  if (fs.existsSync(out))
    throw new Error(
      "Corpus exists; choose a new output to preserve reproducibility"
    );
  const textMode = values["text-mode"];
  if (textMode !== "readable" && textMode !== "masked")
    throw new Error("--text-mode must be readable or masked");
  if (values.replacements && textMode !== "readable")
    throw new Error("--replacements requires --text-mode readable");
  let entityReplacements: ReadableEntityReplacements = {};
  if (values.replacements) {
    try {
      entityReplacements = JSON.parse(
        fs.readFileSync(path.resolve(values.replacements), "utf8")
      );
    } catch {
      // JSON syntax errors can otherwise echo private source/alias fragments.
      throw new Error(
        "Cannot read entity replacement JSON; check the local file"
      );
    }
  }
  // Validate without echoing private names in diagnostic errors.
  createReadableEntityReplacer(entityReplacements);
  const corpus = extractCorpus(
    path.resolve(values.source),
    max,
    textMode,
    entityReplacements
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(corpus), "utf8");
  console.log(
    JSON.stringify(
      {
        out,
        textMode: corpus.textMode,
        readableEntityRuleCount: corpus.readableEntityRuleCount,
        inventory: corpus.inventory,
        samples: corpus.sessions.map(({ id, profile, source, replay }) => ({
          id,
          profile,
          source,
          replay,
        })),
        limitations: corpus.limitations,
      },
      null,
      2
    )
  );
}
