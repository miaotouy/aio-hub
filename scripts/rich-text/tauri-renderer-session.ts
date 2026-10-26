// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { resolve } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { DevConnection } from "../dev-control/connection";
import { getInstance } from "../dev-control/discovery";

/** Attach only to the verified isolated native instance and its published renderer. */
export async function openTauriRendererSession(
  instanceName?: string,
  allowHmr = false
) {
  const instance = getInstance(instanceName);
  if (instance.frontendMode !== "static" && !allowHmr)
    throw new Error(
      "Use bun run dev:static -- --agent --agent-instance <name>; --allow-hmr is for probe diagnostics"
    );
  let componentUrl = "/src/tools/rich-text-renderer/RichTextRenderer.vue";
  let snapshot: string | undefined;
  if (instance.frontendMode === "static") {
    const staticRoot = resolve(
      ".dev-data/static-frontend",
      new URL(instance.frontendUrl).port
    );
    const published = JSON.parse(
      await readFile(resolve(staticRoot, "current.json"), "utf8")
    ) as { current: string };
    if (!/^build-[a-f0-9-]+$/.test(published.current))
      throw new Error("Invalid static build snapshot");
    snapshot = resolve(staticRoot, published.current);
    const assets = (await readdir(resolve(snapshot, "assets"))).filter((name) =>
      /^RichTextRenderer-[\w-]+\.js$/.test(name)
    );
    if (assets.length !== 1)
      throw new Error(
        "Expected one compiled RichTextRenderer module in static snapshot"
      );
    componentUrl = "/assets/" + assets[0];
  }
  const connection = await DevConnection.attach(instance, 20000);
  try {
    const page = await connection.window("main", 20000);
    await connection.verify(page, "main");
    await page.reload();
    await page.waitForFunction(() => !!window.__AIO_DEV_CONTROL__);
    await connection.verify(page, "main");
    await page.evaluate(() =>
      window.__AIO_DEV_CONTROL__!.navigate("/rich-text-renderer-tester", 20000)
    );
    await page.waitForFunction(
      () => !!(window as unknown as { Vue?: unknown }).Vue
    );
    if (await page.locator(".rich-text-renderer").count())
      throw new Error("Use a fresh isolated tester page with empty output");

    return { instance, connection, page, snapshot, componentUrl };
  } catch (error) {
    await connection.close();
    throw error;
  }
}
