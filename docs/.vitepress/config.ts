import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import Sitemap from "vite-plugin-sitemap";

export default withMermaid({
  title: "AIO Hub",
  description: "一站式桌面 AI 工具枢纽",
  ignoreDeadLinks: true,
  lastUpdated: true,
  cleanUrls: true,
  head: [
    ["link", { rel: "icon", href: "/aio-icon-color.svg" }],
    ["meta", { name: "author", content: "miaotouy" }],
    ["meta", { name: "keywords", content: "AIO Hub, AI Tools, Tauri, Vue, Desktop App, LLM, OCR" }],
    ["meta", { property: "og:title", content: "AIO Hub Documentation" }],
    ["meta", { property: "og:description", content: "Documentation for AIO Hub - The all-in-one AI tool hub." }],
  ],
  vite: {
    plugins: [
      Sitemap({
        hostname: "https://docs.aiohub-app.com",
        outDir: "docs/.vitepress/dist",
      }),
    ],
    ssr: {
      noExternal: ["mermaid", "dayjs", "lucide-vue-next"],
    },
    optimizeDeps: {
      include: ["mermaid", "dayjs", "lucide-vue-next"],
    },
    server: {
      watch: {
        usePolling: true,
        interval: 100,
      },
    },
  },
  themeConfig: {
    logo: "/aio-icon-color.svg",
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: "搜索文档", buttonAriaLabel: "搜索文档" },
              modal: {
                noResultsText: "无法找到相关结果",
                resetButtonTitle: "清除查询条件",
                footer: { selectText: "选择", navigateText: "切换", closeText: "关闭" },
              },
            },
          },
        },
      },
    },
    nav: [
      { text: "用户手册", link: "/user-guide/index" },
      { text: "开发指南", link: "/guide/tool-registry-guide" },
      { text: "架构文档", link: "/architecture/overview" },
      { text: "关于项目", link: "/guide/contribution-guide" },
    ],
    sidebar: {
      "/user-guide/": [
        {
          text: "快速入门",
          items: [
            { text: "手册首页", link: "/user-guide/index" },
            { text: "安装指南", link: "/user-guide/installation" },
            { text: "快速开始", link: "/user-guide/getting-started" },
            { text: "项目概览", link: "/user-guide/project-overview" },
            { text: "工作区基础", link: "/user-guide/workspace-basics" },
            { text: "故障排除", link: "/user-guide/troubleshooting" },
            { text: "macOS Gatekeeper 修复", link: "/user-guide/faq/macos-gatekeeper-fix" },
            // ==== UG_BASICS 插入点 ====
          ],
        },
        {
          text: "⚙️ 设置指南",
          collapsed: true,
          items: [
            { text: "设置概览", link: "/user-guide/settings/index" },
            { text: "外观与壁纸", link: "/user-guide/settings/appearance" },
            { text: "工具管理", link: "/user-guide/settings/tool-management" },
            { text: "LLM AI 服务配置", link: "/user-guide/settings/llm-service" },
            { text: "AI 模型元数据配置", link: "/user-guide/settings/model-metadata" },
            { text: "云端 OCR 服务", link: "/user-guide/settings/ocr-service" },
            { text: "用户档案管理", link: "/user-guide/settings/user-profiles" },
            { text: "通用与启动项", link: "/user-guide/settings/general-startup" },
            { text: "CSS 样式覆盖", link: "/user-guide/settings/custom-css" },
            { text: "日志与资产管理", link: "/user-guide/settings/logs-assets" },
            { text: "关于与许可", link: "/user-guide/settings/about" },
            // ==== UG_SETTINGS 插入点 ====
          ],
        },
        {
          text: "🛠️ 工具教程",
          collapsed: false,
          items: [
            { text: "工具总览", link: "/user-guide/tools/index" },
            {
              text: "智能体对话",
              collapsed: false,
              items: [
                { text: "快速上手", link: "/user-guide/tools/llm-chat/index" },
                {
                  text: "智能体 (Agent)",
                  collapsed: true,
                  items: [
                    { text: "概览", link: "/user-guide/tools/llm-chat/agents/index" },
                    { text: "编辑器指南", link: "/user-guide/tools/llm-chat/agents/editor-guide" },
                    { text: "参数配置", link: "/user-guide/tools/llm-chat/agents/parameters" },
                    { text: "资产管理", link: "/user-guide/tools/llm-chat/agents/assets" },
                    { text: "虚拟时间线", link: "/user-guide/tools/llm-chat/agents/virtual-timeline" },
                    { text: "用户档案", link: "/user-guide/tools/llm-chat/agents/user-profiles" },
                    { text: "酒馆兼容性", link: "/user-guide/tools/llm-chat/agents/st-compatibility" },
                  ],
                },
                {
                  text: "消息与分支",
                  collapsed: true,
                  items: [
                    { text: "消息操作概览", link: "/user-guide/tools/llm-chat/messages/index" },
                    { text: "列表与操作栏", link: "/user-guide/tools/llm-chat/messages/message-list" },
                    { text: "树图视图", link: "/user-guide/tools/llm-chat/sessions/tree-graph" },
                    { text: "续写与补全", link: "/user-guide/tools/llm-chat/messages/continue-completion" },
                    { text: "路径转附件", link: "/user-guide/tools/llm-chat/messages/path-to-attachment" },
                    { text: "数据编辑器", link: "/user-guide/tools/llm-chat/messages/message-data-editor" },
                  ],
                },
                {
                  text: "快捷操作",
                  collapsed: true,
                  items: [
                    { text: "功能概览", link: "/user-guide/tools/llm-chat/quick-actions/index" },
                    { text: "模板语法", link: "/user-guide/tools/llm-chat/quick-actions/template-syntax" },
                    { text: "库管理", link: "/user-guide/tools/llm-chat/quick-actions/management" },
                  ],
                },
                {
                  text: "上下文管道",
                  collapsed: true,
                  items: [
                    { text: "工作原理", link: "/user-guide/tools/llm-chat/context-pipeline/index" },
                    { text: "处理器详解", link: "/user-guide/tools/llm-chat/context-pipeline/processors" },
                    { text: "上下文分析器", link: "/user-guide/tools/llm-chat/context-pipeline/analyzer" },
                    { text: "知识库 (RAG)", link: "/user-guide/tools/llm-chat/context-pipeline/knowledge-processor" },
                    { text: "正则管道", link: "/user-guide/tools/llm-chat/context-pipeline/regex-pipeline" },
                    { text: "上下文压缩", link: "/user-guide/tools/llm-chat/context-pipeline/context-compression" },
                    { text: "Token 预算管理", link: "/user-guide/tools/llm-chat/context-pipeline/token-management" },
                  ],
                },
                {
                  text: "世界书 (Worldbook)",
                  collapsed: true,
                  items: [
                    { text: "功能概览", link: "/user-guide/tools/llm-chat/worldbook/index" },
                    { text: "条目管理", link: "/user-guide/tools/llm-chat/worldbook/entry-management" },
                    { text: "扫描策略", link: "/user-guide/tools/llm-chat/worldbook/scanning-strategy" },
                  ],
                },
                {
                  text: "变量与宏系统",
                  collapsed: true,
                  items: [
                    { text: "宏系统概览", link: "/user-guide/tools/llm-chat/macro-system/index" },
                    { text: "宏参考手册", link: "/user-guide/tools/llm-chat/macro-system/macro-reference" },
                    { text: "会话变量", link: "/user-guide/tools/llm-chat/macro-system/session-variables" },
                    { text: "CSS 变量指南", link: "/user-guide/tools/llm-chat/macro-system/css-variables-guide" },
                  ],
                },
                {
                  text: "聊天设置",
                  collapsed: true,
                  items: [
                    { text: "设置概览", link: "/user-guide/tools/llm-chat/settings/index" },
                    { text: "通用设置", link: "/user-guide/tools/llm-chat/settings/general" },
                    { text: "UI 偏好", link: "/user-guide/tools/llm-chat/settings/ui-preferences" },
                    { text: "渲染与显示", link: "/user-guide/tools/llm-chat/settings/rendering" },
                    { text: "消息管理", link: "/user-guide/tools/llm-chat/settings/message-management" },
                    { text: "快捷键", link: "/user-guide/tools/llm-chat/settings/shortcuts" },
                    { text: "话题命名", link: "/user-guide/tools/llm-chat/settings/topic-naming" },
                    { text: "翻译助手", link: "/user-guide/tools/llm-chat/settings/translation" },
                    { text: "附件转写", link: "/user-guide/tools/llm-chat/settings/transcription" },
                    { text: "文本处理", link: "/user-guide/tools/llm-chat/settings/text-processing" },
                    { text: "知识库设置", link: "/user-guide/tools/llm-chat/settings/knowledge-base" },
                    { text: "世界书", link: "/user-guide/tools/llm-chat/settings/worldbook" },
                    { text: "快捷操作", link: "/user-guide/tools/llm-chat/settings/quick-actions" },
                    { text: "样式设置", link: "/user-guide/tools/llm-chat/settings/styling" },
                    { text: "上下文管道", link: "/user-guide/tools/llm-chat/settings/context-pipeline" },
                    { text: "请求设置", link: "/user-guide/tools/llm-chat/settings/request" },
                    { text: "开发者选项", link: "/user-guide/tools/llm-chat/settings/developer" },
                  ],
                },
                { text: "会话管理", link: "/user-guide/tools/llm-chat/sessions" },
                { text: "导出与导入", link: "/user-guide/tools/llm-chat/export-import" },
                { text: "快捷键与技巧", link: "/user-guide/tools/llm-chat/shortcuts-tips" },
                { text: "常见问题", link: "/user-guide/tools/llm-chat/faq" },
              ],
            },
            // ==== UG_COMPLEX_TOOLS 插入点 ====
            {
              text: "知识库",
              collapsed: true,
              items: [
                { text: "快速上手", link: "/user-guide/tools/knowledge-base/index" },
                { text: "索引引擎", link: "/user-guide/tools/knowledge-base/indexing" },
                { text: "条目管理", link: "/user-guide/tools/knowledge-base/entry-management" },
                { text: "Agent 集成", link: "/user-guide/tools/knowledge-base/agent-integration" },
              ],
            },
            {
              text: "资产管理器",
              collapsed: true,
              items: [
                { text: "快速上手", link: "/user-guide/tools/asset-manager/index" },
                { text: "来源追踪", link: "/user-guide/tools/asset-manager/source-tracking" },
                { text: "缩略图管理", link: "/user-guide/tools/asset-manager/thumbnails-batch" },
              ],
            },
            {
              text: "智能 OCR",
              collapsed: true,
              items: [
                { text: "快速上手", link: "/user-guide/tools/smart-ocr/index" },
                { text: "进阶配置", link: "/user-guide/tools/smart-ocr/advanced" },
              ],
            },
            {
              text: "媒体生成中心",
              collapsed: true,
              items: [
                { text: "快速上手", link: "/user-guide/tools/media-generator/index" },
                { text: "资产管理", link: "/user-guide/tools/media-generator/asset-management" },
              ],
            },
            {
              text: "Web Canvas",
              collapsed: true,
              items: [
                { text: "快速上手", link: "/user-guide/tools/web-canvas/index" },
                { text: "进阶", link: "/user-guide/tools/web-canvas/advanced" },
              ],
            },
            // ==== UG_MEDIUM_TOOLS 插入点 ====
            { text: "多模态转写", link: "/user-guide/tools/transcription" },
            { text: "JSON 格式化", link: "/user-guide/tools/json-formatter" },
            { text: "正则批量替换", link: "/user-guide/tools/regex-applier" },
            { text: "文本差异对比", link: "/user-guide/tools/text-diff" },
            { text: "代码格式化", link: "/user-guide/tools/code-formatter" },
            { text: "Token 计算器", link: "/user-guide/tools/token-calculator" },
            { text: "富文本渲染测试", link: "/user-guide/tools/rich-text-renderer" },
            { text: "组件测试器", link: "/user-guide/tools/component-tester" },
            { text: "工具调用测试", link: "/user-guide/tools/tool-calling" },
            { text: "API 测试工具", link: "/user-guide/tools/api-tester" },
            { text: "Git 分析器", link: "/user-guide/tools/git-analyzer" },
            { text: "服务注册表浏览器", link: "/user-guide/tools/service-monitor" },
            { text: "VCP 连接器", link: "/user-guide/tools/vcp-connector" },
            { text: "网页蒸馏室", link: "/user-guide/tools/web-distillery" },
            { text: "内容查重", link: "/user-guide/tools/content-deduplicator" },
            { text: "目录清洁工具", link: "/user-guide/tools/directory-janitor" },
            { text: "目录结构浏览器", link: "/user-guide/tools/directory-tree" },
            { text: "符号链接搬家工具", link: "/user-guide/tools/symlink-mover" },
            { text: "数据筛选工具", link: "/user-guide/tools/data-filter" },
            { text: "图片色彩分析", link: "/user-guide/tools/color-picker" },
            { text: "FFmpeg 工具", link: "/user-guide/tools/ffmpeg-tools" },
            { text: "弹幕播放器", link: "/user-guide/tools/danmaku-player" },
            { text: "AI 信息解析", link: "/user-guide/tools/media-info-reader" },
            { text: "系统脉搏", link: "/user-guide/tools/system-pulse" },
            { text: "LLM 检查器", link: "/user-guide/tools/llm-inspector" },
            { text: "Embedding 测试", link: "/user-guide/tools/embedding-playground" },
            { text: "ST 世界书编辑器", link: "/user-guide/tools/st-worldbook-editor" },
            // ==== UG_SINGLE_TOOLS 插入点 ====
          ],
        },
        {
          text: "高级功能",
          collapsed: true,
          items: [
            // ==== UG_ADVANCED 插入点 ====
          ],
        },
        {
          text: "📱 移动端",
          collapsed: true,
          items: [
            // ==== UG_MOBILE 插入点 ====
          ],
        },
      ],
      "/guide/": [
        {
          text: "开始",
          items: [
            { text: "注册工具", link: "/guide/tool-registry-guide" },
            { text: "添加新工具", link: "/guide/adding-new-tool" },
            // ==== GUIDE_START 插入点 ====
          ],
        },
        {
          text: "核心系统",
          items: [
            { text: "错误处理与日志", link: "/guide/logging-error-handling" },
            // ==== GUIDE_CORE 插入点 ====
          ],
        },
        {
          text: "插件开发",
          items: [
            { text: "插件开发总览", link: "/guide/plugin-development-guide" },
            // ==== GUIDE_PLUGINS 插入点 ====
          ],
        },
        {
          text: "资产管理",
          items: [
            // ==== GUIDE_ASSETS 插入点 ====
          ],
        },
        {
          text: "LLM 集成",
          items: [
            // ==== GUIDE_LLM 插入点 ====
          ],
        },
        {
          text: "Rust 后端",
          items: [
            // ==== GUIDE_RUST 插入点 ====
          ],
        },
        {
          text: "📱 移动端开发",
          items: [
            // ==== GUIDE_MOBILE 插入点 ====
          ],
        },
        {
          text: "测试",
          items: [
            // ==== GUIDE_TEST 插入点 ====
          ],
        },
        {
          text: "发布",
          items: [
            // ==== GUIDE_RELEASE 插入点 ====
          ],
        },
        {
          text: "故障排除",
          items: [
            // ==== GUIDE_TROUBLESHOOT 插入点 ====
          ],
        },
      ],
      "/architecture/": [
        {
          text: "总览",
          items: [
            { text: "架构概览", link: "/architecture/overview" },
            // ==== ARCH_OVERVIEW 插入点 ====
          ],
        },
        {
          text: "LLM 系统",
          items: [
            { text: "LLM 服务架构", link: "/architecture/llm-apis-architecture" },
            // ==== ARCH_LLM 插入点 ====
          ],
        },
        {
          text: "基础设施",
          items: [
            { text: "主题系统", link: "/architecture/theme-system-architecture" },
            // ==== ARCH_INFRA 插入点 ====
          ],
        },
        {
          text: "窗口与通信",
          items: [
            { text: "窗口同步", link: "/architecture/window-sync-architecture" },
            // ==== ARCH_WINDOW 插入点 ====
          ],
        },
        {
          text: "扩展系统",
          items: [
            // ==== ARCH_EXTEND 插入点 ====
          ],
        },
        {
          text: "知识库",
          items: [
            // ==== ARCH_KB 插入点 ====
          ],
        },
        {
          text: "Tauri 后端",
          items: [
            // ==== ARCH_TAURI 插入点 ====
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/miaotouy/aio-hub" }],
    footer: {
      message: "Released under the Apache-2.0 License.",
      copyright: "Copyright © 2024-present miaotouy",
    },
  },
});
