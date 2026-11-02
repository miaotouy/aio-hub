import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { gzip, gzipSync } from "node:zlib";
import type { Plugin, ViteDevServer } from "vite";
import { BUILTIN_TOKENIZER_ASSET_SOURCES } from "../../src/tools/token-calculator/data/builtin-tokenizer-assets-manifest";

const VIRTUAL_MODULE_ID = "virtual:aiohub-builtin-tokenizer-assets";
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;
const DEV_ASSET_PREFIX = "/@aiohub-tokenizer-assets/";
const require = createRequire(import.meta.url);
const gzipAsync = promisify(gzip);

type SourceFileName = "tokenizer.json" | "tokenizer_config.json";

interface AssetSource {
  profileId: string;
  packageName: string;
  sourceFileName: SourceFileName;
}

interface CompressedAsset {
  bytes: Buffer;
  fileName: string;
}

function getSourcePath(source: AssetSource): string {
  return require.resolve(
    `${source.packageName}/models/${source.sourceFileName}`
  );
}

function getFileName(source: AssetSource): string {
  return `tokenizers/${source.profileId}/${source.sourceFileName}.gz`;
}

function loadCompressedAsset(source: AssetSource): CompressedAsset {
  return {
    bytes: gzipSync(readFileSync(getSourcePath(source)), { level: 9 }),
    fileName: getFileName(source),
  };
}

async function loadDevAsset(source: AssetSource): Promise<CompressedAsset> {
  const bytes = await readFile(getSourcePath(source));
  return {
    bytes: await gzipAsync(bytes, { level: 9 }),
    fileName: getFileName(source),
  };
}

function createAssetMap(getUrl: (source: AssetSource) => string): string {
  const entries = Object.entries(BUILTIN_TOKENIZER_ASSET_SOURCES).map(
    ([profileId, { packageName }]) => {
      const source = { profileId, packageName };
      return `${JSON.stringify(packageName)}: {
        tokenizerUrl: ${getUrl({ ...source, sourceFileName: "tokenizer.json" })},
        tokenizerConfigUrl: ${getUrl({ ...source, sourceFileName: "tokenizer_config.json" })}
      }`;
    }
  );

  return `export default {\n${entries.join(",\n")}\n};`;
}

/**
 * 将 @lenml/tokenizer-* 包内嵌在 JS 中的模型数据改为独立 gzip 资产。
 *
 * - build：通过 Rollup emitFile 输出到 dist/tokenizers/<id>/；
 * - serve：只生成 URL 清单，首次请求资产时异步压缩，并在当前服务内复用；
 * - runtime：虚拟模块只导出轻量 URL 映射，不包含 tokenizer 数据。
 */
export function tokenizerAssetsPlugin(): Plugin {
  const devSources = new Map<string, AssetSource>();
  const devAssets = new Map<string, Promise<CompressedAsset>>();
  const devModule = createAssetMap((source) => {
    const requestPath = `${DEV_ASSET_PREFIX}${source.profileId}/${source.sourceFileName}.gz`;
    devSources.set(requestPath, source);
    return JSON.stringify(requestPath);
  });
  let isServe = false;

  return {
    name: "aiohub-tokenizer-assets",
    enforce: "pre",

    configResolved(config) {
      isServe = config.command === "serve";
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID;
      return null;
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) return null;

      if (isServe) return devModule;

      return createAssetMap((source) => {
        const asset = loadCompressedAsset(source);
        const referenceId = this.emitFile({
          type: "asset",
          fileName: asset.fileName,
          source: asset.bytes,
        });
        return `import.meta.ROLLUP_FILE_URL_${referenceId}`;
      });
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        async (
          req: IncomingMessage,
          res: ServerResponse,
          next: (error?: unknown) => void
        ) => {
          const requestPath = req.url
            ? new URL(req.url, "http://vite.local").pathname
            : "";
          const source = devSources.get(requestPath);
          if (!source) {
            next();
            return;
          }

          try {
            let pending = devAssets.get(requestPath);
            if (!pending) {
              // 缓存进行中的任务，让并发请求共享读取与压缩；失败后允许重试。
              pending = loadDevAsset(source).catch((error) => {
                devAssets.delete(requestPath);
                throw error;
              });
              devAssets.set(requestPath, pending);
            }
            const asset = await pending;
            if (res.destroyed) return;

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/gzip");
            res.setHeader("Content-Length", asset.bytes.byteLength);
            res.setHeader("Cache-Control", "no-store");
            res.end(asset.bytes);
          } catch (error) {
            next(error);
          }
        }
      );
    },
  };
}
