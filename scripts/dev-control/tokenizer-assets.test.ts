import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";
import { build, createServer, type ViteDevServer } from "vite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { tokenizerAssetsPlugin } from "../vite/tokenizerAssetPlugin";

const reads = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile: reads.readFile,
}));
vi.mock(
  "../../src/tools/token-calculator/data/builtin-tokenizer-assets-manifest",
  () => ({
    BUILTIN_TOKENIZER_ASSET_SOURCES: {
      fixture: { packageName: "@lenml/tokenizer-gpt4" },
    },
  })
);

const { readFile } =
  await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
const require = createRequire(import.meta.url);
const configPath =
  require.resolve("@lenml/tokenizer-gpt4/models/tokenizer_config.json");
const virtualModule = "virtual:aiohub-builtin-tokenizer-assets";
let root: string;
let vite: ViteDevServer | undefined;

beforeEach(() => {
  reads.readFile.mockReset().mockImplementation(readFile);
  root = fs.mkdtempSync(path.join(os.tmpdir(), "aiohub-tokenizer-assets-"));
});

afterEach(async () => {
  await vite?.close();
  vite = undefined;
  const target = path.resolve(root);
  if (
    path.dirname(target) !== path.resolve(os.tmpdir()) ||
    !path.basename(target).startsWith("aiohub-tokenizer-assets-")
  )
    throw new Error("Unexpected cleanup target");
  fs.rmSync(target, { recursive: true, force: true });
});

async function serveAssets() {
  vite = await createServer({
    configFile: false,
    root,
    publicDir: false,
    logLevel: "silent",
    plugins: [tokenizerAssetsPlugin()],
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === "string")
    throw new Error("Missing HTTP address");
  const { default: urls } = await vite.ssrLoadModule(virtualModule);
  return { origin: `http://127.0.0.1:${address.port}`, urls };
}

it("loads only the URL map, then shares a requested gzip asset across concurrent and later requests", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  reads.readFile.mockImplementation(async (file, options) => {
    if (String(file) === configPath) await gate;
    return readFile(file, options);
  });
  const { origin, urls } = await serveAssets();
  expect(urls["@lenml/tokenizer-gpt4"]).toEqual({
    tokenizerUrl: "/@aiohub-tokenizer-assets/fixture/tokenizer.json.gz",
    tokenizerConfigUrl:
      "/@aiohub-tokenizer-assets/fixture/tokenizer_config.json.gz",
  });
  expect(
    reads.readFile.mock.calls.filter(
      ([file]) =>
        String(file).includes("/models/") || String(file).includes("\\models\\")
    )
  ).toHaveLength(0);

  const url = origin + urls["@lenml/tokenizer-gpt4"].tokenizerConfigUrl;
  const responses = Promise.all([fetch(url), fetch(url)]);
  const configReads = () =>
    reads.readFile.mock.calls.filter(([file]) => String(file) === configPath);
  try {
    await vi.waitFor(() => expect(configReads()).toHaveLength(1));
  } finally {
    release();
  }
  const received = await responses;
  received.push(await fetch(url));
  for (const response of received) {
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/gzip");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const compressed = Buffer.from(await response.arrayBuffer());
    expect(Number(response.headers.get("content-length"))).toBe(
      compressed.length
    );
    expect(gunzipSync(compressed)).toEqual(fs.readFileSync(configPath));
  }
  expect(configReads()).toHaveLength(1);
}, 10000);

it("returns a request error for an unavailable asset and retries successfully on the next request", async () => {
  let fail = true;
  reads.readFile.mockImplementation(async (file, options) => {
    if (String(file) === configPath && fail) {
      fail = false;
      throw new Error("Temporarily unavailable tokenizer fixture");
    }
    return readFile(file, options);
  });
  const { origin, urls } = await serveAssets();
  const url = origin + urls["@lenml/tokenizer-gpt4"].tokenizerConfigUrl;
  const failed = await fetch(url);
  expect(failed.status, await failed.text()).toBe(500);

  const recovered = await fetch(url);
  expect(recovered.status).toBe(200);
  expect(gunzipSync(Buffer.from(await recovered.arrayBuffer()))).toEqual(
    fs.readFileSync(configPath)
  );
}, 10000);

it("builds both gzip assets at their existing paths with the original JSON contents", async () => {
  const entry = path.join(root, "entry.js");
  fs.writeFileSync(
    entry,
    `import urls from ${JSON.stringify(virtualModule)}; globalThis.tokenizerUrls = urls;`
  );
  const output = await build({
    configFile: false,
    root,
    publicDir: false,
    logLevel: "silent",
    plugins: [tokenizerAssetsPlugin()],
    build: { write: false, minify: false, rolldownOptions: { input: entry } },
  });
  if (Array.isArray(output) || !("output" in output))
    throw new Error("Unexpected build result");
  for (const fileName of ["tokenizer.json", "tokenizer_config.json"]) {
    const asset = output.output.find(
      (file) => file.fileName === `tokenizers/fixture/${fileName}.gz`
    );
    if (!asset || asset.type !== "asset")
      throw new Error(`Missing gzip asset: ${fileName}`);
    const bytes =
      typeof asset.source === "string"
        ? Buffer.from(asset.source)
        : asset.source;
    expect(gunzipSync(bytes)).toEqual(
      fs.readFileSync(
        require.resolve(`@lenml/tokenizer-gpt4/models/${fileName}`)
      )
    );
  }
}, 30000);
