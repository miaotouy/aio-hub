// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { parseArgs } from "node:util";
import { resolve, join, dirname } from "node:path";
import { mkdir, writeFile, access } from "node:fs/promises";
import net from "node:net";
import { writePerfFixture, buildPerfFixture } from "../perf/fixture";
import { launchApp, sleep } from "../perf/launch";
import { connectFrameProbe, type FrameProbe } from "../perf/frames";

// Native pixel regression: iframe viewport coordinates must survive message
// capture, including nested frames, frame borders and ancestor preview scaling.
const { values } = parseArgs({
  args: Bun.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    binary: { type: "string", default: "src-tauri/target/release/aiohub.exe" },
    "out-dir": {
      type: "string",
      default: `.tmp/rich-text-iframe-screenshot/${Date.now()}`,
    },
  },
  strict: true,
});
const binary = resolve(values.binary!);
await access(binary);
const out = resolve(values["out-dir"]!);
await mkdir(dirname(out), { recursive: true });
await mkdir(out, { recursive: false });
const dataDir = join(out, "data");
writePerfFixture(
  dataDir,
  buildPerfFixture({ messageCount: 2, paragraphCount: 1 })
);
const entry = join(out, "capture-entry.ts");
await writeFile(
  entry,
  `import { captureElementAsCanvas } from ${JSON.stringify(resolve("src/tools/llm-chat/utils/screenshotCapture.ts").replaceAll("\\", "/"))};\n(window as any).__captureIframeRegression = captureElementAsCanvas;\n`,
  "utf8"
);
const bundle = await Bun.build({
  entrypoints: [entry],
  target: "browser",
  format: "iife",
  minify: true,
});
if (!bundle.success) throw new Error(bundle.logs.map(String).join("\n"));
const port = await new Promise<number>((ok, fail) => {
  const server = net.createServer();
  server.once("error", fail);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address() as net.AddressInfo;
    server.close(() => ok(address.port));
  });
});
const app = launchApp({ binary, dataDir, cdpPort: port });
let probe: FrameProbe | undefined;
try {
  probe = await connectFrameProbe(port, { timeoutMs: 60000 });
  const deadline = Date.now() + 60000;
  while (!(await probe.evaluate('!!document.querySelector(".home-page")'))) {
    if (Date.now() > deadline) throw new Error("Native home page not ready");
    await sleep(100);
  }
  await probe.evaluate((await bundle.outputs[0].text()) + ";true");
  const rows = [];
  for (const scale of [1, 0.6]) {
    const row = await probe.evaluate<Awaited<ReturnType<typeof capturePage>>>(
      `(${capturePage.toString()})(${scale})`
    );
    const { png, ...summary } = row;
    await writeFile(
      join(out, `capture-${scale}.png`),
      Buffer.from(png.split(",")[1], "base64")
    );
    rows.push(summary);
  }
  await writeFile(
    join(out, "report.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        runtime: await probe.command("Browser.getVersion"),
        rows,
      },
      null,
      2
    ),
    "utf8"
  );
  for (const row of rows) {
    console.log(JSON.stringify(row));
    if (!row.sourceUnchanged || row.samples.some((sample) => !sample.matches))
      throw new Error(
        "Iframe screenshot viewport regression; see report.json and captures"
      );
  }
} finally {
  try {
    await probe?.close();
  } finally {
    await app.stop();
  }
}

async function capturePage(previewScale: number) {
  const capture = (
    window as unknown as {
      __captureIframeRegression: (
        element: HTMLElement,
        options: { scale: number }
      ) => Promise<HTMLCanvasElement>;
    }
  ).__captureIframeRegression;
  if (document.hidden) throw new Error("Keep native capture window visible");
  const parent = document.createElement("div");
  parent.style.cssText = `position:fixed;left:20px;top:70px;z-index:99999;transform:scale(${previewScale});transform-origin:top left`;
  const root = document.createElement("section");
  root.style.cssText =
    "width:360px;padding:12px;background:#fff;box-sizing:border-box;color:#222";
  parent.append(root);
  document.body.append(parent);
  const nested =
    '<!doctype html><html><body style="margin:0;background:rgb(230,190,40)"><div style="position:fixed;right:4px;bottom:4px;width:12px;height:12px;background:rgb(200,30,180)"></div></body></html>';
  const html = (green: boolean) =>
    `<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:rgb(${green ? "30,120,80" : "80,100,150"})}.top{position:fixed;top:10px;left:10px;width:20px;height:20px;background:rgb(220,40,40)}.bottom{position:fixed;bottom:10px;right:10px;width:20px;height:20px;background:rgb(30,70,220)}.overflow{position:fixed;left:40px;top:190px;width:20px;height:20px;background:rgb(255,100,0)}</style></head><body><div class="top"></div><div class="bottom"></div><div class="overflow"></div>${green ? `<iframe style="position:absolute;left:100px;top:60px;width:70px;height:50px;border:0" srcdoc="${nested.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"></iframe>` : ""}</body></html>`;
  try {
    const prefix = document.createElement("div");
    prefix.textContent = "Message above embedded previews";
    prefix.style.cssText = "height:80px";
    root.append(prefix);
    for (const green of [true, false]) {
      const frame = document.createElement("iframe");
      frame.style.cssText =
        "display:block;width:300px;height:180px;border:4px solid #111;margin-bottom:24px";
      const loaded = new Promise<void>((ok) =>
        frame.addEventListener("load", () => ok(), { once: true })
      );
      frame.srcdoc = html(green);
      root.append(frame);
      await loaded;
    }
    const next = document.createElement("p");
    next.textContent = "Message after embedded previews";
    root.append(next);
    await new Promise((ok) => setTimeout(ok, 150));
    const frames = [...root.querySelectorAll("iframe")];
    const nestedFrame = frames[0].contentDocument!.querySelector("iframe")!;
    const before = frames.map((f) => ({
      style: f.style.cssText,
      html: f.contentDocument!.documentElement.outerHTML,
    }));
    const canvas = await capture(root, { scale: 1 });
    const ctx = canvas.getContext("2d")!;
    const rootRect = root.getBoundingClientRect();
    const ratio = root.offsetWidth / rootRect.width;
    const samples: {
      name: string;
      x: number;
      y: number;
      actual: number[];
      expected: number[];
      matches: boolean;
    }[] = [];
    function sample(
      name: string,
      frame: HTMLIFrameElement,
      x: number,
      y: number,
      expected: number[]
    ) {
      const rect = frame.getBoundingClientRect();
      let px = (rect.left - rootRect.left) * ratio + frame.clientLeft + x;
      let py = (rect.top - rootRect.top) * ratio + frame.clientTop + y;
      if (frame === nestedFrame) {
        const outer = frames[0].getBoundingClientRect();
        px =
          (outer.left - rootRect.left) * ratio +
          frames[0].clientLeft +
          rect.left +
          x;
        py =
          (outer.top - rootRect.top) * ratio +
          frames[0].clientTop +
          rect.top +
          y;
      }
      const actual = [
        ...ctx.getImageData(Math.round(px), Math.round(py), 1, 1).data,
      ];
      samples.push({
        name,
        x: px,
        y: py,
        actual,
        expected,
        matches: expected.every((v, i) => Math.abs(actual[i] - v) <= 2),
      });
    }
    frames.forEach((frame, i) => {
      sample(`frame-${i}-top`, frame, 20, 20, [220, 40, 40, 255]);
      sample(`frame-${i}-bottom`, frame, 280, 160, [30, 70, 220, 255]);
      sample(`frame-${i}-outside-clip`, frame, 50, 200, [255, 255, 255, 255]);
    });
    sample("nested-fixed-bottom", nestedFrame, 60, 40, [200, 30, 180, 255]);
    return {
      previewScale,
      width: canvas.width,
      height: canvas.height,
      sourceUnchanged: frames.every(
        (f, i) =>
          f.style.cssText === before[i].style &&
          f.contentDocument!.documentElement.outerHTML === before[i].html
      ),
      samples,
      png: canvas.toDataURL("image/png"),
    };
  } finally {
    parent.remove();
  }
}
