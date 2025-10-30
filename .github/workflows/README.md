# GitHub Actions 自动构建说明

本项目使用 GitHub Actions 实现自动化构建和发布流程。

## 📋 Workflow 列表

### 1. `build.yml` - 构建和发布

**触发条件：**
- 推送版本标签（如 `v0.1.9`、`v1.0.0`）
- 手动触发（在 GitHub Actions 页面）

**构建平台：**
- ✅ Windows (x64) - 生成 `.exe` 安装程序
- ✅ macOS (Intel) - 生成 `.dmg` 镜像
- ✅ macOS (Apple Silicon) - 生成 `.dmg` 镜像
- ✅ Linux (x64) - 生成 `.deb` 和 `.AppImage`

**发布流程：**
1. 检出代码
2. 安装 Bun、Rust 和系统依赖
3. 缓存 Rust 编译产物
4. 安装前端依赖
5. 使用 Tauri Action 构建应用
6. 自动创建 GitHub Release（草稿模式）
7. 上传构建产物到 Release

### 2. `pr-check.yml` - PR 检查

**触发条件：**
- Pull Request 到 `main` 或 `dev` 分支
- 推送到 `main` 或 `dev` 分支

**检查内容：**
- TypeScript 类型检查
- Rust 代码检查（cargo check）
- Rust 单元测试（cargo test）

## 🚀 如何使用

### 发布新版本

1. **更新版本号**
   
   同步更新以下三个文件中的版本号：
   - `package.json` 中的 `version`
   - `src-tauri/Cargo.toml` 中的 `version`
   - `src-tauri/tauri.conf.json` 中的 `version`

2. **提交更改**
   ```bash
   git add .
   git commit -m "chore: bump version to 0.1.9"
   git push
   ```

3. **创建并推送标签**
   ```bash
   # 创建标签
   git tag v0.1.9
   
   # 推送标签到远程仓库
   git push origin v0.1.9
   ```

4. **等待构建完成**
   
   前往 [GitHub Actions](https://github.com/miaotouy/aio-hub/actions) 页面查看构建进度。
   
   构建时间参考：
   - Windows: 约 10-15 分钟
   - macOS: 约 15-20 分钟
   - Linux: 约 8-12 分钟

5. **发布 Release**
   
   构建完成后，会自动创建一个草稿 Release：
   - 前往 [Releases](https://github.com/miaotouy/aio-hub/releases) 页面
   - 编辑草稿 Release，补充更新日志
   - 点击 "Publish release" 正式发布

### 手动触发构建

1. 前往 [GitHub Actions](https://github.com/miaotouy/aio-hub/actions) 页面
2. 选择 "构建和发布" workflow
3. 点击 "Run workflow" 按钮
4. 选择分支并触发

### 预发布版本

对于 Beta 或 Alpha 版本，在标签中包含相应关键字：
```bash
git tag v0.1.9-beta.1
git push origin v0.1.9-beta.1
```

系统会自动将其标记为预发布版本（Pre-release）。

## 🔧 本地测试构建

在推送标签前，建议先在本地测试构建：

```bash
# 安装依赖
bun install

# 构建前端
bun run build

# 构建 Tauri 应用
bun tauri build
```

构建产物位于：
- Windows: `src-tauri/target/release/bundle/nsis/`
- macOS: `src-tauri/target/release/bundle/dmg/`
- Linux: `src-tauri/target/release/bundle/deb/` 和 `appimage/`

## ⚙️ 配置说明

### 环境变量

目前不需要额外配置环境变量，所有必需的 token 都由 GitHub 自动提供。

如果将来需要添加代码签名等功能，可以在仓库设置中添加 Secrets：
1. 前往仓库的 Settings > Secrets and variables > Actions
2. 点击 "New repository secret"
3. 添加所需的密钥

### 修改构建配置

如需修改构建平台或参数，编辑 `.github/workflows/build.yml`：

```yaml
strategy:
  matrix:
    include:
      - platform: 'windows-latest'
        target: 'x86_64-pc-windows-msvc'
        bundles: 'nsis'  # 可选: msi, nsis
```

## 📝 注意事项

1. **版本号一致性**
   
   确保三个配置文件中的版本号完全一致，否则可能导致构建问题。

2. **标签命名规范**
   
   必须使用 `v` 开头的语义化版本标签（如 `v1.0.0`），否则不会触发构建。

3. **Release 草稿**
   
   所有构建都会创建草稿 Release，需要手动发布。这是为了给你机会：
   - 检查构建产物
   - 补充更新日志
   - 修改发布说明

4. **构建失败处理**
   
   如果某个平台构建失败，不会影响其他平台的构建。可以在 Actions 页面查看详细日志。

5. **缓存机制**
   
   工作流会缓存 Rust 编译产物和依赖，首次构建较慢，后续构建会快很多。

## 🐛 常见问题

**Q: 推送标签后没有触发构建？**

A: 检查标签格式是否正确（必须是 `v*.*.*`），可以在 Actions 页面手动触发。

**Q: 构建失败怎么办？**

A: 
1. 查看 Actions 页面的详细日志
2. 检查版本号是否一致
3. 确保代码可以在本地成功构建
4. 查看是否有依赖冲突或缺失

**Q: 如何修改 Release 说明模板？**

A: 编辑 `build.yml` 中的 `releaseBody` 字段。

**Q: 能否支持更多平台？**

A: 可以在 `matrix.include` 中添加更多平台配置，但需要注意 GitHub Actions 的限额。

## 📚 相关资源

- [Tauri Action 文档](https://github.com/tauri-apps/tauri-action)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Tauri 构建指南](https://tauri.app/v1/guides/building/)