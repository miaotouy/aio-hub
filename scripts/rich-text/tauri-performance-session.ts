import { resolve } from "node:path";
import { readdir } from "node:fs/promises";
import { getInstance } from "../dev-control/discovery";
import { EmbeddedConnection } from "../dev-control/embedded";
import { openTauriRendererSession } from "./tauri-renderer-session";

/** Keep the page-side measurement identical across WebView2 and WebKitGTK. */
export async function openTauriPerformanceSession(
  instanceName?: string,
  allowHmr = false
) {
  const instance = getInstance(instanceName);
  const errors: string[] = [];
  if (instance.transport !== "embedded-webdriver") {
    const session = await openTauriRendererSession(instanceName, allowHmr);
    const { page, connection } = session;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    return {
      instance,
      snapshot: session.snapshot,
      componentUrl: session.componentUrl,
      errors,
      runtime: await cdp.send("Browser.getVersion"),
      allowMissingLongTasks: false,
      evaluate: <T, A = undefined>(
        fn: (arg: A) => T,
        arg?: A
      ): Promise<Awaited<T>> =>
        page.evaluate(fn as (arg: unknown) => unknown, arg) as Promise<
          Awaited<T>
        >,
      screenshot: async (options: { path: string }) => {
        await page.screenshot(options);
      },
      verify: async () => {
        await connection.verify(page, "main");
      },
      metrics: async (): Promise<Record<string, number>> =>
        Object.fromEntries(
          (await cdp.send("Performance.getMetrics")).metrics.map((x) => [
            x.name,
            x.value,
          ])
        ),
      close: async () => {
        await cdp.detach();
        await connection.close();
      },
    };
  }
  if (
    instance.frontendMode !== "bundled-debug" &&
    instance.frontendMode !== "static"
  )
    throw new Error(
      "Use a production-resource Debug instance for WebKit performance sampling"
    );
  let snapshot = resolve("dist");
  if (instance.frontendMode === "static") {
    const base = resolve(
      ".dev-data/static-frontend",
      new URL(instance.frontendUrl).port
    );
    const published = (await Bun.file(
      resolve(base, "current.json")
    ).json()) as { current: string };
    if (!/^build-[a-f0-9-]+$/.test(published.current))
      throw new Error("Invalid static snapshot");
    snapshot = resolve(base, published.current);
  }
  const assets = (await readdir(resolve(snapshot, "assets"))).filter((name) =>
    /^RichTextRenderer-[\w-]+\.js$/.test(name)
  );
  if (assets.length !== 1)
    throw new Error("Expected one compiled RichTextRenderer module");
  const connection = await EmbeddedConnection.attach(instance, 20000);
  try {
    await connection.select("main", 20000);
    await connection.verify();
    // A fresh document isolates prior probe state; the launcher and app process remain unchanged.
    await connection.evaluate(
      "(()=>{setTimeout(()=>location.reload(),0);return true})()"
    );
    await Bun.sleep(500);
    await connection.select("main", 20000);
    await connection.execute({ op: "wait" }, 20000);
    await connection.execute(
      { op: "navigate", path: "/rich-text-renderer-tester" },
      20000
    );
    if (
      await connection.evaluate(
        "document.querySelectorAll('.rich-text-renderer').length"
      )
    )
      throw new Error("Use a fresh isolated tester page with empty output");
    const runtime = await connection.evaluate(
      "({engine:'WebKitGTK',transport:'embedded-webdriver',userAgent:navigator.userAgent,platform:navigator.platform,longTaskSupported:typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes.includes('longtask'),cdpMetrics:false})"
    );
    const start = (await connection.execute({ op: "diagnostics" }, 10000)) as {
      cursor: number;
      documentId: string;
    };
    return {
      instance,
      snapshot,
      componentUrl: "/assets/" + assets[0],
      errors,
      runtime,
      allowMissingLongTasks: true,
      evaluate: <T, A = undefined>(
        fn: (arg: A) => T,
        arg?: A
      ): Promise<Awaited<T>> => connection.call(fn, arg as A, 120000),
      screenshot: async (options: { path: string }) => {
        const image = await connection.screenshot(undefined, undefined, 15000);
        await Bun.write(options.path, Bun.file(image.path));
      },
      verify: async () => {
        await connection.verify();
      },
      metrics: async (): Promise<Record<string, number>> => ({}),
      close: async () => {
        try {
          const result = (await connection.execute(
            {
              op: "diagnostics",
              since: start.cursor,
              documentId: start.documentId,
              limit: 200,
            },
            10000
          )) as { entries: { kind: string; message: string }[] };
          errors.push(...result.entries.map((e) => e.kind + ": " + e.message));
        } finally {
          await connection.close();
        }
      },
    };
  } catch (error) {
    await connection.close();
    throw error;
  }
}
