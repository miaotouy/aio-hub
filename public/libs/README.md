# 公共库本地化目录 (Local Libraries)

该目录用于存放由 HTML 渲染器 (`HtmlInteractiveViewer.vue`) 拦截并本地化的常用 JavaScript 库。

## 为什么需要这个目录？

当 LLM 生成包含数据可视化（如 D3.js, ECharts）或图表（如 Mermaid）的 HTML 代码时，通常会引用 CDN 链接。为了在离线环境或网络不佳的情况下仍能正常渲染，渲染器会自动将匹配的 CDN 链接重定向到此目录下的本地文件。

## 如何配置？

请将以下库的压缩版 (`.min.js`) 下载并放置在此目录下，文件名必须与下方列出的 **本地文件名** 一致：

| 库名称 | 推荐版本 | 本地文件名 |
| :--- | :--- | :--- |
| **D3.js** | v7.x | `d3.min.js` |
| **Mermaid** | v10.x+ | `mermaid.min.js` |
| **jQuery** | v3.x | `jquery.min.js` |
| **Lodash** | v4.x | `lodash.min.js` |
| **ECharts** | v5.x | `echarts.min.js` |
| **Three.js** | r150+ | `three.min.js` |
| **Chart.js** | v4.x | `chart.min.js` |
| **Anime.js** | v3.x | `anime.min.js` |
| **GSAP** | v3.x | `gsap.min.js` |
| **p5.js** | v1.x | `p5.min.js` |

或者使用 `scripts\download-libs.ts` 一键下载。

## 拦截逻辑

拦截逻辑定义在 `src/tools/rich-text-renderer/utils/cdnLocalizer.ts` 中。它支持匹配来自 `jsdelivr.net`, `unpkg.com`, `cdnjs.cloudflare.com` 等主流 CDN 的链接。