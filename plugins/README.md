# AIO Hub 插件目录

这个目录用于存放 AIO Hub 的插件。

## 重要说明

⚠️ **此目录已被添加到 `.gitignore`**

插件将在单独的仓库中管理，不会提交到主仓库。这样做的好处：

1. **保持主仓库轻量**: 避免插件文件膨胀主仓库体积
2. **独立版本管理**: 每个插件可以有自己的版本历史
3. **按需安装**: 用户只下载需要的插件
4. **便于分发**: 插件可以独立打包和分发

## 目录结构

```
plugins/
├── README.md                      # 本文件
├── AGENTS.template.md             # 插件仓库 AGENTS.md 模板
└── example-text-processor/        # 示例插件
    ├── manifest.json              # 插件清单
    ├── index.ts                   # 插件实现
    ├── AGENTS.md                  # AI 编码代理协作规范
    └── README.md                  # 插件说明
```

## 开发模式

在开发模式下（`bun run tauri dev`），你可以在此目录下创建插件进行测试：

1. 创建插件目录（如 `my-plugin/`）
2. 添加 `manifest.json` 和 `index.ts`
3. 插件会自动加载并支持热重载

## 依赖安装

主仓库的 Bun workspace 包含 `packages/*` 和 `mobile`；`plugins/` 下的插件按独立项目管理依赖。

- 在主仓库根目录运行 `bun install`，安装桌面端、移动端与共享包依赖。
- 开发某个插件时，进入该插件目录运行 `bun install`，由插件自己的 `package.json`、`bun.lock` 和 `node_modules` 管理依赖。
- 插件构建、测试所需的依赖应完整声明在插件的 `package.json` 中，插件锁文件随插件仓库提交。

```powershell
# 主仓库依赖
bun install

# 指定插件的依赖
cd plugins/my-plugin
bun install
```

各工作区可以按需克隆不同插件，主仓库锁文件只记录宿主及共享包的依赖。

### 共用宿主开发服务

插件源码仍由主仓库的 Vite 开发服务加载：开发加载器扫描 `plugins/*/manifest.json`、`plugins/*/index.ts` 和 `plugins/*/*.vue`，Vue 组件及其相对导入继续参与宿主 HMR。日常联调只需启动宿主 `bun run dev`，插件无需单独启动 Vite。

独立依赖安装只改变包管理边界。宿主 Vite 通过 `resolve.dedupe` 让插件与宿主共用 Vue 运行时；插件发布时再运行自身的构建脚本。

## AGENTS.md 模板

新建独立插件仓库时，建议将 [`AGENTS.template.md`](./AGENTS.template.md) 复制为插件仓库根目录的 `AGENTS.md`，再按插件类型（JavaScript / Native / Sidecar）补充本插件的构建、测试、发布和高风险约束。

## 示例插件

参考 `example-text-processor/` 了解如何创建插件。

## 插件开发指南

完整的插件开发指南请查看：[`docs/guide/plugins/`](../docs/guide/plugins/index.md)

## 生产环境

生产环境下，插件会从以下位置加载：

- Windows: `%APPDATA%/com.aio-hub.app/plugins/`
- macOS: `~/Library/Application Support/com.aio-hub.app/plugins/`
- Linux: `~/.config/com.aio-hub.app/plugins/`

## 当前状态

✅ **已实现的功能**:
- JavaScript 插件支持
- 开发模式热重载
- 统一的服务调用接口
- 插件元数据管理

⏸️ **待实现的功能**:
- Sidecar 插件支持
- 插件市场 UI
- 插件权限系统
- 插件生命周期钩子

## 注意事项

1. 不要在此目录下提交敏感信息
2. 插件应该有独立的 Git 仓库
3. 开发时可以创建测试插件，但不要提交到主仓库
4. 示例插件仅供参考，实际使用时请创建自己的插件
