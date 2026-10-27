// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import os from "node:os";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appearanceMatrix, type AppearanceCase } from "./matrix";
import type { MemoryCorpus } from "./corpus";
import { collectDomCensus } from "./dom";
import { writeMemoryFixture, EMPTY_SESSION_ID } from "./fixture";
import { startResourceCollector, type ResourceCollector } from "../resources";
import {
  connectFrameProbe,
  captureViewportScreenshot,
  startCdpWheelScroll,
  type FrameProbe,
} from "../frames";
import { launchApp, sleep } from "../launch";
import {
  summarizeMemory,
  memoryMarkdown,
  type MemoryCaseResult,
  type MemoryCheckpoint,
} from "./report";

const { values } = parseArgs({
  args: Bun.argv.slice(2).filter((s) => s !== "--"),
  strict: true,
  options: {
    corpus: { type: "string", default: ".tmp/app-memory/corpus.json" },
    binary: { type: "string" },
    suite: { type: "string", default: "quick" },
    pages: { type: "string", default: "home,empty,rich-text,tools" },
    configs: { type: "string" },
    rounds: { type: "string", default: "1" },
    cycles: { type: "string", default: "3" },
    "settle-ms": { type: "string", default: "8000" },
    "measure-ms": { type: "string", default: "12000" },
    "scroll-ms": { type: "string", default: "12000" },
    "cooldown-ms": { type: "string", default: "15000" },
    "cdp-port": { type: "string", default: "9433" },
    "library-count": { type: "string" },
    out: { type: "string" },
    list: { type: "boolean" },
    "empty-switch-probe": { type: "boolean", default: false },
    "dom-census": { type: "boolean", default: false },
    screenshots: { type: "boolean", default: false },
    "keep-data": { type: "boolean", default: false },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(`应用内存配置与真实会话回放（Windows）
  bun run perf:memory -- --corpus <corpus.json> --list
  bun run perf:memory -- --corpus <corpus.json> --binary <perf.exe> --pages home,empty,rich-text --configs light-effects-off --rounds 3
  --suite quick|full|native      8 个诊断配置 / 38 个完整配置 / 12 个窗口特效配置
  --pages all|home,empty,...     profile 名见 corpus；默认 home,empty,rich-text,tools
  --configs id,...              精确选择配置
  --rounds 1 --cycles 3          独立进程重复轮次 / 每轮往返次数
  --settle-ms 8000 --measure-ms 12000 --scroll-ms 12000 --cooldown-ms 15000
  --library-count N             单独控制会话索引规模，默认沿用原始索引数量
  --empty-switch-probe         末轮 GC 后切空会话并复测，区分缓存页面与共享运行时
  --dom-census                 测量检查点后另存 DOM 结构归因（只记录数量）
  --screenshots --keep-data     保存视口 / 保留隔离数据（默认测后清理）
  --out .tmp/app-memory/<name>   新目录；已有结果逐案例保存，中断后仍可查看
  --cdp-port 9433               必须空闲；仅控制本次新建的 WebView2 profile
完整矩阵耗时较长，先 --list 再选取配置。release 二进制需 perf-instrumentation。`);
  process.exit(0);
}
function integer(value: string | undefined, name: string, min = 1) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new Error(`Invalid ${name}`);
  return n;
}
const rounds = integer(values.rounds, "rounds"),
  cycles = integer(values.cycles, "cycles");
const settleMs = integer(values["settle-ms"], "settle-ms", 0);
const measureMs = integer(values["measure-ms"], "measure-ms", 1000);
const scrollMs = integer(values["scroll-ms"], "scroll-ms", 1000);
const cooldownMs = integer(values["cooldown-ms"], "cooldown-ms", 1000);
const cdpPort = integer(values["cdp-port"], "cdp-port");
if (cdpPort > 65535) throw new Error("Invalid cdp-port");
const corpus = JSON.parse(
  fs.readFileSync(path.resolve(values.corpus!), "utf8")
) as MemoryCorpus;
if (corpus.version !== 1 || !Array.isArray(corpus.sessions))
  throw new Error("Unsupported corpus");
if (!values.list && corpus.textMode !== "readable")
  console.warn(
    "当前为 masked 结构语料：正文已逐词替换。可读语料请通过 --corpus 显式选择，结果按模式分开比较。"
  );
const availablePages = [
  "home",
  "empty",
  ...corpus.sessions.map((s) => s.profile),
];
const pages =
  values.pages === "all"
    ? availablePages
    : [...new Set(values.pages!.split(","))];
if (pages.some((p) => !availablePages.includes(p)))
  throw new Error(`Unknown page. Available: ${availablePages.join(",")}`);
if (!["quick", "full", "native"].includes(values.suite!))
  throw new Error("Unknown suite");
let appearances = appearanceMatrix(values.suite as "quick" | "full" | "native");
if (values.configs) {
  const ids = [...new Set(values.configs.split(","))];
  if (ids.some((id) => !appearances.some((a) => a.id === id)))
    throw new Error("Unknown config; use --list");
  appearances = appearances.filter((a) => ids.includes(a.id));
}
const cases = Array.from({ length: rounds }, (_, i) => {
  // Rotate page and configuration order to reduce correlation with thermal drift.
  const ordered = [
    ...appearances.slice(i % appearances.length),
    ...appearances.slice(0, i % appearances.length),
  ];
  const targets = i % 2 ? [...pages].reverse() : pages;
  return ordered.flatMap((appearance) =>
    targets.map((page) => ({ appearance, page, round: i + 1 }))
  );
}).flat();
const libraryCount = values["library-count"]
  ? integer(
      values["library-count"],
      "library-count",
      corpus.sessions.length + 1
    )
  : corpus.libraryCount;
if (values.list) {
  console.log(
    JSON.stringify(
      {
        suite: values.suite,
        cases: cases.length,
        pages,
        appearances,
        rounds,
        cycles,
        libraryCount,
        samples: corpus.sessions.map(({ profile, source, replay }) => ({
          profile,
          source,
          replay,
        })),
        note: "每个案例独立启动，包含首页基线、进入/静置、可滚动时浏览、往返冷却和末次页面 GC 诊断。",
      },
      null,
      2
    )
  );
  process.exit(0);
}
if (process.platform !== "win32") throw new Error("Windows is required");
if (!values.binary || !fs.existsSync(values.binary))
  throw new Error(
    "Provide --binary <perf-instrumentation.exe>; --list previews the matrix"
  );
const binary = path.resolve(values.binary);
const out = path.resolve(values.out ?? `.tmp/app-memory/run-${Date.now()}`);
const relative = path.relative(process.cwd(), out).replace(/\\/g, "/");
if (!relative.startsWith(".tmp/") && !relative.startsWith(".dev-data/"))
  throw new Error("Results must stay in .tmp/ or .dev-data/");
if (fs.existsSync(out)) throw new Error("Choose a new output directory");
fs.mkdirSync(out, { recursive: true });
function save(name: string, value: unknown) {
  fs.writeFileSync(
    path.join(out, name),
    JSON.stringify(value, null, 2),
    "utf8"
  );
}
async function assertPortFree() {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(new Error(`CDP port ${cdpPort} is occupied; refusing to attach`))
    );
    server.listen(cdpPort, "127.0.0.1", () =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });
}
let lastOperation = "prepare";
async function bounded<T>(
  work: Promise<T>,
  label: string,
  timeout = 30000
): Promise<T> {
  lastOperation = label;
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out: ${label}`)),
          timeout
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
async function route(probe: FrameProbe, target: "/" | "/llm-chat") {
  const deadline = Date.now() + 45000;
  let requested = false;
  while (Date.now() < deadline) {
    const state: { ready: boolean; clicked: boolean } = await bounded(
      probe.evaluate<{ ready: boolean; clicked: boolean }>(`(() => {
      const target = ${JSON.stringify(target)};
      if ((location.pathname === target || (target === '/' && location.pathname === '/index.html')) && document.querySelector(target === '/' ? '.home-page' : '[data-testid="chat-message-input"]')) return { ready: true, clicked: false };
      if (${requested}) return { ready: false, clicked: false };
      const link = target === '/' ? document.querySelector('.sidebar-menu-component > .el-menu-item:first-child') : [...document.querySelectorAll('a[href]')].find(a => new URL(a.href, location.href).pathname === target);
      if (link instanceof HTMLElement) { link.click(); return { ready: false, clicked: true }; }
      return { ready: false, clicked: false };
    })()`),
      "navigate"
    );
    if (state.ready) return;
    requested ||= state.clicked;
    await sleep(250);
  }
  throw new Error(`Route did not become ready: ${target}`);
}
async function selectSession(probe: FrameProbe, id: string, isEmpty: boolean) {
  await bounded(
    probe.waitForSelector(`[data-session-id="${id}"]`, 45000),
    "wait session list",
    46000
  );
  const clicked = await bounded(
    probe.evaluate<boolean>(`(() => {
    const item = document.querySelector('[data-session-id="${id}"]');
    if (!(item instanceof HTMLElement)) return false;
    item.click(); return true;
  })()`),
    "select session"
  );
  if (!clicked) throw new Error("Seeded session item is unavailable");
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const ready = await bounded(
      probe.evaluate<boolean>(`(() => {
      const active = document.querySelector('[data-session-id="${id}"][data-session-active="true"]');
      const messages = [...document.querySelectorAll('[data-testid="chat-message"]')];
      return !!active && (${isEmpty} ? messages.length === 0 : messages.some(m => (m.getAttribute('data-message-id') ?? '').startsWith('${id}-')));
    })()`),
      "wait session"
    );
    if (ready) return;
    await sleep(250);
  }
  throw new Error("Selected session body did not become ready");
}
async function checkpoint(
  probe: FrameProbe,
  collector: ResourceCollector,
  phase: string,
  cycle: number,
  since: number
): Promise<MemoryCheckpoint> {
  const heap = await bounded(
    probe.command<MemoryCheckpoint["heap"]>("Runtime.getHeapUsage"),
    "heap"
  );
  const dom = await bounded(
    probe.command<MemoryCheckpoint["dom"]>("Memory.getDOMCounters"),
    "DOM"
  );
  const page = await bounded(
    probe.evaluate<MemoryCheckpoint["page"]>(`(() => {
    const style = getComputedStyle(document.documentElement);
    const images = [...document.images];
    return { path: location.pathname, visibility: document.visibilityState, width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
      blur: style.getPropertyValue('--ui-blur').trim(), wallpaper: style.getPropertyValue('--wallpaper-opacity').trim(),
      messageCount: document.querySelectorAll('[data-testid="chat-message"]').length,
      images: images.length, decodedImages: images.filter(i => i.complete && i.naturalWidth > 0).length,
      toolMessages: document.querySelectorAll('[data-testid="chat-tool-call"]').length,
      reasoningPanels: document.querySelectorAll('.llm-think-node').length,
      diagramErrors: document.querySelectorAll('.mermaid-error').length,
      imageErrors: document.querySelectorAll('.rich-text-renderer .error-placeholder').length,
      codeBlocks: document.querySelectorAll('.markdown-code-block').length,
      pageEditors: document.querySelectorAll('.cm-editor').length,
      codeEditors: document.querySelectorAll('.cm-viewer-container .cm-editor').length,
      codeFallbacks: document.querySelectorAll('.pre-code-node').length,
      messageScrollTop: document.querySelector('.message-list')?.scrollTop ?? 0,
      messageScrollHeight: document.querySelector('.message-list')?.scrollHeight ?? 0 };
  })()`),
    "page state"
  );
  const at = Date.now();
  if (page.visibility !== "visible")
    throw new Error(
      "Test window became hidden; visible-rendering measurement is invalid"
    );
  return {
    phase,
    cycle,
    at,
    heap,
    dom,
    page,
    resources: summarizeMemory(
      collector.getSamples().filter((s) => s.at >= since && s.at <= at),
      at
    ),
  };
}
const results: MemoryCaseResult[] = [];
let interrupted = false;
let currentApp: ReturnType<typeof launchApp> | undefined;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    interrupted = true;
    process.exitCode = 130;
    void currentApp?.stop();
  });
save("manifest.json", {
  createdAt: new Date().toISOString(),
  binary: path.basename(binary),
  binarySha256: createHash("sha256")
    .update(fs.readFileSync(binary))
    .digest("hex"),
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirty: !!execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim(),
  host: {
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    cpu: os.cpus()[0]?.model,
    ramBytes: os.totalmem(),
  },
  options: {
    rounds,
    cycles,
    settleMs,
    measureMs,
    scrollMs,
    cooldownMs,
    libraryCount,
    domCensus: values["dom-census"],
    emptySwitchProbe: values["empty-switch-probe"],
    suite: values.suite,
  },
  corpusSha256: createHash("sha256")
    .update(fs.readFileSync(values.corpus!))
    .digest("hex"),
  corpusTextMode: corpus.textMode ?? "masked",
  corpusInventory: corpus.inventory,
  samples: corpus.sessions.map(({ profile, source, replay }) => ({
    profile,
    source,
    replay,
  })),
  limitations: corpus.limitations,
  pageMetricSelectors: {
    codeBlocks: ".markdown-code-block",
    pageEditors: ".cm-editor",
    codeEditors: ".cm-viewer-container .cm-editor",
    codeFallbacks: ".pre-code-node",
  },
  cases,
});
for (const [index, item] of cases.entries()) {
  if (interrupted) break;
  const { appearance, page, round } = item;
  const id = `${String(index + 1).padStart(4, "0")}-${page}-${appearance.id}-r${round}`;
  const dataDir = path.join(out, "data", id);
  const result: MemoryCaseResult = {
    id,
    page,
    appearance,
    round,
    status: "ok",
    checkpoints: [],
  };
  let app: ReturnType<typeof launchApp> | undefined;
  let probe: FrameProbe | undefined;
  let collector: ResourceCollector | undefined;
  let runtime: unknown;
  let materialized: unknown;
  const phases: {
    phase: string;
    cycle: number;
    since: number;
    until: number;
  }[] = [];
  const domCensus: unknown[] = [];
  async function sample(
    phase: string,
    cycle: number,
    ms: number,
    action?: () => Promise<void>
  ) {
    const since = Date.now();
    if (action) await action();
    const remaining = ms - (Date.now() - since);
    if (remaining > 0) await sleep(remaining);
    const c = await checkpoint(probe!, collector!, phase, cycle, since);
    phases.push({ phase, cycle, since, until: c.at });
    result.checkpoints.push(c);
    save(`${id}.json`, { ...result, runtime, materialized, phases });
    if (
      values["dom-census"] &&
      [
        "home",
        "idle",
        "scroll-rest",
        "return-home",
        "after-gc",
        "empty-idle",
        "empty-after-gc",
      ].includes(phase)
    ) {
      const census = await bounded(
        probe!.evaluate<ReturnType<typeof collectDomCensus>>(
          `(${collectDomCensus.toString()})()`
        ),
        "DOM structural census"
      );
      domCensus.push({ phase, cycle, ...census });
      save(`${id}-dom.json`, domCensus);
    }
  }
  console.log(
    `[${index + 1}/${cases.length}] ${page} / ${appearance.id} / ${round}`
  );
  try {
    await assertPortFree();
    lastOperation = "materialize fixture";
    // Other sampled sessions stay indexed as lightweight library padding; only the
    // case target is materialized, so homepage runs do not rebuild hundreds of images.
    const caseCorpus = {
      ...corpus,
      sessions: corpus.sessions.filter((s) => s.profile === page),
    };
    materialized = writeMemoryFixture(
      dataDir,
      caseCorpus,
      appearance,
      libraryCount
    );
    lastOperation = "launch application";
    app = launchApp({ binary, dataDir, cdpPort });
    currentApp = app;
    collector = startResourceCollector(app.pid, { intervalMs: 1000 });
    lastOperation = "connect CDP";
    probe = await connectFrameProbe(cdpPort, { timeoutMs: 60000 });
    runtime = await bounded(
      probe.command("Browser.getVersion"),
      "runtime version"
    );
    // Corpus resources were rewritten to local files. Do not block the app's
    // HTTPS custom-protocol origin: it also serves lazy-loaded production chunks.
    await route(probe, "/");
    await sleep(settleMs);
    await sample("home", 0, measureMs);
    const observed = result.checkpoints.at(-1)!.page;
    if (
      observed.blur !== `${appearance.effects ? appearance.blur : 0}px` ||
      (appearance.wallpaper && !(Number(observed.wallpaper) > 0))
    ) {
      lastOperation = "verify applied appearance";
      throw new Error("Appearance did not apply");
    }
    if (page !== "home") {
      const sessionId =
        page === "empty"
          ? EMPTY_SESSION_ID
          : corpus.sessions.find((s) => s.profile === page)!.id;
      for (let cycle = 1; cycle <= cycles; cycle++) {
        await sample("enter", cycle, measureMs, async () => {
          await route(probe!, "/llm-chat");
          await selectSession(probe!, sessionId, page === "empty");
        });
        await sleep(settleMs);
        await sample("idle", cycle, measureMs);
        const expanded = await bounded(
          probe.evaluate<number>(`(() => {
          const panels = [...document.querySelectorAll('.llm-think-node.is-collapsed > .llm-think-header, [data-testid="chat-tool-call"] button.tool-bar[aria-expanded="false"]')];
          const visible = panels.filter(e => e instanceof HTMLElement && e.getBoundingClientRect().height > 0);
          visible.forEach(e => e.click());
          return visible.length;
        })()`),
          "expand visible reasoning and tool results"
        );
        if (expanded > 0) await sample("expanded", cycle, measureMs);
        const scrollable = await bounded(
          probe.evaluate<boolean>(
            "(() => { const e = document.querySelector('.message-list'); return !!e && e.scrollHeight > e.clientHeight; })()"
          ),
          "scrollability"
        );
        if (scrollable)
          await sample("scroll", cycle, scrollMs, async () => {
            const wheel = await startCdpWheelScroll(probe!, ".message-list", {
              durationMs: scrollMs,
              stepPx: 600,
              intervalMs: 32,
            });
            await bounded(wheel.done, "scroll", scrollMs + 15000);
          });
        if (scrollable) await sample("scroll-rest", cycle, measureMs);
        if (values.screenshots && cycle === 1)
          fs.writeFileSync(
            path.join(out, `${id}.png`),
            Buffer.from(
              await bounded(captureViewportScreenshot(probe), "screenshot"),
              "base64"
            )
          );
        await route(probe, "/");
        await sample("return-home", cycle, cooldownMs);
      }
    }
    // Only the terminal diagnostic forces page GC; all user-visible stages use natural GC.
    await bounded(
      probe.command("HeapProfiler.collectGarbage"),
      "terminal page GC"
    );
    await sample("after-gc", page === "home" ? 0 : cycles, measureMs);
    if (values["empty-switch-probe"] && page !== "home" && page !== "empty") {
      await route(probe, "/llm-chat");
      await selectSession(probe, EMPTY_SESSION_ID, true);
      await sleep(settleMs);
      await sample("empty-idle", cycles, measureMs);
      await bounded(
        probe.command("HeapProfiler.collectGarbage"),
        "empty-session page GC"
      );
      await sample("empty-after-gc", cycles, measureMs);
    }
  } catch {
    const failedOperation = lastOperation;
    if (probe) {
      try {
        const diagnostics = await bounded(
          probe.evaluate(
            `({ path: location.pathname, ready: document.readyState, title: document.title, home: !!document.querySelector('.home-page'), chat: !!document.querySelector('[data-testid="chat-message-input"]'), links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).slice(0, 30) })`
          ),
          "failure diagnostics",
          3000
        );
        save(`${id}-diagnostics.json`, diagnostics);
        if (values.screenshots)
          fs.writeFileSync(
            path.join(out, `${id}-failed.png`),
            Buffer.from(
              await bounded(
                captureViewportScreenshot(probe),
                "failure screenshot",
                3000
              ),
              "base64"
            )
          );
      } catch {
        /* Preserve the original failure when the page is unavailable. */
      }
    }
    // Do not persist raw page exceptions: they may echo source content or local paths.
    result.status = "failed";
    result.failure = `操作 ${failedOperation} 失败；已保留 ${result.checkpoints.length} 个检查点。检查二进制 CDP 支持、页面就绪与可见状态。`;
    process.exitCode = interrupted ? 130 : 1;
  } finally {
    const samples = collector?.getSamples() ?? [];
    await collector?.stop();
    await probe?.close();
    await app?.stop();
    currentApp = undefined;
    save(`${id}.json`, { ...result, runtime, materialized, phases, samples });
    results.push(result);
    fs.writeFileSync(
      path.join(out, "report.md"),
      memoryMarkdown(results, corpus.textMode ?? "masked"),
      "utf8"
    );
    if (!values["keep-data"] && fs.existsSync(dataDir)) {
      const resolved = fs.realpathSync(dataDir);
      const root = fs.realpathSync(path.join(out, "data"));
      const rel = path.relative(root, resolved);
      if (!rel || rel.startsWith("..") || path.isAbsolute(rel))
        throw new Error("Unsafe cleanup target");
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
  if (result.status === "failed") {
    console.error(`${id}: ${result.failure}`);
    break;
  }
}
console.log(`报告：${path.join(out, "report.md")}`);
