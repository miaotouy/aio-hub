# 应用内更新发布说明

本文记录桌面端应用内更新的 GitHub Release asset 方案。当前代码已接入 Tauri updater，发布流水线已准备好在存在签名产物时生成 `latest.json`。

## 当前已准备

- `build.yml` 会把构建产物中的 `.sig`、`.zip`、`.tar.gz` 一起收集到 Release assets。
- `release` job 会运行 `bun run release:updater-manifest`。
- `scripts/generate-updater-manifest.ts` 会扫描 `release-files` 中有同名 `.sig` 的 updater artifact，并生成 `latest.json`。
- 如果没有签名 updater artifact，脚本会跳过生成清单，普通 Release 仍可发布。

## 你需要准备

### 1. 生成 updater signing key

在本机生成一次密钥：

```bash
bunx tauri signer generate -w ~/.tauri/aiohub-updater.key
```

生成后会得到：

- 私钥：`~/.tauri/aiohub-updater.key`
- 公钥：`~/.tauri/aiohub-updater.key.pub`

私钥不要提交到仓库。

### 2. 配置 GitHub Actions Secrets

在 GitHub 仓库的 `Settings > Secrets and variables > Actions` 中添加：

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

`TAURI_SIGNING_PRIVATE_KEY` 填私钥文件内容。若生成密钥时没有设置密码，`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 可以留空或不创建。

### 3. 启用 Tauri updater 配置

拿到公钥后，再修改 `src-tauri/tauri.conf.json`。不要在没有真实公钥时提交占位值。

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "windows": {
        "installMode": "passive"
      },
      "endpoints": [
        "https://github.com/miaotouy/aio-hub/releases/latest/download/latest.json"
      ],
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEMyQTExNzU3RkZBNEQ0MjkKUldRcDFLVC9WeGVod3RFTVBQWHJ0R3lhUmNJSlFHbnhocTRNTlhRdzVzMmdtSGk2RC9sWjZLbU4K"
    }
  }
}
```

注意：上面是需要合并到现有 JSON 的片段，不是完整配置文件。

> ✅ **当前状态**: 上述配置已写入 `src-tauri/tauri.conf.json`，公钥已填入。密钥文件位于 `~/.tauri/aiohub-updater.key`，请妥善保管私钥。

### 4. 发布测试版本

1. 同步桌面端版本号：
   - `package.json`
   - `src-tauri/tauri.conf.json`
2. 创建并推送 tag，例如 `v0.6.4`。
3. 等待 GitHub Actions 创建草稿 Release。
4. 检查 Release assets 中是否出现：
   - updater artifact，例如 `.nsis.zip`、`.AppImage.tar.gz`、`.app.tar.gz`
   - 对应 `.sig`
   - `latest.json`
5. 发布草稿 Release。
6. 从旧版本应用内点击“检查更新”，验证下载、安装、重启。

## GitHub latest 的限制

`https://github.com/miaotouy/aio-hub/releases/latest/download/latest.json` 更适合 stable 通道。GitHub 的 latest 通常不会把 prerelease 当作 latest，所以 alpha / beta 预览通道后续建议改为独立清单地址，例如 GitHub Pages、独立静态域名或轻量更新接口。

在 preview 通道完善前，alpha / beta 版本仍保留 GitHub Releases 手动下载兜底。

## 清单格式

生成的 `latest.json` 形如：

```json
{
  "version": "v0.6.4",
  "notes": "Release notes in Markdown",
  "pub_date": "2026-06-24T00:00:00.000Z",
  "platforms": {
    "windows-x86_64-nsis": {
      "signature": "SIGNATURE_CONTENT",
      "url": "https://github.com/miaotouy/aio-hub/releases/download/v0.6.4/AIO.Hub_0.6.4_x64-setup.nsis.zip"
    }
  }
}
```

`signature` 必须是 `.sig` 文件内容。不能写 `.sig` 文件路径，也不能写 `.sig` 下载 URL。

