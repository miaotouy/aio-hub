import type { SiteRecipe } from "../types";
import { getLocalISOString } from "@/utils/time";

const now = getLocalISOString();

/**
 * 内置站点配方库
 * 预设高频站点的提取规则
 */
export const builtinRecipes: SiteRecipe[] = [
  {
    id: "builtin-bilibili-video",
    name: "Bilibili 视频页",
    domain: "www.bilibili.com",
    pathPattern: "/video/**",
    contentPatterns: ["__INITIAL_STATE__", "bilibili\\.com", "哔哩哔哩"],
    protectedSelectors: [".up-info--right", ".video-info-meta", ".video-toolbar-container", ".recommend-list-v1"],
    waitFor: "h1.video-title",
    waitTimeout: 10000, // 10s 足够了，不需要 15s 那么久
    metadataScrapers: [
      {
        type: "json-ld",
        target: "VideoObject",
        mapping: {
          title: ["name"],
          description: ["description"],
          author: ["author.name"],
          publishDate: ["uploadDate"],
        },
      },
      {
        type: "json-variable",
        target: "__INITIAL_STATE__",
        mapping: {
          title: ["videoData.title", "title"],
          description: ["videoData.desc", "desc"],
          author: ["upData.name", "videoData.owner.name", "owner.name"],
          publishDate: ["videoData.pubdate", "videoData.ctime"],
        },
      },
      {
        type: "meta",
        target: "all",
        mapping: {
          description: ["description", "og:description"],
          title: ["name", "og:title", "twitter:title"],
          author: ["author"],
        },
      },
    ],
    extractSelectors: [
      "h1.video-title",
      ".up-info--right", // UP主信息
      ".video-info-meta", // 互动数据栏（播放、弹幕、日期）
      ".video-toolbar-container", // 点赞、投币、收藏工具栏
      ".video-info-description-text",
      ".desc-info-text",
      ".video-desc-info",
      ".tag-list",
      ".pubdate-ip",
      ".recommend-list-v1", // 相关视频列表
    ],
    excludeSelectors: [
      ".bili-header",
      ".nav-menu",
      ".video-page-special-card",
      ".ad-report",
      ".pop-live-small-mode",
      // ".right-container", // 不再排除整个右侧栏，因为里面有相关视频
      ".bili-footer",
      ".video-pod",
      // ".recommend-list-v1", // 不再排除相关视频
      ".fixed-sidenav-storage",
      ".reply-header", // 排除评论区头部
      ".reply-list", // 排除评论列表
    ],
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  },
  {
    id: "builtin-wechat-article",
    name: "微信公众号文章",
    domain: "mp.weixin.qq.com",
    pathPattern: "/s/**",
    protectedSelectors: ["#js_content"], // 保护正文区域不被去噪器删除
    extractSelectors: [
      "#js_content",
      "#activity-name", // 文章标题
      "#js_name", // 公众号名称
      "#publish_time", // 发布时间
    ],
    excludeSelectors: ["#js_pc_qr_code", "#content_bottom_area", ".qr_code_pc", ".rich_media_tool"],
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  },

  // ── 代码托管 / 原始内容类 ─────────────────────────────────────────────────────

  {
    id: "builtin-raw-github",
    name: "GitHub 原始文件 (raw)",
    domain: "raw.githubusercontent.com",
    // 无需 pathPattern，整个域名均为原始文件直链
    contentPatterns: ["raw\\.githubusercontent\\.com"],
    // 浏览器会把纯文本响应包在 <pre> 里渲染
    protectedSelectors: ["pre", "body > pre"],
    extractSelectors: ["pre", "body > pre"],
    excludeSelectors: [],
    metadataScrapers: [
      {
        type: "meta",
        target: "all",
        mapping: {
          title: ["og:title", "title"],
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  },

  {
    id: "builtin-github-gist",
    name: "GitHub Gist",
    domain: "gist.github.com",
    extractSelectors: [
      ".gist-meta", // Gist 元信息（作者、日期、描述）
      ".file-info", // 文件名及语言标识
      ".blob-wrapper", // 代码正文表格
      ".markdown-body", // Gist 中的 Markdown 渲染区域
    ],
    excludeSelectors: [".Header", ".gh-header-sticky", ".gist-count-tag", ".gist-footer", ".footer", ".signup-prompt"],
    metadataScrapers: [
      {
        type: "meta",
        target: "all",
        mapping: {
          title: ["og:title", "title"],
          description: ["og:description", "description"],
          author: ["author"],
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  },

  {
    id: "builtin-github-blob",
    name: "GitHub 仓库文件页",
    domain: "github.com",
    pathPattern: "/**/blob/**",
    extractSelectors: [
      ".repository-content", // 包含文件头部（面包屑、文件信息）
      ".Box-header", // 文件名行
      ".react-blob-header-edit-and-raw-actions", // 行数/语言
      ".react-code-view-header-element", // 文件头
      "#read-only-cursor-text-area", // 代码内容（新版 GitHub）
      ".highlight", // 代码高亮区（旧版 fallback）
      ".markdown-body", // Markdown 文件的渲染内容
    ],
    excludeSelectors: [
      ".Header",
      ".AppHeader",
      ".repository-lang-stats",
      "#repos-sticky-header",
      ".js-header-wrapper",
      ".footer",
      "footer",
      ".Layout-sidebar",
      ".file-navigation", // 目录树导航
      ".pagination-loader-container",
    ],
    metadataScrapers: [
      {
        type: "meta",
        target: "all",
        mapping: {
          title: ["og:title", "title"],
          description: ["og:description", "description"],
          author: ["author"],
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  },

  {
    id: "builtin-gitlab-blob",
    name: "GitLab 仓库文件页",
    domain: "gitlab.com",
    pathPattern: "/**/-/blob/**",
    extractSelectors: [
      ".file-header-content", // 文件名 + 元信息
      ".blob-viewer", // 代码正文区（渲染/高亮）
      ".blob-content", // 代码内容容器
      ".code.highlight", // 高亮代码块
    ],
    excludeSelectors: [
      ".header-content",
      ".super-sidebar",
      ".nav-sidebar",
      ".breadcrumb-item-text",
      "footer",
      ".footer-links",
    ],
    metadataScrapers: [
      {
        type: "meta",
        target: "all",
        mapping: {
          title: ["og:title", "title"],
          description: ["og:description", "description"],
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  },

  {
    id: "builtin-gitee-raw",
    name: "Gitee 原始文件 (raw)",
    domain: "gitee.com",
    pathPattern: "/*/raw/**",
    contentPatterns: ["gitee\\.com.*raw"],
    protectedSelectors: ["pre", "body > pre"],
    extractSelectors: ["pre", "body > pre"],
    excludeSelectors: [],
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  },

  {
    id: "builtin-gitee-blob",
    name: "Gitee 仓库文件页",
    domain: "gitee.com",
    pathPattern: "/*/blob/**",
    extractSelectors: [
      ".file-info", // 文件信息行（文件名、大小、行数）
      "#mfile-content", // 代码内容主体
      ".highlight", // 代码高亮
      ".render-container", // Markdown/HTML 渲染
    ],
    excludeSelectors: [".header", ".site-nav", ".git-header", "footer", ".footer", ".sidebar", ".repo-directory"],
    metadataScrapers: [
      {
        type: "meta",
        target: "all",
        mapping: {
          title: ["og:title", "title"],
          description: ["og:description", "description"],
          author: ["author"],
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  },

  {
    id: "builtin-pastebin",
    name: "Pastebin",
    domain: "pastebin.com",
    pathPattern: "/*", // 匹配 /xxxxxxxx 形式的 paste ID 路径
    contentPatterns: ["pastebin\\.com"],
    extractSelectors: [
      ".paste-title", // paste 标题
      ".left-details", // 作者、日期、语法等元信息
      ".source", // 代码正文（带行号）
      "#paste_code", // 代码纯文本区（旧版 fallback）
    ],
    excludeSelectors: [
      ".header",
      "#nav_bar",
      ".sidebar",
      ".right-sidebar",
      "footer",
      ".footer",
      ".advertisement",
      ".promo-desktop",
      ".g-recaptcha",
    ],
    metadataScrapers: [
      {
        type: "meta",
        target: "all",
        mapping: {
          title: ["og:title", "title"],
          description: ["og:description", "description"],
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  },

  {
    id: "builtin-npm-package",
    name: "npm 包页面",
    domain: "www.npmjs.com",
    pathPattern: "/package/**",
    extractSelectors: [
      "._702d723c", // 包名 + 版本（动态 className，按常见规律匹配）
      "[data-testid='package-name']",
      "[data-testid='package-version']",
      "#readme", // README 内容区
      "#top", // 包顶部信息
    ],
    excludeSelectors: [
      "header",
      "footer",
      "#skip-main-content",
      "nav",
      "[data-testid='sidebar']",
      ".sidebar",
      "#sponsors",
    ],
    metadataScrapers: [
      {
        type: "meta",
        target: "all",
        mapping: {
          title: ["og:title", "title"],
          description: ["og:description", "description"],
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  },

  {
    id: "builtin-pypi-package",
    name: "PyPI 包页面",
    domain: "pypi.org",
    pathPattern: "/project/**",
    extractSelectors: [
      ".package-header", // 包名 + 版本
      ".package-description", // 简短描述
      ".project-description", // 完整 README
      ".sidebar-section", // 包元信息（作者、License、链接等）
    ],
    excludeSelectors: ["header", "footer", ".banner", "#nav-sticky", ".sidebar-search"],
    metadataScrapers: [
      {
        type: "meta",
        target: "all",
        mapping: {
          title: ["og:title", "title"],
          description: ["og:description", "description"],
          author: ["author"],
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  },
];
