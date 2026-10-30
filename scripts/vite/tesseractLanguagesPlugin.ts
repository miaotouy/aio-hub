import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

const MODULE_ID = "virtual:aiohub-tesseract-languages";
const RESOLVED_ID = `\0${MODULE_ID}`;
const SUFFIX = ".traineddata.gz";

/** Discover public language files without importing their binary contents. */
export function tesseractLanguagesPlugin(): Plugin {
  let directory: string | undefined;

  return {
    name: "aiohub-tesseract-languages",
    configResolved(config) {
      directory = config.publicDir
        ? path.resolve(config.publicDir, "tesseract-lang")
        : undefined;
    },
    resolveId(id) {
      return id === MODULE_ID ? RESOLVED_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      let codes: string[] = [];
      if (directory) {
        try {
          const entries = await readdir(directory, { withFileTypes: true });
          codes = entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(SUFFIX))
            .map((entry) => entry.name.slice(0, -SUFFIX.length))
            .sort();
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      return `export default ${JSON.stringify(codes)};`;
    },
    configureServer(server) {
      const refresh = (file: string) => {
        if (
          !directory ||
          path.dirname(path.resolve(file)) !== directory ||
          !file.endsWith(SUFFIX)
        )
          return;
        const module = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", refresh);
      server.watcher.on("unlink", refresh);
      server.httpServer?.once("close", () => {
        server.watcher.off("add", refresh);
        server.watcher.off("unlink", refresh);
      });
    },
  };
}
