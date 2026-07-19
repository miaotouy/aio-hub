# 移动端构建说明

本文说明 AIO Hub Mobile 的本地构建方式、Android 产物类型、签名配置、
GitHub Actions 发布要求和常见安装问题。命令均在仓库根目录执行，并以当前
`package.json` 和 `scripts/build-android.ts` 的实现为准。

## 环境准备

Android 构建需要以下工具：

- Bun，以及仓库根目录和 `mobile/` 工作区的依赖；
- Rust stable 和需要构建的 Android target；
- JDK 17；
- Android SDK、Build Tools 和 NDK；
- Tauri v2 Android 开发环境。

首次构建前运行：

```bash
bun install
```

真实 Tauri 功能必须通过 Android 应用或项目已有的移动端测试验证。普通浏览器
缺少 Tauri WebView 注入的 IPC、插件和窗口运行时，不能代替真机验证。

## 本地开发

连接 Android 设备或启动模拟器后，在仓库根目录运行：

```bash
bun run mtad
```

该命令启动 Tauri Android 开发模式。需要真机连接时，可先用 `adb devices`
确认设备已授权。

## Android 构建命令

根脚本 `bun run mtab` 会调用 `scripts/build-android.ts`，在 Tauri 构建完成后
排除 Gradle 标记为 unsigned 的 APK，并将产物整理为带版本号的统一文件名。

### 默认构建

```bash
bun run mtab
```

默认构建 release 通用 APK 和 AAB。

### 只构建 APK 或 AAB

```bash
bun run mtab -- --apk
bun run mtab -- --aab
```

### 按 ABI 拆分 APK

```bash
bun run mtab -- --apk --split-per-abi
```

该命令生成以下架构的独立 APK：

| 构建 target | Android ABI   | 适用设备                          |
| ----------- | ------------- | --------------------------------- |
| `aarch64`   | `arm64-v8a`   | 主流 64 位 Android 手机，优先推荐 |
| `armv7`     | `armeabi-v7a` | 较旧的 32 位 ARM 设备             |
| `i686`      | `x86`         | 旧式 x86 模拟器                   |
| `x86_64`    | `x86_64`      | 64 位 x86 模拟器                  |

### 只构建指定架构

```bash
bun run mtab -- --apk --target aarch64
bun run mtab -- --apk --target armv7
bun run mtab -- --apk --target i686
bun run mtab -- --apk --target x86_64
```

例如，绝大多数现代实体手机应使用 `aarch64`。构建脚本会识别 Tauri 将单架构
APK 放入 `universal` flavor 目录的情况，并按包内实际目标整理为对应 ABI 文件名。

### Debug 构建

```bash
bun run mtab -- --apk --debug
```

Debug 包用于本地调试，不应作为正式发布产物。

## 产物目录和命名

整理后的 Android 产物统一位于：

```text
mobile/src-tauri/target/release/bundle/android/
```

文件名包含产品名、应用版本、平台、ABI 和构建类型，例如：

```text
AIO-Hub_0.1.2-beta.1_android-arm64-v8a-release.apk
AIO-Hub_0.1.2-beta.1_android-universal-release.apk
```

Gradle 原始产物仍保留在：

```text
mobile/src-tauri/gen/android/app/build/outputs/
```

## Android 签名

Android 设备不能正常安装未签名 APK。构建脚本会排除名称以
`-unsigned.apk` 结尾的产物，GitHub Actions 还会在上传前执行真实验签。

### 本地测试签名

本地没有配置发布 keystore 时，release APK 会回退到 Android debug key 签名。
这种 APK 可以安装测试，但不适合正式发布。不同机器或重新生成 debug key 后，
签名可能变化，Android 将拒绝直接覆盖安装旧版本。

### 本地正式签名

先生成并妥善备份发布 keystore：

```bash
keytool -genkeypair -v -keystore mobile/src-tauri/gen/android/release.keystore -alias aiohub-release -keyalg RSA -keysize 2048 -validity 10000
```

随后创建 `mobile/src-tauri/gen/android/key.properties`：

```properties
storeFile=release.keystore
storePassword=<keystore 密码>
keyAlias=aiohub-release
keyPassword=<密钥密码>
```

`release.keystore` 和 `key.properties` 已被 Git 忽略，不要将发布私钥、密码或
Base64 内容提交到仓库。后续版本必须继续使用同一发布密钥，否则已安装用户无法
覆盖升级。

### 验证 APK

Android SDK Build Tools 提供的 `apksigner` 可以检查 APK 是否完整且已签名：

```bash
apksigner verify --verbose --print-certs <apk 路径>
```

输出必须包含 `Verifies`，并至少有一种 APK Signature Scheme 显示为 `true`。
Android 7.0 及以上设备可使用 v2 签名。

## GitHub Actions 发布签名

`.github/workflows/build-mobile.yml` 的正式 tag 构建要求配置以下 GitHub Actions
Secrets：

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

- `ANDROID_KEYSTORE_BASE64`：发布 keystore 文件编码后的单行 Base64；
- `ANDROID_KEYSTORE_PASSWORD`：keystore 密码；
- `ANDROID_KEY_ALIAS`：发布密钥别名；
- `ANDROID_KEY_PASSWORD`：发布密钥密码。

在 Windows PowerShell 中可用以下命令取得 keystore 的单行 Base64 内容，然后将
输出完整填写到 `ANDROID_KEYSTORE_BASE64`：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("mobile/src-tauri/gen/android/release.keystore"))
```

Secrets 的配置位置是仓库的 `Settings > Secrets and variables > Actions`。不要把
这些值写进 workflow、普通环境变量文件或提交记录。

正式 tag 构建缺少这些 Secrets 时会直接失败，防止上传不可安装或无法持续升级的
APK。手动触发的草稿构建可以临时生成测试密钥，但这种产物只能用于一次性测试，
不能作为跨版本覆盖升级的发布包。

CI 在上传产物前会执行 `apksigner verify`。只有构建成功并通过验签的 APK 才会
进入 Artifacts 和 Release。

## 发布前版本检查

移动应用版本以 `mobile/package.json` 为唯一来源。使用根目录版本命令修改并校验：

```bash
bun run version:set -- mobile 0.1.2-beta.1
bun run version:check
```

`mobile/src-tauri/tauri.conf.json` 通过路径读取该版本；Cargo package 使用固定
内部版本，不随应用发版修改。版本命令会在版本变化时递增 Android
`versionCode`，也可通过 `--android-version-code <number>` 显式指定。

Android 发布 tag 使用 `mv<version>`，例如 `mv0.1.2-beta.1`。CI 会在构建前
校验 tag 与 `mobile/package.json` 完全一致。iOS 测试构建使用 `miv<version>`。

## iOS 构建

iOS 构建需要 macOS、Xcode 和有效的 Apple 开发环境：

```bash
bun run mtid
bun run mtib
```

`mtid` 用于 iOS 开发模式，`mtib` 用于 iOS 构建。iOS 签名、证书和发布配置以
Apple Developer 账户及当前 Tauri iOS 工程为准。

## 常见安装问题

### 提示“安装包解析出错”

依次检查：

1. APK 是否通过 `apksigner verify`；
2. 下载或传输后的文件大小、SHA256 是否与源文件一致；
3. 是否误用了 `.aab`、未签名 APK 或不完整的 split APK；
4. APK 的 ABI 和 `minSdk` 是否支持目标设备。

### 提示签名冲突或无法覆盖安装

新旧 APK 使用了不同签名。测试阶段可卸载旧版本后重新安装；正式发布必须恢复并
使用原来的发布 keystore。更换包名只会安装为另一应用，不能实现原应用升级。

### 应该下载哪个 APK

- 实体手机通常优先选择 `arm64-v8a`；
- 不确定设备架构时选择 `universal`；
- `armeabi-v7a` 仅用于旧款 32 位 ARM 设备；
- `x86` 和 `x86_64` 主要用于模拟器。
