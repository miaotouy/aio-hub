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

import {
  hasFindingsAtOrAbove,
  scanDependencies,
  type FindingSeverity,
  type ScanMode,
} from "./dependency-scanner";

interface CliOptions {
  mode: ScanMode;
  failOn: FindingSeverity;
  format: "text" | "json";
  policyPath?: string;
}

const VALID_SEVERITIES = new Set<FindingSeverity>([
  "low",
  "medium",
  "high",
  "critical",
]);

function printHelp(): void {
  console.info(`依赖供应链扫描

用法:
  bun scripts/security/scan-dependencies.ts [选项]

选项:
  --mode <lock|installed>      lock 仅扫描清单与锁文件；installed 还扫描实际安装包
  --fail-on <severity>         low、medium、high 或 critical；默认 high
  --format <text|json>         输出格式；默认 text
  --policy <path>              自定义策略文件路径
  --help                       显示帮助
`);
}

function readOptionValue(args: string[], index: number): [string, number] {
  const argument = args[index];
  const equalIndex = argument.indexOf("=");
  if (equalIndex >= 0) {
    return [argument.slice(equalIndex + 1), index];
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`参数 ${argument} 缺少值`);
  }
  return [value, index + 1];
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    mode: "installed",
    failOn: "high",
    format: "text",
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      printHelp();
      process.exit(0);
    }
    if (argument.startsWith("--mode")) {
      const [value, consumedIndex] = readOptionValue(args, index);
      if (value !== "lock" && value !== "installed") {
        throw new Error(`未知扫描模式: ${value}`);
      }
      options.mode = value;
      index = consumedIndex;
      continue;
    }
    if (argument.startsWith("--fail-on")) {
      const [value, consumedIndex] = readOptionValue(args, index);
      if (!VALID_SEVERITIES.has(value as FindingSeverity)) {
        throw new Error(`未知严重级别: ${value}`);
      }
      options.failOn = value as FindingSeverity;
      index = consumedIndex;
      continue;
    }
    if (argument.startsWith("--format")) {
      const [value, consumedIndex] = readOptionValue(args, index);
      if (value !== "text" && value !== "json") {
        throw new Error(`未知输出格式: ${value}`);
      }
      options.format = value;
      index = consumedIndex;
      continue;
    }
    if (argument.startsWith("--policy")) {
      const [value, consumedIndex] = readOptionValue(args, index);
      options.policyPath = value;
      index = consumedIndex;
      continue;
    }
    throw new Error(`未知参数: ${argument}`);
  }

  return options;
}

function printTextReport(
  report: Awaited<ReturnType<typeof scanDependencies>>,
  failOn: FindingSeverity
): void {
  const { stats } = report;
  console.info(
    `依赖供应链扫描完成: ${stats.manifests} 个清单, ${stats.lockfilePackages} 条锁文件记录` +
      (report.mode === "installed"
        ? `, ${stats.installedPackages} 个安装包, ${stats.lifecyclePackages} 个含安装生命周期脚本的包, ${stats.scannedLifecycleFiles} 个脚本文件`
        : "")
  );

  if (report.findings.length === 0) {
    console.info("未发现需要报告的风险。\n");
  } else {
    for (const finding of report.findings) {
      const packageLabel = finding.packageName
        ? ` ${finding.packageName}${finding.packageVersion ? `@${finding.packageVersion}` : ""}`
        : "";
      console.info(
        `[${finding.severity.toUpperCase()}] ${finding.ruleId}${packageLabel}\n` +
          `  ${finding.message}\n` +
          `  位置: ${finding.location}` +
          (finding.evidence ? `\n  证据: ${finding.evidence}` : "")
      );
    }
    console.info("");
  }

  if (report.suppressedFindings > 0) {
    console.info(
      `已按 dependency-policy.json 忽略 ${report.suppressedFindings} 条有理由的精确规则命中。`
    );
  }

  if (hasFindingsAtOrAbove(report, failOn)) {
    console.error(`扫描失败: 存在 ${failOn} 或更高级别风险。`);
  } else {
    console.info(`扫描通过: 不存在 ${failOn} 或更高级别风险。`);
  }
}

try {
  const options = parseArgs(Bun.argv.slice(2));
  const report = await scanDependencies({
    mode: options.mode,
    policyPath: options.policyPath,
  });
  if (options.format === "json") {
    console.info(JSON.stringify(report, null, 2));
  } else {
    printTextReport(report, options.failOn);
  }
  if (hasFindingsAtOrAbove(report, options.failOn)) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `依赖供应链扫描无法完成: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 2;
}
