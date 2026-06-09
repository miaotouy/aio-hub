import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import Icons from "unplugin-icons/vite";
import { FileSystemIconLoader } from "unplugin-icons/loaders";
import IconsResolver from "unplugin-icons/resolver";
import Components from "unplugin-vue-components/vite";
import { VarletImportResolver } from "@varlet/import-resolver";

const host = process.env.TAURI_DEV_HOST;
const popperDeepImports = [
  "@popperjs/core/lib/modifiers/computeStyles.js",
  "@popperjs/core/lib/modifiers/flip.js",
  "@popperjs/core/lib/modifiers/offset.js",
  "@popperjs/core/lib/popper-lite.js",
] as const;
const popperAliases = Object.fromEntries(
  popperDeepImports.map((id) => [id, path.resolve(__dirname, "node_modules", id)])
);

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    vue(),
    Components({
      resolvers: [
        VarletImportResolver({ importStyle: false }),
        IconsResolver({
          prefix: "i",
          enabledCollections: ["lobe"],
          customCollections: ["lobe"],
        }),
      ],
    }),
    Icons({
      compiler: "vue3",
      customCollections: {
        lobe: FileSystemIconLoader("../node_modules/@lobehub/icons-static-svg/icons", (svg) =>
          svg.replace(/^<svg /, '<svg fill="currentColor" ')
        ),
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../src"),
      ...popperAliases,
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1430,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
