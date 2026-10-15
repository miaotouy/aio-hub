import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createServer, loadConfigFromFile } from "vite";
import { expect, it } from "vitest";

it("keeps source watching active without tracking accumulated runtime and Rust artifacts", async () => {
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: "development" },
    path.resolve("vite.config.ts")
  );
  if (!loaded) throw new Error("Unable to load the development configuration");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiohub-dev-watch-"));
  const sources = ["src/app.ts", "plugins/example/src/index.ts"];
  const artifacts = [
    ".dev-data/dev-control/data/example/startup/webview2-profile/cache.bin",
    ".dev-data/static-frontend/1420/build/assets/app.js",
    "plugins/example/target/debug/plugin.dll",
  ];
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    for (const file of [...sources, ...artifacts]) {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "initial");
    }
    server = await createServer({
      configFile: false,
      root,
      logLevel: "silent",
      server: {
        watch: {
          ...loaded.config.server?.watch,
          ignorePermissionErrors: false,
        },
        middlewareMode: true,
        hmr: false,
      },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    const watchedPaths = () =>
      Object.entries(server!.watcher.getWatched()).flatMap(
        ([directory, files]) => [
          path.resolve(directory),
          ...files.map((file) => path.resolve(directory, file)),
        ]
      );
    // Vite 也会添加环境文件监听；等待源码实际进入监听集合再验证文件事件。
    await expect
      .poll(watchedPaths)
      .toEqual(
        expect.arrayContaining(sources.map((file) => path.join(root, file)))
      );
    for (const source of sources) {
      const change = once(server.watcher, "change", {
        signal: AbortSignal.timeout(3000),
      });
      fs.writeFileSync(path.join(root, source), "updated");
      const [changed] = await change;
      expect(path.resolve(changed)).toBe(path.join(root, source));
    }
    for (const artifact of [
      ".dev-data",
      "plugins/example/target",
      ...artifacts,
    ])
      expect(watchedPaths()).not.toContain(path.join(root, artifact));
  } finally {
    await server?.close();
    const target = path.resolve(root);
    if (
      path.dirname(target) !== path.resolve(os.tmpdir()) ||
      !path.basename(target).startsWith("aiohub-dev-watch-")
    )
      throw new Error("Unexpected cleanup target");
    fs.rmSync(target, { recursive: true, force: true });
  }
}, 10000);
