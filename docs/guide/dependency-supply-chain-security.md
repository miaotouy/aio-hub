# 依赖供应链安全检查

AIO Hub 在 Bun 安装流程前后执行本地依赖扫描，目标是尽早发现常见的依赖投毒特征。该检查是启发式防线，不替代代码审查、漏洞响应或依赖来源验证。

## 默认防线

### 1. 安装前门禁

根 `package.json` 的 `preinstall` 会运行：

```bash
bun scripts/security/scan-dependencies.ts --mode lock
```

该模式不依赖 `node_modules`，检查：

- 根包和 `bun.lock` 中登记的 workspace 清单；
- Git、HTTP tarball、`file:`、`link:` 等非 registry 依赖来源；
- npm alias 指向不同包名的情况；
- 自定义锁文件来源；
- registry 包是否有有效的 SHA-512 完整性摘要；
- 本地禁用包清单。

高危或严重命中会阻断安装。

### 2. 生命周期脚本最小信任

根 `package.json` 使用 `trustedDependencies` 明确列出允许执行安装生命周期脚本的包。目前仅允许项目构建实际需要的：

- `@parcel/watcher`
- `esbuild`
- `vue-demi`

不要因为某个包提示脚本被阻止就直接加入清单。先确认包名和版本、检查其 `preinstall` / `install` / `postinstall` 内容，并说明为什么项目需要执行它。

查看被 Bun 阻止的脚本：

```bash
bun pm untrusted
```

### 3. 安装后实际内容扫描

根 `postinstall` 在运行项目自身的 Wry 补丁脚本前执行：

```bash
bun run security:dependencies
```

它会遍历 `node_modules/.bun` 中实际安装的包，重点检查安装生命周期命令及其引用文件，包括：

- 下载内容后直接管道交给 shell；
- PowerShell 编码命令、长编码载荷与动态执行组合；
- 读取 npm、GitHub、SSH、云凭据或完整环境变量并同时进行外部通信；
- 禁用 TLS 校验；
- 修改 shell 启动文件、计划任务、系统自启动位置；
- 写入 GitHub Actions workflow、调用 registry 发布/权限命令或凭据提取工具；
- 挖矿程序和矿池协议特征；
- `bin` 或生命周期脚本路径逃逸包目录；
- 普通联网下载器和进程执行组合。

默认 `--fail-on high`：高危与严重问题阻断，常见二进制下载器等中风险行为只报告。人工审计时可使用严格模式：

```bash
bun run security:dependencies:strict
```

### 4. 新版本冷却期

根 `bunfig.toml` 将尚未锁定的新发布版本延迟 3 天进入解析范围。已有 `bun.lock` 版本不受影响。这样可以降低刚发布的恶意版本在告警、撤包和社区响应前被立即解析到的概率。

确有紧急升级需求时，可以把经过人工核验的包临时加入 `minimumReleaseAgeExcludes`，不要全局关闭冷却期。升级完成后应移除临时排除。

### 5. CI 锁文件冻结

工作流统一使用：

```bash
bun install --frozen-lockfile
```

CI 不允许安装时静默改写解析结果。`check` 与 `check:ci` 也会再次运行安装后扫描。

## 策略文件

策略位于 `scripts/security/dependency-policy.json`：

```json
{
  "allowedNonRegistryDependencies": [],
  "allowedLockfileSources": [],
  "deniedPackages": [],
  "ignoredFindings": []
}
```

### 允许非 registry 依赖

值必须精确到“包名 + 完整 spec”，例如：

```json
{
  "allowedNonRegistryDependencies": [
    "example-package@https://example.com/example-package-1.0.0.tgz"
  ]
}
```

只有在来源不可迁移到 registry、内容已经固定并经过审核时才允许。URL 应指向不可变内容，避免分支名或可覆盖资源。

### 禁用包

既可按包名禁用全部版本，也可精确到版本：

```json
{
  "deniedPackages": ["known-bad-package", "compromised-package@1.2.3"]
}
```

确认投毒事件后，应优先删除依赖并重新生成锁文件；禁用清单用于阻止误加回仓库，不是修复手段。

### 忽略规则命中

忽略项必须指定规则并填写非空理由，建议同时限制包名和版本：

```json
{
  "ignoredFindings": [
    {
      "ruleId": "install-network-access",
      "package": "reviewed-downloader",
      "version": "1.2.3",
      "reason": "固定地址下载已核验的官方平台二进制，升级版本时重新审核"
    }
  ]
}
```

不要使用只写 `ruleId` 的宽泛忽略。包升级后应重新审核，避免旧结论自动覆盖新代码。

## 漏洞审计

本地行为扫描关注投毒与安装阶段行为；已公开漏洞使用 Bun 审计补充检查：

```bash
bun run security:audit
```

仓库当前可能存在来自开发工具或传递依赖的历史漏洞基线，因此该命令暂不作为安装门禁。处理审计结果时应区分：

1. 运行时可达的直接依赖；
2. 仅测试、文档或打包环境可达的开发依赖；
3. 有修复版本且可安全升级的传递依赖；
4. 暂无上游修复、需要隔离或替换的依赖。

## 发现异常后的处理

1. 立即停止运行新的安装脚本、开发服务器和构建命令。
2. 保存扫描输出、可疑包名、版本、完整性摘要和锁文件 diff。
3. 从干净环境撤销依赖变更，不要复用可能被污染的 `node_modules`。
4. 如果脚本可能读取过环境变量或凭据，轮换 npm、GitHub、云平台、SSH 等相关密钥。
5. 重新执行冻结安装、供应链扫描、相关测试和 Vite 构建。
6. 将确认的恶意包加入 `deniedPackages`，并记录事件来源与处置结果。

## 已知边界

- 静态规则无法证明一个包安全，也可能对合法下载器产生中风险告警。
- 只检查安装生命周期入口及其直接引用脚本，不是对所有依赖源码的完整恶意代码分析。
- 已经执行过的恶意脚本不能靠事后扫描撤销，因此生命周期最小信任、冻结锁文件和冷却期同样重要。
- 私有 registry、Git 依赖和本地 tarball 默认需要显式审核与策略放行。
