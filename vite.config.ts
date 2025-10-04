import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import IconsResolver from "unplugin-icons/resolver";
import Components from "unplugin-vue-components/vite";
import VueDevTools from "vite-plugin-vue-devtools";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    VueDevTools(),
    vue(),
    Components({
      resolvers: [
        IconsResolver({
          prefix: "i",
          enabledCollections: ["ep"],
        }),
      ],
      dts: "src/components.d.ts",
    }),
    Icons({
      autoInstall: true,
      compiler: "vue3",
    }),
  ],

  // 优化依赖配置
  optimizeDeps: {
    exclude: [
      "prettier",
      "@prettier/plugin-php",
      "@prettier/plugin-xml",
    ],
  },

  // 构建配置
  build: {
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
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
