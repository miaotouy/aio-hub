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
        {
          text: '用户手册',
          items: [
            { text: '快速开始', link: '/user-guide/index' },
            { text: 'CSS 变量宏指南', link: '/user-guide/css-variables-guide' },
          ]
        }
      ],
      '/guide/': [
        {
          text: '开发指南',
          items: [
            { text: '注册工具', link: '/guide/tool-registry-guide' },
            { text: '添加新工具', link: '/guide/adding-new-tool' },
            { text: '插件开发', link: '/guide/plugin-development-guide' },
            { text: '错误处理与日志', link: '/guide/logging-error-handling' },
          ]
        }
      ],
      '/architecture/': [
        {
          text: '架构设计',
          items: [
            { text: '总览', link: '/architecture/overview' },
            { text: 'LLM 架构', link: '/architecture/llm-apis-architecture' },
            { text: '主题系统', link: '/architecture/theme-system-architecture' },
            { text: '窗口同步', link: '/architecture/window-sync-architecture' },
          ]
        }
      ]
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