# 快速开始

> ⏱️ 跟着这页走一遍，5 分钟内你就能和 AI 聊上天。

---

## 1. 下载并安装

从 GitHub Releases 页面下载安装包，双击安装即可。

[![下载正式版](https://img.shields.io/github/v/release/miaotouy/aio-hub?style=for-the-badge&logo=github&label=下载正式版)](https://github.com/miaotouy/aio-hub/releases/latest)
[![下载预览版](https://img.shields.io/github/v/release/miaotouy/aio-hub?include_prereleases&style=for-the-badge&logo=github&label=下载预览版&color=yellow)](https://github.com/miaotouy/aio-hub/releases)

> 🚀 推荐下载 **预览版** (Pre-release)，更新更快，Bug 修得更勤。

| 平台        | 格式        | 怎么装             |
| :---------- | :---------- | :----------------- |
| **Windows** | `.exe`      | 双击，一路下一步   |
| **macOS**   | `.dmg`      | 拖进应用程序文件夹 |
| **Linux**   | `.AppImage` | 赋予执行权限后双击 |

安装遇到问题？看 [安装指南](./installation.md) 里的详细说明。

---

## 2. 添加 AI 服务

要和 AI 对话，你需要先告诉 AIO Hub 用哪家的服务。

1. 启动 AIO Hub，点击右上角的 <LIcon name="Settings" :size="18" /> **设置**
2. 找到 **LLM AI 服务配置**
3. 点击 **添加服务**，选一个预设（比如 DeepSeek、OpenAI）
4. 在右侧表单里粘贴你的 **API Key**，配置会自动保存

TODO: 截图-设置页面中的 LLM 服务配置界面

> 💡 **没有 API Key？** 推荐去 [DeepSeek](https://platform.deepseek.com) 或 [SiliconFlow](https://siliconflow.cn) 注册，都有免费额度，注册就能用。

---

## 3. 开始对话

1. 回到主页（点左上角 <LIcon name="Home" :size="18" /> 图标），点击 **<LIcon name="MessageSquare" :size="18"/> LLM 聊天** 卡片
2. 左侧会看到 **智能体列表**——点底部的 **添加智能体**，选个预设或从空白创建，确保选中了你刚配好的服务和模型
3. 选中智能体后，点右侧列表顶部的 <LIcon name="Plus" :size="18" /> 新建一个对话
4. 在底部输入框打字，按 `Ctrl + Enter` 发送

TODO: 截图-聊天界面

试试发一句："你好，介绍一下你自己"——看到回复就说明一切正常了 🎉

> 💡 **输入习惯**：`Enter` 是换行，`Ctrl + Enter` 才是发送。不会误触。

---

## 接下来？

搞定第一次对话后，你可以按需探索：

- **[工作区基础](./workspace-basics.md)** — 了解界面布局、多标签页、窗口分离等操作
- **[工具总览](./tools/index.md)** — 浏览所有 30+ 内置工具，看看哪些对你有用
- **[项目概览](./project-overview.md)** — 想深入了解 AIO Hub 能做什么
- **[故障排除](./troubleshooting.md)** — 遇到问题来这里找答案
