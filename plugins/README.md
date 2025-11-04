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
└── example-text-processor/        # 示例插件
    ├── manifest.json              # 插件清单
    ├── index.ts                   # 插件实现
    └── README.md                  # 插件说明
```

## 开发模式

在开发模式下（`npm run dev`），你可以在此目录下创建插件进行测试：

1. 创建插件目录（如 `my-plugin/`）
2. 添加 `manifest.json` 和 `index.ts`
3. 插件会自动加载并支持热重载

## 示例插件

参考 `example-text-processor/` 了解如何创建插件。

## 插件开发指南

完整的插件开发指南请查看：[`docs/plugin-development-guide.md`](../docs/plugin-development-guide.md)

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
3. 开发时可以创建测试插件，但不要提交
4. 示例插件仅供参考，实际使用时请创建自己的插件