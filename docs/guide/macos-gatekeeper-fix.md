# macOS "应用已损坏" 故障排除指南

由于 macOS 的安全机制（Gatekeeper），未签名的应用在首次打开时可能会提示 **“应用已损坏，无法打开。你应该将它移到废纸篓。”**

这不是应用本身的问题，而是 macOS 对从互联网下载的未签名应用的默认拦截行为。

## 解决方案

你需要移除应用的“隔离属性”（Quarantine Attribute）。请按照以下步骤操作：

### 方法一：使用右键打开（推荐）

1. 在 `应用程序` 文件夹中找到 **AIO Hub**。
2. 按住键盘上的 `Control` 键，同时**右键点击**应用图标。
3. 在弹出的菜单中选择 **打开**。
4. 在随后出现的弹窗中点击 **打开** 按钮。
   > 这种方法只需要操作一次，之后就可以正常点击打开了。

### 方法二：使用终端命令（如果方法一无效）

如果上述方法无效，你需要使用终端命令手动修复。

1. 打开 **终端 (Terminal)** 应用。
2. 复制以下命令，但**不要立即按回车**：
   ```bash
   sudo xattr -cr 
   ```
   *(注意：cr 后面有一个空格)*
3. 打开 `应用程序` 文件夹，找到 **AIO Hub** 图标。
4. 将图标**拖入**终端窗口中。
   > 此时终端会自动生成正确的路径，例如：`/Applications/AIO\ Hub.app` 或 `"/Applications/AIO Hub.app"`。
5. 现在的完整命令应该看起来像这样：
   ```bash
   sudo xattr -cr /Applications/AIO\ Hub.app
   ```
6. 按 **回车键** 执行。
7. 如果提示输入密码（Password），请输入你的开机密码并回车（输入过程中屏幕上不会显示字符，这是正常的）。

---

## 常见错误

### ❌ 错误示范
直接复制路径但没有处理空格：
```bash
xattr -cr /Applications/AIO Hub.app
```
**报错信息**：
```
xattr: No such file: /Applications/AIO
xattr: No such file: Hub.app
```
**原因**：终端把空格当成了分隔符，认为你在操作两个不同的文件。

### ✅ 正确示范
使用引号包裹路径，或使用反斜杠转义空格：
```bash
xattr -cr "/Applications/AIO Hub.app"
```
或者
```bash
xattr -cr /Applications/AIO\ Hub.app