import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { build, createServer, type ViteDevServer } from "vite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { tesseractLanguagesPlugin } from "../vite/tesseractLanguagesPlugin";

const consumer = fileURLToPath(
  new URL("../../src/tools/smart-ocr/config/language-packs.ts", import.meta.url)
);
let root: string;
let server: ViteDevServer | undefined;
const fixture = gzipSync("language fixture");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "aiohub-tesseract-languages-"));
  fs.mkdirSync(path.join(root, "public/tesseract-lang"), { recursive: true });
  for (const code of ["eng", "chi_sim"])
    fs.writeFileSync(
      path.join(root, `public/tesseract-lang/${code}.traineddata.gz`),
      fixture
    );
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  const target = path.resolve(root);
  if (
    path.dirname(target) !== path.resolve(os.tmpdir()) ||
    !path.basename(target).startsWith("aiohub-tesseract-languages-")
  )
    throw new Error("Unexpected cleanup target");
  fs.rmSync(target, { recursive: true, force: true });
});

// Protect the worker's public resource paths and one-copy packaging contract.
it("builds language options while shipping each language binary once at its public URL", async () => {
  await build({
    configFile: false,
    root,
    logLevel: "silent",
    plugins: [tesseractLanguagesPlugin()],
    build: { lib: { entry: consumer, formats: ["es"], fileName: "options" } },
  });
  const files = fs
    .readdirSync(path.join(root, "dist"), { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".traineddata.gz"))
    .sort();
  expect(files).toEqual([
    path.join("tesseract-lang", "chi_sim.traineddata.gz"),
    path.join("tesseract-lang", "eng.traineddata.gz"),
  ]);
  for (const file of files)
    expect(fs.readFileSync(path.join(root, "dist", file))).toEqual(fixture);
});

// Protect discovered options (including combined languages) after adding/removing packs.
it("refreshes available language options and keeps language files accessible in dev", async () => {
  server = await createServer({
    configFile: false,
    root,
    logLevel: "silent",
    plugins: [tesseractLanguagesPlugin()],
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await server.listen();
  const ids = async () => {
    const { getTesseractLanguageOptions } =
      await server!.ssrLoadModule(consumer);
    return getTesseractLanguageOptions().map(
      (option: { id: string }) => option.id
    );
  };
  expect(await ids()).toEqual(["chi_sim+eng", "chi_sim", "eng"]);
  const added = path.join(root, "public/tesseract-lang/jpn.traineddata.gz");
  fs.writeFileSync(added, fixture);
  server.watcher.emit("add", added);
  expect(await ids()).toEqual(["chi_sim+eng", "chi_sim", "eng", "jpn"]);
  const removed = path.join(
    root,
    "public/tesseract-lang/chi_sim.traineddata.gz"
  );
  fs.unlinkSync(removed);
  server.watcher.emit("unlink", removed);
  expect(await ids()).toEqual(["eng", "jpn"]);
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("Missing HTTP address");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/tesseract-lang/eng.traineddata.gz`
  );
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(
    gunzipSync(fixture)
  );
}, 10000);
