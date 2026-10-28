// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DevConnection } from "../dev-control/connection";
import { getInstance } from "../dev-control/discovery";
import { embeddedPreviewCases } from "./embedded-preview-corpus";
import { setupChatPreview } from "./chat-preview-page";
import { createSsePayload } from "../../tests/tauri-e2e/support/openai-mock-core";

const { values } = parseArgs({
  args: Bun.argv.slice(2).filter((a) => a !== "--"),
  strict: true,
  options: {
    instance: { type: "string" },
    filter: { type: "string", default: "form|canvas|svg|mermaid" },
    "idle-ms": { type: "string", default: "5000" },
    "out-dir": {
      type: "string",
      default: `.tmp/rich-text-chat-preview/${Date.now()}`,
    },
  },
});
if (!values.instance) throw new Error("Specify an isolated --instance");
const instance = getInstance(values.instance);
if (instance.frontendMode !== "hmr")
  throw new Error(
    "Chat fixture setup currently requires an isolated HMR instance"
  );
const idleMs = Number(values["idle-ms"]);
if (!Number.isInteger(idleMs) || idleMs < 1000)
  throw new Error("idle-ms must be >= 1000");
const out = resolve(values["out-dir"]!);
await mkdir(out, { recursive: true });
const cases = [
  { id: "form-stop", fixture: "html-form", stop: true, close: false },
  { id: "form-close", fixture: "html-form", stop: false, close: true },
  { id: "canvas", fixture: "html-canvas-resize", stop: false, close: true },
  { id: "svg", fixture: "svg-inline", stop: false, close: true },
  { id: "mermaid", fixture: "mermaid-image-mixed", stop: false, close: false },
].filter((c) => new RegExp(values.filter!).test(c.id));
if (!cases.length) throw new Error("No matching preview cases");
const requests: {
  id: string;
  chunks: number;
  held: boolean;
  aborted: boolean;
  finished: boolean;
}[] = [];
const endings = new Map<string, () => void>();
const streams = new Set<() => void>();
const encoder = new TextEncoder();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 120,
  async fetch(req) {
    if (req.method === "OPTIONS")
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
        },
      });
    if (new URL(req.url).pathname.endsWith("/interrupt"))
      return Response.json({ ok: true });
    const body = (await req.json()) as { messages?: unknown; stream?: boolean };
    const id = /\[preview:([a-z-]+)\]/.exec(
      JSON.stringify(body.messages ?? [])
    )?.[1];
    const item = cases.find((c) => c.id === id);
    if (!item)
      return Response.json({
        choices: [
          {
            message: { role: "assistant", content: "预览复核" },
            finish_reason: "stop",
          },
        ],
      });
    const markdown = embeddedPreviewCases.find(
      (c) => c.id === item.fixture
    )!.markdown;
    const content =
      item.close || item.stop ? markdown.replace(/```\n$/, "") : markdown;
    const chunks = content.match(/[\s\S]{1,32}/gu)!;
    const log = {
      id: item.id,
      chunks: 0,
      held: false,
      aborted: false,
      finished: false,
    };
    requests.push(log);
    let timer: ReturnType<typeof setInterval> | undefined;
    let dispose = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        dispose = () => {
          if (closed) return;
          closed = true;
          clearInterval(timer);
          endings.delete(item.id);
          streams.delete(dispose);
          try {
            controller.close();
          } catch {}
        };
        streams.add(dispose);
        const send = (text: string) => controller.enqueue(encoder.encode(text));
        endings.set(item.id, () => {
          if (closed) return;
          if (item.close) send(createSsePayload(["```\n"], "stop"));
          else send(createSsePayload([], "stop"));
          log.finished = true;
          dispose();
        });
        timer = setInterval(() => {
          if (log.chunks === chunks.length) {
            clearInterval(timer);
            log.held = true;
            return;
          }
          send(
            `data: ${JSON.stringify({ id: "preview-fixture", object: "chat.completion.chunk", choices: [{ index: 0, delta: { ...(log.chunks === 0 ? { role: "assistant" } : {}), content: chunks[log.chunks++] }, finish_reason: null }] })}\n\n`
          );
        }, 25);
        req.signal.addEventListener(
          "abort",
          () => {
            log.aborted = true;
            dispose();
          },
          { once: true }
        );
      },
      cancel() {
        log.aborted = true;
        dispose();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "access-control-allow-origin": "*",
      },
    });
  },
});
const connection = await DevConnection.attach(instance, 20000);
const page = await connection.window("main", 20000);
const rows: { id: string; passed: boolean; details: unknown }[] = [];
const record = (id: string, passed: boolean, details: unknown) =>
  rows.push({ id, passed, details });
let defaults: unknown;
let activeCase = "";
try {
  await connection.verify(page, "main");
  await page.evaluate(() =>
    window.__AIO_DEV_CONTROL__!.navigate("/llm-chat", 20000)
  );
  await page.waitForSelector(".message-list", { timeout: 30000 });
  defaults = await page.evaluate(setupChatPreview, {
    baseUrl: `http://127.0.0.1:${server.port}`,
    profileId: `preview-local-${Date.now()}`,
  });
  for (const item of cases) {
    activeCase = item.id;
    console.log(JSON.stringify({ id: item.id, phase: "start" }));
    const markdown = embeddedPreviewCases.find(
      (c) => c.id === item.fixture
    )!.markdown;
    const expectedHtml =
      item.close || item.stop
        ? markdown.slice(
            markdown.indexOf("\n") + 1,
            markdown.lastIndexOf("```")
          )
        : "";
    await page.evaluate((id) => window.__CHAT_PREVIEW__!.send(id), item.id);
    if (expectedHtml)
      await page.waitForFunction(
        (expected) =>
          window.__CHAT_PREVIEW__!.sample().renderedSource === expected &&
          (expected.trimStart().startsWith("<svg") ||
            document
              .querySelector<HTMLIFrameElement>(".message-list iframe")
              ?.srcdoc.endsWith(expected.slice(-150)) === true),
        expectedHtml,
        { timeout: 30000 }
      );
    else
      await page.waitForFunction(
        () => window.__CHAT_PREVIEW__!.sample().mermaid > 0,
        null,
        { timeout: 30000 }
      );
    if (item.id.startsWith("form")) {
      await page.waitForFunction(
        () =>
          !!document
            .querySelector<HTMLIFrameElement>(".message-list iframe")
            ?.contentDocument?.querySelector<HTMLButtonElement>("#increment")
            ?.onclick
      );
      await page.evaluate(() => window.__CHAT_PREVIEW__!.edit());
    }
    const before = await page.evaluate(() => window.__CHAT_PREVIEW__!.sample());
    if (item.stop) await page.getByTestId("chat-stop-generation").click();
    else endings.get(item.id)!();
    await page.waitForFunction(
      () =>
        window.__CHAT_PREVIEW__!.sample().completed &&
        !window.__CHAT_PREVIEW__!.sample().generating,
      null,
      { timeout: 30000 }
    );
    await page.waitForTimeout(1300);
    if (item.id === "mermaid")
      await page.waitForFunction(
        () => window.__CHAT_PREVIEW__!.sample().imageReady
      );
    const after = await page.evaluate(() => window.__CHAT_PREVIEW__!.sample());
    const success = item.id.startsWith("form")
      ? after.sameDocument &&
        after.note === "保留的输入 🌿" &&
        after.count === "1"
      : item.id === "mermaid"
        ? after.mermaid > 0
        : item.id === "svg"
          ? after.svg
          : after.hasFrame;
    record(
      item.id,
      success && (!after.error || (item.stop && after.error === "已取消")),
      { before, after }
    );
    if (item.id === "canvas") {
      const t0 = await page.evaluate(() => window.__CHAT_PREVIEW__!.ticks());
      await page.waitForTimeout(idleMs);
      const t1 = await page.evaluate(() => window.__CHAT_PREVIEW__!.ticks());
      await page.evaluate(() => window.__CHAT_PREVIEW__!.freeze(true));
      await page.waitForFunction(
        () => !document.querySelector(".message-list iframe")
      );
      await page.waitForTimeout(250);
      const frozenStart = await page.evaluate(() =>
        window.__CHAT_PREVIEW__!.ticks()
      );
      await page.waitForTimeout(500);
      const frozenEnd = await page.evaluate(() =>
        window.__CHAT_PREVIEW__!.ticks()
      );
      record("canvas-freeze", t1 > t0 && frozenEnd === frozenStart, {
        idleMs,
        runningTicks: t1 - t0,
        frozenTicks: frozenEnd - frozenStart,
      });
      await page.evaluate(() => window.__CHAT_PREVIEW__!.freeze(false));
      await page.waitForSelector(".message-list iframe");
      await page
        .locator('.message-list [data-code-action="open-dialog-preview"]')
        .click();
      await page.waitForSelector('[role="dialog"] iframe');
      record(
        "canvas-dialog-exclusive",
        (await page.locator(".message-list iframe").count()) === 0,
        {
          inline: await page.locator(".message-list iframe").count(),
          dialog: await page.locator('[role="dialog"] iframe').count(),
        }
      );
      await page.locator('[role="dialog"] .dialog-close-btn').click();
      await page.waitForSelector(".message-list iframe");
      record(
        "canvas-dialog-close",
        (await page.locator('[role="dialog"] iframe').count()) === 0,
        {
          inline: await page.locator(".message-list iframe").count(),
          dialog: await page.locator('[role="dialog"] iframe').count(),
        }
      );
      await page.evaluate(() =>
        window.__AIO_DEV_CONTROL__!.navigate("/", 20000)
      );
      await page.waitForTimeout(500);
      const inactiveStart = await page.evaluate(() =>
        window.__CHAT_PREVIEW__!.ticks()
      );
      await page.waitForTimeout(1500);
      const inactiveEnd = await page.evaluate(() =>
        window.__CHAT_PREVIEW__!.ticks()
      );
      record("canvas-inactive-stops", inactiveStart === inactiveEnd, {
        ticks: inactiveEnd - inactiveStart,
      });
      await page.evaluate(() =>
        window.__AIO_DEV_CONTROL__!.navigate("/llm-chat", 20000)
      );
      await page.waitForFunction(
        () =>
          !!document
            .querySelector<HTMLIFrameElement>(".message-list iframe")
            ?.contentDocument?.querySelector("canvas")
      );
      const restoredStart = await page.evaluate(() =>
        window.__CHAT_PREVIEW__!.ticks()
      );
      await page.waitForTimeout(500);
      const restoredEnd = await page.evaluate(() =>
        window.__CHAT_PREVIEW__!.ticks()
      );
      record("canvas-reactivates", restoredEnd > restoredStart, {
        ticks: restoredEnd - restoredStart,
      });
    }
  }
} finally {
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        frontendMode: instance.frontendMode,
        defaults,
        activeCase,
        lastSample: await page
          .evaluate(() => window.__CHAT_PREVIEW__?.sample())
          .catch(() => null),
        requests,
        rows,
      },
      null,
      2
    ),
    "utf8"
  );
  try {
    await page.evaluate(() => window.__CHAT_PREVIEW__?.cleanup());
  } finally {
    for (const close of streams) close();
    server.stop(true);
    await connection.close();
  }
}
console.log(JSON.stringify({ requests, rows }, null, 2));
if (rows.some((row) => !row.passed)) process.exitCode = 1;
