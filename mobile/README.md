# AIO Hub Mobile

一站式桌面AI工具枢纽的移动端实现。基于 Tauri v2 + Vue 3 + Varlet UI 构建。

## ⚠️ 开源协议声明 (License Notice)

**重要：移动端与桌面端采用不同的授权协议。**

- **桌面端**: 遵循 [MIT License](../LICENSE)。
- **移动端 (`mobile/` 目录)**: 遵循 [Proprietary License](./LICENSE) (私有许可证)。

### 为什么移动端不使用 MIT？
鉴于移动端生态环境的复杂性，为了防止恶意套壳、非法二次分发以及未经授权的商业化行为，移动端代码库目前**仅供个人学习与研究使用**。

**严禁行为：**
1. **禁止商用**: 未经作者书面授权，严禁将本项目移动端代码或编译产物用于任何盈利性活动。
2. **禁止二次分发**: 严禁将本项目打包后上传至任何第三方应用商店或下载站。
3. **禁止非法套壳**: 严禁在未保留原始署名或违反本协议的情况下进行二次开发并发布。

开发者保留对任何侵权行为追究法律责任的权利。

## 技术栈

- **框架**: [Tauri v2](https://v2.tauri.app/)
- **前端**: [Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/)
- **UI 组件库**: [Varlet UI](https://varletjs.org/varlet-ui/)
- **状态管理**: [Pinia](https://pinia.vuejs.org/)
- **语言**: TypeScript / Rust

## 开发与构建

在根目录下运行：

- **Android 开发**: `bun run mtad`
- **Android 构建**: `bun run mtab`
- **iOS 开发**: `bun run mtid`
- **iOS 构建**: `bun run mtib`

更多信息请参考项目根目录的说明。
