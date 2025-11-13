import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import IconsResolver from "unplugin-icons/resolver";
import Components from "unplugin-vue-components/vite";
import VueDevTools from "vite-plugin-vue-devtools";
import monaco from '@tomjs/vite-plugin-monaco-editor';
import { fileURLToPath, URL } from "node:url";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  // 路径别名配置
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@types": fileURLToPath(new URL("./src/types", import.meta.url)),
      "@components": fileURLToPath(new URL("./src/components", import.meta.url)),
      "@utils": fileURLToPath(new URL("./src/utils", import.meta.url)),
      "@composables": fileURLToPath(new URL("./src/composables", import.meta.url)),
      "@config": fileURLToPath(new URL("./src/config", import.meta.url)),
      "@tools": fileURLToPath(new URL("./src/tools", import.meta.url)),
      "@views": fileURLToPath(new URL("./src/views", import.meta.url)),
      "@styles": fileURLToPath(new URL("./src/styles", import.meta.url)),
      "@assets": fileURLToPath(new URL("./src/assets", import.meta.url)),
    },
  },

  // 将 .gz 文件标记为资源文件
  assetsInclude: ['**/*.gz'],

  base: './',

  plugins: [
    // 生产环境禁用 VueDevTools
    process.env.NODE_ENV !== 'production' && VueDevTools(),
    vue(),
    monaco({  // 替换旧的 monacoEditorPlugin，直接用 local: true 强制本地打包，避免 CDN
      local: true,
    }),
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
  ].filter(Boolean),

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
    // 增加 chunk 大小警告阈值到 1000 KiB
    chunkSizeWarningLimit: 1000,
    
    // 禁用 source map 以减少内存消耗
    sourcemap: false,
    
    // 减少 minify 选项以降低内存使用
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 1, // 减少压缩次数
      },
      format: {
        comments: false, // 移除注释
      },
    },
    
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
    
    // 优化代码分割,减少内存消耗
    rollupOptions: {
      // 外部化 macOS 专用依赖和插件构建脚本
      external: [
        'fsevents',
        /^.*\/plugins\/.*\/(build\.js|vite\.config\.js|package\.json|Cargo\.toml|.*\.rs)$/,
      ],
      output: {
        manualChunks: {
          // 将大型依赖单独打包
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-element': ['element-plus'],
          'vendor-editor': ['codemirror', '@guolao/vue-monaco-editor'],
          'vendor-prettier': ['prettier', '@prettier/plugin-php', '@prettier/plugin-xml'],
          'vendor-tokenizers': [
            '@lenml/tokenizers',
            '@lenml/tokenizer-claude',
            '@lenml/tokenizer-deepseek_v3',
            '@lenml/tokenizer-gemini',
            '@lenml/tokenizer-gpt4',
            '@lenml/tokenizer-gpt4o',
            '@lenml/tokenizer-llama3_2',
            '@lenml/tokenizer-qwen3',
          ],
        },
      },
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
});