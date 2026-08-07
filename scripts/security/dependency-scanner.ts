// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type ScanMode = "lock" | "installed";
export type FindingSeverity = "low" | "medium" | "high" | "critical";

export interface DependencyFinding {
  severity: FindingSeverity;
  ruleId: string;
  message: string;
  location: string;
  packageName?: string;
  packageVersion?: string;
  evidence?: string;
}

interface DependencyPolicy {
  allowedNonRegistryDependencies: string[];
  allowedLockfileSources: string[];
  deniedPackages: string[];
  ignoredFindings: Array<{
    ruleId: string;
    package?: string;
    version?: string;
    location?: string;
    reason: string;
  }>;
}

interface PackageManifest {
  name?: string;
  version?: string;
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, unknown>;
  bin?: string | Record<string, string>;
}

interface BunLockfile {
  workspaces?: Record<
    string,
    Pick<
      PackageManifest,
      | "name"
      | "dependencies"
      | "devDependencies"
      | "optionalDependencies"
      | "peerDependencies"
    >
  >;
  packages?: Record<string, unknown>;
}

interface InstalledPackage {
  root: string;
  manifest: PackageManifest;
}

export interface DependencyScanOptions {
  rootDir?: string;
  mode?: ScanMode;
  policyPath?: string;
}

export interface DependencyScanReport {
  rootDir: string;
  mode: ScanMode;
  findings: DependencyFinding[];
  suppressedFindings: number;
  stats: {
    manifests: number;
    lockfilePackages: number;
    installedPackages: number;
    lifecyclePackages: number;
    scannedLifecycleFiles: number;
  };
}

const DEFAULT_POLICY: DependencyPolicy = {
  allowedNonRegistryDependencies: [],
  allowedLockfileSources: [],
  deniedPackages: [],
  ignoredFindings: [],
};

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;
const INSTALL_LIFECYCLE_SCRIPTS = [
  "preinstall",
  "install",
  "postinstall",
] as const;
const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};
const REGISTRY_INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]+=*$/;
const MAX_SCANNED_SCRIPT_BYTES = 512 * 1024;

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function relativeLocation(rootDir: string, path: string): string {
  const result = normalizePath(relative(rootDir, path));
  return result || ".";
}

function truncateEvidence(value: string, maxLength = 240): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength
    ? `${compact.slice(0, maxLength - 1)}…`
    : compact;
}

function stripJsonTrailingCommas(input: string): string {
  let output = "";
  let inString = false;
  let escaping = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inString) {
      output += character;
      if (escaping) {
        escaping = false;
      } else if (character === "\\") {
        escaping = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }

    if (character === ",") {
      let nextIndex = index + 1;
      while (/\s/.test(input[nextIndex] ?? "")) {
        nextIndex += 1;
      }
      if (input[nextIndex] === "}" || input[nextIndex] === "]") {
        continue;
      }
    }

    output += character;
  }

  return output;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readBunLockfile(path: string): Promise<BunLockfile> {
  const content = await readFile(path, "utf8");
  return JSON.parse(stripJsonTrailingCommas(content)) as BunLockfile;
}

function isPathInside(parent: string, candidate: string): boolean {
  const relativePath = relative(resolve(parent), resolve(candidate));
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== ".." &&
      !isAbsolute(relativePath))
  );
}

function dependencyId(name: string, spec: string): string {
  return `${name}@${spec}`;
}

function isNonRegistryDependency(spec: string): boolean {
  const normalized = spec.trim().toLowerCase();
  return (
    normalized.startsWith("http:") ||
    normalized.startsWith("https:") ||
    normalized.startsWith("git:") ||
    normalized.startsWith("git+") ||
    normalized.startsWith("github:") ||
    normalized.startsWith("gitlab:") ||
    normalized.startsWith("bitbucket:") ||
    normalized.startsWith("file:") ||
    normalized.startsWith("link:") ||
    normalized.startsWith("portal:") ||
    normalized.startsWith("patch:") ||
    normalized.startsWith("/") ||
    /^[a-z]:[\\/]/i.test(normalized)
  );
}

function matchesPackageRule(
  rule: string,
  packageName: string,
  packageVersion?: string
): boolean {
  return (
    rule === packageName ||
    (packageVersion !== undefined &&
      rule === `${packageName}@${packageVersion}`)
  );
}

function addDeniedPackageFinding(
  findings: DependencyFinding[],
  policy: DependencyPolicy,
  packageName: string,
  packageVersion: string | undefined,
  location: string
): void {
  if (
    !policy.deniedPackages.some((rule) =>
      matchesPackageRule(rule, packageName, packageVersion)
    )
  ) {
    return;
  }

  findings.push({
    severity: "critical",
    ruleId: "denied-package",
    message: `依赖命中本地禁用清单: ${packageName}${packageVersion ? `@${packageVersion}` : ""}`,
    location,
    packageName,
    packageVersion,
  });
}

function scanDependencySections(
  manifest: PackageManifest,
  location: string,
  policy: DependencyPolicy,
  findings: DependencyFinding[]
): void {
  for (const section of DEPENDENCY_SECTIONS) {
    for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
      addDeniedPackageFinding(findings, policy, name, undefined, location);

      if (spec.startsWith("workspace:")) {
        continue;
      }
      if (spec.startsWith("npm:")) {
        const target = spec.slice(4).match(/^((?:@[^/]+\/)?[^@]+)/)?.[1];
        if (target && target !== name) {
          findings.push({
            severity: "medium",
            ruleId: "registry-alias",
            message: `依赖 ${name} 通过 npm alias 指向 ${target}，需要人工确认包身份`,
            location,
            packageName: name,
            evidence: spec,
          });
        }
        continue;
      }
      if (!isNonRegistryDependency(spec)) {
        continue;
      }

      const id = dependencyId(name, spec);
      if (policy.allowedNonRegistryDependencies.includes(id)) {
        continue;
      }
      findings.push({
        severity: "high",
        ruleId: "non-registry-dependency",
        message: `依赖 ${name} 使用非 registry 来源，未经过本地显式允许`,
        location,
        packageName: name,
        evidence: spec,
      });
    }
  }
}

function scanLockfilePackages(
  lockfile: BunLockfile,
  lockfileLocation: string,
  policy: DependencyPolicy,
  findings: DependencyFinding[]
): number {
  const packages = Object.entries(lockfile.packages ?? {});
  for (const [lockKey, rawRecord] of packages) {
    if (!Array.isArray(rawRecord) || typeof rawRecord[0] !== "string") {
      findings.push({
        severity: "high",
        ruleId: "invalid-lockfile-record",
        message: `bun.lock 中的包记录格式异常: ${lockKey}`,
        location: lockfileLocation,
      });
      continue;
    }

    const resolvedPackage = rawRecord[0];
    const source = typeof rawRecord[1] === "string" ? rawRecord[1] : "";
    const integrity = typeof rawRecord[3] === "string" ? rawRecord[3] : "";
    const workspaceMatch = resolvedPackage.match(
      /^((?:@[^/]+\/)?[^@]+)@workspace:/
    );
    if (workspaceMatch) {
      continue;
    }

    const packageMatch = resolvedPackage.match(/^((?:@[^/]+\/)?[^@]+)@(.+)$/);
    const packageName = packageMatch?.[1];
    const packageVersion = packageMatch?.[2];
    if (packageName) {
      addDeniedPackageFinding(
        findings,
        policy,
        packageName,
        packageVersion,
        lockfileLocation
      );
    }

    if (source && !policy.allowedLockfileSources.includes(source)) {
      findings.push({
        severity: "high",
        ruleId: "custom-lockfile-source",
        message: `bun.lock 包记录使用了未允许的自定义来源: ${lockKey}`,
        location: lockfileLocation,
        packageName,
        packageVersion,
        evidence: source,
      });
    }

    if (
      isNonRegistryDependency(resolvedPackage) ||
      (packageVersion !== undefined && isNonRegistryDependency(packageVersion))
    ) {
      findings.push({
        severity: "high",
        ruleId: "non-registry-lockfile-source",
        message: `bun.lock 包记录解析到非 registry 来源: ${lockKey}`,
        location: lockfileLocation,
        packageName,
        packageVersion,
        evidence: resolvedPackage,
      });
      continue;
    }

    if (!REGISTRY_INTEGRITY_PATTERN.test(integrity)) {
      findings.push({
        severity: "high",
        ruleId: "missing-lockfile-integrity",
        message: `registry 依赖缺少有效的 sha512 完整性摘要: ${lockKey}`,
        location: lockfileLocation,
        packageName,
        packageVersion,
        evidence: integrity || "<missing>",
      });
    }
  }

  return packages.length;
}

async function collectManifestPaths(
  rootDir: string,
  lockfile: BunLockfile
): Promise<string[]> {
  const paths = new Set<string>([join(rootDir, "package.json")]);
  for (const workspacePath of Object.keys(lockfile.workspaces ?? {})) {
    if (!workspacePath) {
      continue;
    }
    paths.add(join(rootDir, workspacePath, "package.json"));
  }
  return [...paths];
}

async function findInstalledPackages(
  rootDir: string
): Promise<InstalledPackage[]> {
  const bunStore = join(rootDir, "node_modules", ".bun");
  let storeEntries;
  try {
    storeEntries = await readdir(bunStore, { withFileTypes: true });
  } catch {
    throw new Error(
      "缺少 node_modules/.bun；请先运行 bun install，或使用 --mode lock"
    );
  }

  const packages: InstalledPackage[] = [];
  const seenRoots = new Set<string>();
  for (const storeEntry of storeEntries) {
    if (!storeEntry.isDirectory()) {
      continue;
    }
    const packageContainer = join(bunStore, storeEntry.name, "node_modules");
    let entries;
    try {
      entries = await readdir(packageContainer, { withFileTypes: true });
    } catch {
      continue;
    }

    const candidates: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        continue;
      }
      const entryPath = join(packageContainer, entry.name);
      if (!entry.name.startsWith("@")) {
        candidates.push(entryPath);
        continue;
      }

      let scopedEntries;
      try {
        scopedEntries = await readdir(entryPath, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const scopedEntry of scopedEntries) {
        if (scopedEntry.isDirectory() && !scopedEntry.isSymbolicLink()) {
          candidates.push(join(entryPath, scopedEntry.name));
        }
      }
    }

    for (const candidate of candidates) {
      try {
        const packageRoot = await realpath(candidate);
        if (seenRoots.has(packageRoot)) {
          continue;
        }
        const manifest = await readJson<PackageManifest>(
          join(packageRoot, "package.json")
        );
        if (!manifest.name || !manifest.version) {
          continue;
        }
        seenRoots.add(packageRoot);
        packages.push({ root: packageRoot, manifest });
      } catch {
        // node_modules/.bun 下也会有非包目录或平台不适用的残留项。
      }
    }
  }

  return packages;
}

function referencedLifecycleFiles(command: string): string[] {
  const files = new Set<string>();
  const filePattern =
    /(?:^|[\s"'])(\.?\.?[\\/]?[\w@+./\\-]+\.(?:[cm]?js|ts))(?=$|[\s"';&|)])/gi;
  for (const match of command.matchAll(filePattern)) {
    const candidate = match[1]?.replace(/^["']|["']$/g, "");
    if (candidate) {
      files.add(candidate);
    }
  }
  return [...files];
}

function inspectSuspiciousContent(
  content: string,
  context: {
    packageName: string;
    packageVersion: string;
    location: string;
  }
): DependencyFinding[] {
  const findings: DependencyFinding[] = [];
  const lowerContent = content.toLowerCase();
  const hasNetwork =
    /https?:\/\/|\bfetch\s*\(|\bhttps?\s*\.\s*(?:get|request)\s*\(|\baxios\s*\.|\b(?:curl|wget)\b|invoke-webrequest|downloadstring|\bwebsocket\b/i.test(
      content
    );
  const hasSensitiveCredential =
    /\.npmrc|npm[_-]?token|node_auth_token|github[_-]?token|gh[_-]?token|\.ssh[\\/]|id_rsa|id_ed25519|\.aws[\\/]credentials|google_application_credentials|azure_(?:client|tenant|subscription)|private[_-]?key|wallet\.dat|login data|local state|keychain/i.test(
      content
    );
  const enumeratesEnvironment =
    /object\.(?:entries|keys|values)\s*\(\s*process\.env\s*\)|json\.stringify\s*\(\s*process\.env\s*\)|for\s*\([^)]*process\.env/i.test(
      content
    );
  const hasExecution =
    /node:child_process|require\s*\(\s*["']child_process["']\s*\)|\b(?:exec|execsync|spawn|spawnsync)\s*\(|\beval\s*\(|new\s+function\s*\(|\bpowershell(?:\.exe)?\b|\bpwsh\b|\bcmd\.exe\b|\b(?:bash|zsh|sh)\s+-c\b/i.test(
      content
    );
  const hasLongEncodedPayload =
    /["'][A-Za-z0-9+/]{400,}={0,2}["']/.test(content) ||
    /buffer\.from\s*\([^)]{0,500}["']base64["']/i.test(content);

  const add = (
    severity: FindingSeverity,
    ruleId: string,
    message: string,
    evidencePattern?: RegExp
  ) => {
    const evidence = evidencePattern?.exec(content)?.[0];
    findings.push({
      severity,
      ruleId,
      message,
      location: context.location,
      packageName: context.packageName,
      packageVersion: context.packageVersion,
      evidence: evidence ? truncateEvidence(evidence) : undefined,
    });
  };

  if (
    /(?:curl|wget)[^\r\n|]{0,500}\|\s*(?:sh|bash|zsh|powershell|pwsh)\b/i.test(
      content
    ) ||
    /invoke-webrequest[^\r\n|]{0,500}\|[^\r\n]{0,100}invoke-expression/i.test(
      content
    )
  ) {
    add(
      "critical",
      "download-piped-to-shell",
      "安装阶段存在网络下载后直接交给 shell 执行的行为",
      /(?:curl|wget|invoke-webrequest)[^\r\n]{0,600}/i
    );
  }

  if (
    /(?:powershell|pwsh)(?:\.exe)?[^\r\n]{0,120}\s-(?:enc|encodedcommand)\b/i.test(
      content
    ) ||
    (hasExecution && hasLongEncodedPayload)
  ) {
    add(
      "critical",
      "encoded-execution",
      "安装阶段存在编码载荷与动态执行组合",
      /(?:-(?:enc|encodedcommand)\b[^\r\n]{0,200}|buffer\.from\s*\([^\r\n]{0,300})/i
    );
  }

  if (hasNetwork && (hasSensitiveCredential || enumeratesEnvironment)) {
    add(
      "critical",
      "credential-exfiltration-pattern",
      "安装阶段同时出现敏感凭据/环境枚举与外部通信特征",
      /(?:\.npmrc|npm[_-]?token|github[_-]?token|\.ssh[\\/]|\.aws[\\/]credentials|process\.env|https?:\/\/)[^\r\n]{0,200}/i
    );
  } else if (hasSensitiveCredential || enumeratesEnvironment) {
    add(
      "high",
      "credential-access-pattern",
      "安装阶段出现读取敏感凭据或枚举完整环境变量的特征",
      /(?:\.npmrc|npm[_-]?token|github[_-]?token|\.ssh[\\/]|\.aws[\\/]credentials|object\.(?:entries|keys|values)\s*\(\s*process\.env)/i
    );
  }

  if (
    /node_tls_reject_unauthorized\s*=\s*["']?0|rejectunauthorized\s*:\s*false/i.test(
      content
    )
  ) {
    add(
      hasNetwork ? "high" : "medium",
      "tls-verification-disabled",
      "安装阶段禁用了 TLS 证书校验",
      /node_tls_reject_unauthorized\s*=\s*["']?0|rejectunauthorized\s*:\s*false/i
    );
  }

  if (
    /\.bashrc|\.zshrc|\.profile|authorized_keys|\bcrontab\b|\bschtasks\b|currentversion[\\/]run|launchagents|systemd[\\/]system/i.test(
      content
    )
  ) {
    add(
      "critical",
      "persistence-pattern",
      "安装阶段出现修改登录脚本、计划任务或自启动位置的特征",
      /\.bashrc|\.zshrc|authorized_keys|\bcrontab\b|\bschtasks\b|currentversion[\\/]run|launchagents|systemd[\\/]system/i
    );
  }

  if (
    /\bxmrig\b|stratum\+tcp|(?:monero|cryptonight).{0,80}(?:pool|min(?:e|ing))/i.test(
      content
    )
  ) {
    add(
      "critical",
      "cryptominer-pattern",
      "安装阶段出现加密货币挖矿程序或矿池协议特征",
      /\bxmrig\b|stratum\+tcp|(?:monero|cryptonight).{0,80}(?:pool|min(?:e|ing))/i
    );
  }

  if (/\b(?:trufflehog|gitleaks)\b/i.test(content)) {
    add(
      "critical",
      "credential-harvester-tool",
      "安装阶段调用了凭据扫描/提取工具",
      /\b(?:trufflehog|gitleaks)\b/i
    );
  }

  if (
    /\b(?:npm|pnpm|yarn|bun)\s+(?:publish|unpublish|deprecate)\b|\bnpm\s+(?:token|owner|access)\b/i.test(
      content
    )
  ) {
    add(
      "critical",
      "package-registry-mutation",
      "安装阶段尝试发布、撤回包或修改 registry 权限",
      /\b(?:npm|pnpm|yarn|bun)\s+(?:publish|unpublish|deprecate)\b|\bnpm\s+(?:token|owner|access)\b/i
    );
  }

  if (
    /\.github[\\/]workflows|github[\\/]workflows/i.test(content) &&
    /(?:writefile|appendfile|copyfile|rename|createwritestream|\bcp\b|copy-item)/i.test(
      content
    )
  ) {
    add(
      "critical",
      "ci-workflow-tampering",
      "安装阶段尝试写入 GitHub Actions workflow",
      /\.github[\\/]workflows[^\r\n]{0,200}/i
    );
  }

  if (
    /(?:discord(?:app)?\.com\/api\/webhooks|webhook\.site|requestbin|pipedream\.net|interactsh|oastify|ngrok(?:-free)?\.(?:app|io))/i.test(
      content
    )
  ) {
    add(
      "high",
      "suspicious-exfiltration-endpoint",
      "安装阶段连接到常被临时外传或回连使用的端点",
      /https?:\/\/[^\s"']+/i
    );
  }

  if (hasNetwork && hasExecution) {
    add(
      "medium",
      "network-and-process-execution",
      "安装阶段同时包含外部通信和进程执行；常见于二进制下载器，但应人工复核",
      /https?:\/\/[^\s"']+|\b(?:exec|execsync|spawn|spawnsync)\s*\(/i
    );
  } else if (hasNetwork) {
    add(
      "medium",
      "install-network-access",
      "安装阶段包含外部网络访问",
      /https?:\/\/[^\s"']+|\b(?:fetch|curl|wget|invoke-webrequest)\b/i
    );
  }

  if (hasLongEncodedPayload && !hasExecution) {
    add(
      "medium",
      "encoded-payload",
      "安装阶段包含较长的编码载荷，需要确认其用途",
      /["'][A-Za-z0-9+/]{120,}={0,2}["']/
    );
  }

  if (
    lowerContent.includes("process.env") &&
    /(?:npm_config|https?_proxy|no_proxy)/i.test(content) &&
    !hasSensitiveCredential &&
    !enumeratesEnvironment
  ) {
    return findings.filter(
      (finding) => finding.ruleId !== "credential-access-pattern"
    );
  }

  return findings;
}

function scanBinPaths(
  installedPackage: InstalledPackage,
  rootDir: string,
  findings: DependencyFinding[]
): void {
  const { manifest, root } = installedPackage;
  const entries =
    typeof manifest.bin === "string"
      ? [[manifest.name ?? "<unnamed>", manifest.bin] as const]
      : Object.entries(manifest.bin ?? {});

  for (const [binName, binPath] of entries) {
    if (typeof binPath !== "string") {
      continue;
    }
    const resolvedBin = resolve(root, binPath);
    if (!isPathInside(root, resolvedBin)) {
      findings.push({
        severity: "high",
        ruleId: "escaping-bin-path",
        message: `包 ${manifest.name} 的 bin ${binName} 指向包目录之外`,
        location: relativeLocation(rootDir, join(root, "package.json")),
        packageName: manifest.name,
        packageVersion: manifest.version,
        evidence: binPath,
      });
    }
  }
}

async function scanInstalledPackage(
  installedPackage: InstalledPackage,
  rootDir: string,
  policy: DependencyPolicy
): Promise<{
  findings: DependencyFinding[];
  hasLifecycleScripts: boolean;
  scannedFiles: number;
}> {
  const findings: DependencyFinding[] = [];
  const { root, manifest } = installedPackage;
  const packageName = manifest.name ?? "<unnamed>";
  const packageVersion = manifest.version ?? "<unknown>";
  const manifestLocation = relativeLocation(
    rootDir,
    join(root, "package.json")
  );
  addDeniedPackageFinding(
    findings,
    policy,
    packageName,
    packageVersion,
    manifestLocation
  );
  scanBinPaths(installedPackage, rootDir, findings);

  const lifecycleEntries = INSTALL_LIFECYCLE_SCRIPTS.flatMap((scriptName) => {
    const command = manifest.scripts?.[scriptName];
    return typeof command === "string" ? [[scriptName, command] as const] : [];
  });
  if (lifecycleEntries.length === 0) {
    return { findings, hasLifecycleScripts: false, scannedFiles: 0 };
  }

  const filesToScan = new Set<string>();
  for (const [scriptName, command] of lifecycleEntries) {
    findings.push(
      ...inspectSuspiciousContent(command, {
        packageName,
        packageVersion,
        location: `${manifestLocation}#scripts.${scriptName}`,
      })
    );
    for (const file of referencedLifecycleFiles(command)) {
      filesToScan.add(file);
    }
  }

  for (const scriptName of INSTALL_LIFECYCLE_SCRIPTS) {
    for (const candidate of [
      `${scriptName}.js`,
      `${scriptName}.cjs`,
      `${scriptName}.mjs`,
      `scripts/${scriptName}.js`,
      `scripts/${scriptName}.cjs`,
      `scripts/${scriptName}.mjs`,
    ]) {
      filesToScan.add(candidate);
    }
  }

  let scannedFiles = 0;
  for (const relativeFile of filesToScan) {
    const absoluteFile = resolve(root, relativeFile);
    if (!isPathInside(root, absoluteFile)) {
      findings.push({
        severity: "high",
        ruleId: "escaping-lifecycle-script-path",
        message: `安装脚本引用了包目录之外的文件`,
        location: manifestLocation,
        packageName,
        packageVersion,
        evidence: relativeFile,
      });
      continue;
    }

    try {
      const stat = await lstat(absoluteFile);
      if (!stat.isFile() || stat.size > MAX_SCANNED_SCRIPT_BYTES) {
        if (stat.isFile() && stat.size > MAX_SCANNED_SCRIPT_BYTES) {
          findings.push({
            severity: "medium",
            ruleId: "oversized-lifecycle-script",
            message: `安装脚本超过静态扫描大小限制 (${MAX_SCANNED_SCRIPT_BYTES} bytes)`,
            location: relativeLocation(rootDir, absoluteFile),
            packageName,
            packageVersion,
          });
        }
        continue;
      }
      const content = await readFile(absoluteFile, "utf8");
      scannedFiles += 1;
      findings.push(
        ...inspectSuspiciousContent(content, {
          packageName,
          packageVersion,
          location: relativeLocation(rootDir, absoluteFile),
        })
      );
    } catch {
      // 脚本命令可能引用可选文件或 node_modules/.bin 命令，不视为异常。
    }
  }

  return { findings, hasLifecycleScripts: true, scannedFiles };
}

async function readPolicy(policyPath: string): Promise<DependencyPolicy> {
  try {
    const policy = await readJson<Partial<DependencyPolicy>>(policyPath);
    const normalized: DependencyPolicy = {
      allowedNonRegistryDependencies:
        policy.allowedNonRegistryDependencies ?? [],
      allowedLockfileSources: policy.allowedLockfileSources ?? [],
      deniedPackages: policy.deniedPackages ?? [],
      ignoredFindings: policy.ignoredFindings ?? [],
    };
    for (const [key, value] of Object.entries(normalized)) {
      if (!Array.isArray(value)) {
        throw new Error("策略字段 " + key + " 必须是数组");
      }
    }
    for (const ignore of normalized.ignoredFindings) {
      if (
        !ignore ||
        typeof ignore.ruleId !== "string" ||
        typeof ignore.reason !== "string" ||
        !ignore.reason.trim() ||
        (!ignore.package && !ignore.location)
      ) {
        throw new Error(
          "ignoredFindings 必须包含 ruleId、非空 reason，并至少限制 package 或 location"
        );
      }
    }
    return normalized;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return DEFAULT_POLICY;
    }
    throw new Error(
      "无法读取依赖扫描策略 " +
        policyPath +
        ": " +
        (error instanceof Error ? error.message : String(error))
    );
  }
}

function applyFindingIgnores(
  findings: DependencyFinding[],
  policy: DependencyPolicy
): { findings: DependencyFinding[]; suppressed: number } {
  const visibleFindings: DependencyFinding[] = [];
  let suppressed = 0;

  for (const finding of findings) {
    const ignored = policy.ignoredFindings.some((ignore) => {
      if (!ignore.reason.trim() || ignore.ruleId !== finding.ruleId) {
        return false;
      }
      if (ignore.package && ignore.package !== finding.packageName) {
        return false;
      }
      if (ignore.version && ignore.version !== finding.packageVersion) {
        return false;
      }
      if (ignore.location && !finding.location.includes(ignore.location)) {
        return false;
      }
      return true;
    });

    if (ignored) {
      suppressed += 1;
    } else {
      visibleFindings.push(finding);
    }
  }

  return { findings: visibleFindings, suppressed };
}

function deduplicateFindings(
  findings: DependencyFinding[]
): DependencyFinding[] {
  const unique = new Map<string, DependencyFinding>();
  for (const finding of findings) {
    const key = [
      finding.severity,
      finding.ruleId,
      finding.location,
      finding.packageName ?? "",
      finding.packageVersion ?? "",
    ].join("\u0000");
    if (!unique.has(key)) {
      unique.set(key, finding);
    }
  }
  return [...unique.values()].sort((left, right) => {
    const severityDifference =
      SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity];
    if (severityDifference !== 0) {
      return severityDifference;
    }
    return left.location.localeCompare(right.location);
  });
}

export function hasFindingsAtOrAbove(
  report: DependencyScanReport,
  failOn: FindingSeverity
): boolean {
  return report.findings.some(
    (finding) => SEVERITY_ORDER[finding.severity] >= SEVERITY_ORDER[failOn]
  );
}

export async function scanDependencies(
  options: DependencyScanOptions = {}
): Promise<DependencyScanReport> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const mode = options.mode ?? "installed";
  const policyPath = resolve(
    options.policyPath ??
      join(rootDir, "scripts", "security", "dependency-policy.json")
  );
  const policy = await readPolicy(policyPath);
  const lockfilePath = join(rootDir, "bun.lock");
  const lockfile = await readBunLockfile(lockfilePath);
  const findings: DependencyFinding[] = [];
  const manifestPaths = await collectManifestPaths(rootDir, lockfile);

  for (const manifestPath of manifestPaths) {
    const manifest = await readJson<PackageManifest>(manifestPath);
    scanDependencySections(
      manifest,
      relativeLocation(rootDir, manifestPath),
      policy,
      findings
    );
  }

  const lockfilePackages = scanLockfilePackages(
    lockfile,
    relativeLocation(rootDir, lockfilePath),
    policy,
    findings
  );

  let installedPackages = 0;
  let lifecyclePackages = 0;
  let scannedLifecycleFiles = 0;
  if (mode === "installed") {
    const packages = await findInstalledPackages(rootDir);
    installedPackages = packages.length;
    for (const installedPackage of packages) {
      const result = await scanInstalledPackage(
        installedPackage,
        rootDir,
        policy
      );
      findings.push(...result.findings);
      if (result.hasLifecycleScripts) {
        lifecyclePackages += 1;
      }
      scannedLifecycleFiles += result.scannedFiles;
    }
  }

  const deduplicated = deduplicateFindings(findings);
  const ignored = applyFindingIgnores(deduplicated, policy);
  return {
    rootDir,
    mode,
    findings: ignored.findings,
    suppressedFindings: ignored.suppressed,
    stats: {
      manifests: manifestPaths.length,
      lockfilePackages,
      installedPackages,
      lifecyclePackages,
      scannedLifecycleFiles,
    },
  };
}

export function severityRank(severity: FindingSeverity): number {
  return SEVERITY_ORDER[severity];
}
