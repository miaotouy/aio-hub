import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import { FileSystemIconLoader } from "unplugin-icons/loaders";
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
      "fs": "node:fs",
      "path": "node:path",
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
      "@lobe-icons": fileURLToPath(new URL("./node_modules/@lobehub/icons-static-svg/icons", import.meta.url)),
      // Monaco 汉化劫持 - 拦截所有 NLS 相关请求
      "monaco-editor/esm/vs/nls.js": fileURLToPath(new URL("./src/utils/monaco-i18n/nls.js", import.meta.url)),
      "monaco-editor/esm/vs/nls": fileURLToPath(new URL("./src/utils/monaco-i18n/nls.js", import.meta.url)),
      "monaco-editor/dev/vs/nls.js": fileURLToPath(new URL("./src/utils/monaco-i18n/nls.js", import.meta.url)),
      "monaco-editor/dev/vs/nls": fileURLToPath(new URL("./src/utils/monaco-i18n/nls.js", import.meta.url)),
      // 针对绝对路径请求的额外劫持
      "/node_modules/monaco-editor/esm/vs/nls.js": fileURLToPath(new URL("./src/utils/monaco-i18n/nls.js", import.meta.url)),
      "/node_modules/monaco-editor/esm/vs/editor/editor.main.nls.js": fileURLToPath(new URL("./src/utils/monaco-i18n/nls.js", import.meta.url)),
    },
  },

  // 将 .gz 文件标记为资源文件
  assetsInclude: ['**/*.gz'],

  // 使用绝对路径作为 base，确保分离窗口（如 /detached-component/xxx）中的资源能正确加载
  // 如果使用相对路径 './'，当路由是 /detached-component/chat-area 时，
  // 资源会被错误地请求为 /detached-component/loader.js 而不是 /loader.js
  base: '/',

  plugins: [
    // 生产环境禁用 VueDevTools
    process.env.NODE_ENV !== 'production' && VueDevTools(),
    vue(),
    // 拦截 Monaco NLS 请求的中间件
    {
      name: 'monaco-nls-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          // 拦截所有对 nls.js 的请求
          if (req.url && req.url.includes('nls.js') && (req.url.includes('monaco-editor') || req.url.includes('monaco-i18n'))) {
            const fs = await import('node:fs');
            let nlsContent = fs.readFileSync(fileURLToPath(new URL("./src/utils/monaco-i18n/nls.js", import.meta.url)), 'utf-8');
            
            // 默认文件是不含 export 的纯脚本 (AMD 友好)
            // 如果是 Vite 的 ESM 导入请求 (?import)，我们需要动态补上 export 语句
            if (req.url.includes('import') || req.headers['sec-fetch-mode'] === 'cors') {
              nlsContent += `\nexport { localize, localize2, getConfiguredDefaultLocale, getNLSLanguage, getNLSMessages };\nexport default { localize, localize2, getConfiguredDefaultLocale, getNLSLanguage, getNLSMessages };`;
              // console.log(`[Monaco NLS] Serving ESM-compatible NLS: ${req.url}`);
            } else {
              // console.log(`[Monaco NLS] Serving AMD-compatible NLS: ${req.url}`);
            }
            
            res.setHeader('Content-Type', 'application/javascript');
            res.end(nlsContent);
            return;
          }
          next();
        });
      }
    },
    monaco({  // 替换旧的 monacoEditorPlugin，直接用 local: true 强制本地打包，避免 CDN
      local: true,
    }),
    Components({
      resolvers: [
        IconsResolver({
          prefix: "i",
          enabledCollections: ["ep", "lobe"],
          customCollections: ["lobe"],
        }),
      ],
      dts: "src/components.d.ts",
    }),
    Icons({
      autoInstall: true,
      compiler: "vue3",
      customCollections: {
        lobe: FileSystemIconLoader("./node_modules/@lobehub/icons-static-svg/icons", (svg) =>
          svg.replace(/^<svg /, '<svg fill="currentColor" ')
        ),
      },
    }),
  ].filter(Boolean),

  // 优化依赖配置
  optimizeDeps: {
    exclude: [
      "prettier",
      "@prettier/plugin-php",
      "@prettier/plugin-xml",
      "monaco-editor", // 必须排除预编译，否则 Alias 劫持对 node_modules 无效
    ],
  },

  // Worker 配置
  worker: {
    format: 'es',
    plugins: () => [
      // 可以在这里添加需要的插件
    ],
    rollupOptions: {
      external: ['fsevents'],
    },
  },

  // 构建配置
  build: {
    // 禁用资产内联，防止 Worker 脚本被转换为错误的 Data URL (如 video/mp2t)
    assetsInlineLimit: 0,

    // 增加 chunk 大小警告阈值到 1000 KiB
    chunkSizeWarningLimit: 1000,
    
    // 禁用 source map 以减少内存消耗
    sourcemap: false,
    
    // 减少 minify 选项以降低内存使用
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
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