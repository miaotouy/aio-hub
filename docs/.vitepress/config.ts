import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "AIO Hub",
  description: "一站式桌面 AI 工具枢纽",
  ignoreDeadLinks: true,
  themeConfig: {
    logo: '/tauri.svg',
    nav: [
      { text: '用户手册', link: '/user-guide/index' },
      { text: '开发指南', link: '/guide/tool-registry-guide' },
      { text: '架构文档', link: '/architecture/overview' },
      { text: '关于项目', link: '/guide/contribution-guide' }
    ],
    sidebar: {
      '/user-guide/': [
        { text: '快速入门', items: [
          { text: '快速开始', link: '/user-guide/index' },
          { text: 'CSS 变量宏指南', link: '/user-guide/css-variables-guide' },
          // ==== UG_BASICS 插入点 ====
        ]},
        { text: '⚙️ 设置指南', collapsed: true, items: [
          // ==== UG_SETTINGS 插入点 ====
        ]},
        { text: '🛠️ 工具教程', collapsed: false, items: [
          { text: '工具总览', link: '/user-guide/tools/index' },
          // ==== UG_COMPLEX_TOOLS 插入点 ====
          // ==== UG_MEDIUM_TOOLS 插入点 ====
          // ==== UG_SINGLE_TOOLS 插入点 ====
        ]},
        { text: '高级功能', collapsed: true, items: [
          // ==== UG_ADVANCED 插入点 ====
        ]},
        { text: '📱 移动端', collapsed: true, items: [
          // ==== UG_MOBILE 插入点 ====
        ]},
        { text: '故障排除', link: '/user-guide/troubleshooting' },
      ],
      '/guide/': [
        { text: '开始', items: [
          { text: '注册工具', link: '/guide/tool-registry-guide' },
          { text: '添加新工具', link: '/guide/adding-new-tool' },
          // ==== GUIDE_START 插入点 ====
        ]},
        { text: '核心系统', items: [
          { text: '错误处理与日志', link: '/guide/logging-error-handling' },
          // ==== GUIDE_CORE 插入点 ====
        ]},
        { text: '插件开发', items: [
          { text: '插件开发总览', link: '/guide/plugin-development-guide' },
          // ==== GUIDE_PLUGINS 插入点 ====
        ]},
        { text: '资产管理', items: [
          // ==== GUIDE_ASSETS 插入点 ====
        ]},
        { text: 'LLM 集成', items: [
          // ==== GUIDE_LLM 插入点 ====
        ]},
        { text: 'Rust 后端', items: [
          // ==== GUIDE_RUST 插入点 ====
        ]},
        { text: '📱 移动端开发', items: [
          // ==== GUIDE_MOBILE 插入点 ====
        ]},
        { text: '测试', items: [
          // ==== GUIDE_TEST 插入点 ====
        ]},
        { text: '发布', items: [
          // ==== GUIDE_RELEASE 插入点 ====
        ]},
        { text: '故障排除', items: [
          // ==== GUIDE_TROUBLESHOOT 插入点 ====
        ]},
      ],
      '/architecture/': [
        { text: '总览', items: [
          { text: '架构概览', link: '/architecture/overview' },
          // ==== ARCH_OVERVIEW 插入点 ====
        ]},
        { text: 'LLM 系统', items: [
          { text: 'LLM 服务架构', link: '/architecture/llm-apis-architecture' },
          // ==== ARCH_LLM 插入点 ====
        ]},
        { text: '基础设施', items: [
          { text: '主题系统', link: '/architecture/theme-system-architecture' },
          // ==== ARCH_INFRA 插入点 ====
        ]},
        { text: '窗口与通信', items: [
          { text: '窗口同步', link: '/architecture/window-sync-architecture' },
          // ==== ARCH_WINDOW 插入点 ====
        ]},
        { text: '扩展系统', items: [
          // ==== ARCH_EXTEND 插入点 ====
        ]},
        { text: '知识库', items: [
          // ==== ARCH_KB 插入点 ====
        ]},
        { text: 'Tauri 后端', items: [
          // ==== ARCH_TAURI 插入点 ====
        ]},
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/miaotouy/aio-hub' }
    ],
    footer: {
      message: 'Released under the Apache-2.0 License.',
      copyright: 'Copyright © 2024-present miaotouy'
    }
  }
})