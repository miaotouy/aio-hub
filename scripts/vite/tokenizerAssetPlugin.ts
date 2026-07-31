import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import type { Plugin, ViteDevServer } from "vite";
import { BUILTIN_TOKENIZER_ASSET_SOURCES } from "../../src/tools/token-calculator/data/builtin-tokenizer-assets-manifest";

const VIRTUAL_MODULE_ID = "virtual:aiohub-builtin-tokenizer-assets";
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;
const DEV_ASSET_PREFIX = "/@aiohub-tokenizer-assets/";
const require = createRequire(import.meta.url);

interface CompressedAsset {
  bytes: Buffer;
  fileName: string;
}

function loadCompressedAsset(
  profileId: string,
  packageName: string,
  sourceFileName: "tokenizer.json" | "tokenizer_config.json"
): CompressedAsset {
  const sourcePath = require.resolve(`${packageName}/models/${sourceFileName}`);
  return {
    bytes: gzipSync(readFileSync(sourcePath), { level: 9 }),
    fileName: `tokenizers/${profileId}/${sourceFileName}.gz`,
  };
}

function createAssetMap(
  getUrl: (
    profileId: string,
    fileName: string,
    asset: CompressedAsset
  ) => string
): string {
  const entries = Object.entries(BUILTIN_TOKENIZER_ASSET_SOURCES).map(
    ([profileId, { packageName }]) => {
      const tokenizer = loadCompressedAsset(
        profileId,
        packageName,
        "tokenizer.json"
      );
      const config = loadCompressedAsset(
        profileId,
        packageName,
        "tokenizer_config.json"
      );
      return `${JSON.stringify(packageName)}: {
        tokenizerUrl: ${getUrl(profileId, "tokenizer.json", tokenizer)},
        tokenizerConfigUrl: ${getUrl(profileId, "tokenizer_config.json", config)}
      }`;
    }
  );

  return `export default {\n${entries.join(",\n")}\n};`;
}

/**
 * 将 @lenml/tokenizer-* 包内嵌在 JS 中的模型数据改为独立 gzip 资产。
 *
 * - build：通过 Rollup emitFile 输出到 dist/tokenizers/<id>/；
 * - serve：由中间件按同一路径语义即时提供 gzip 数据；
 * - runtime：虚拟模块只导出轻量 URL 映射，不包含 tokenizer 数据。
 */
export function tokenizerAssetsPlugin(): Plugin {
  const devAssets = new Map<string, CompressedAsset>();
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

      if (isServe) {
        devAssets.clear();
        return createAssetMap((profileId, sourceFileName, asset) => {
          const requestPath = `${DEV_ASSET_PREFIX}${profileId}/${sourceFileName}.gz`;
          devAssets.set(requestPath, asset);
          return JSON.stringify(requestPath);
        });
      }

      return createAssetMap((_profileId, _sourceFileName, asset) => {
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
        (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const requestPath = req.url
            ? new URL(req.url, "http://vite.local").pathname
            : "";
          const asset = devAssets.get(requestPath);
          if (!asset) {
            next();
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/gzip");
          res.setHeader("Content-Length", asset.bytes.byteLength);
          res.setHeader("Cache-Control", "no-store");
          res.end(asset.bytes);
        }
      );
    },
  };
}
