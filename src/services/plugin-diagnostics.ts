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

import type {
  PluginDiagnostic,
  PluginProxy,
} from "./plugin-types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyRuntimeFailure(
  stage: "load" | "activation",
  message: string
): Pick<PluginDiagnostic, "code" | "title" | "resolution"> {
  if (/未知方法|unknown method|method .+ not found/i.test(message)) {
    return {
      code: "PLUGIN_PROTOCOL_METHOD_UNSUPPORTED",
      title: "插件协议方法不匹配",
      resolution:
        "确认 manifest 方法声明与实际运行的 Sidecar 来自同一次构建，并直接检查 manifest 路径指向的二进制",
    };
  }
  if (/hostContext|启动握手|协议不兼容|protocol.*incompatible/i.test(message)) {
    return {
      code: "PLUGIN_PROTOCOL_HANDSHAKE_FAILED",
      title: "插件启动握手失败",
      resolution:
        "核对插件 API、Sidecar 协议版本和 startupMethod，并确认宿主启动上下文未被构建产物降级",
    };
  }
  if (/找不到.+(?:文件|产物)|no such file|not found/i.test(message)) {
    return {
      code: "PLUGIN_ARTIFACT_NOT_FOUND",
      title: "插件运行文件不存在",
      resolution:
        "检查 manifest 相对路径和发布包目录结构，重新构建并部署当前平台产物",
    };
  }
  return stage === "load"
    ? {
        code: "PLUGIN_LOAD_FAILED",
        title: "插件加载失败",
        resolution:
          "检查 manifest 入口及其依赖文件是否完整，并确认发布包目录结构正确",
      }
    : {
        code: "PLUGIN_ACTIVATION_FAILED",
        title: "插件启动失败",
        resolution:
          "核对 manifest 当前平台产物、启动参数和协议版本；修复后重新启用插件",
      };
}

function runtimeArtifactDetails(plugin: PluginProxy) {
  if (plugin.manifest.type === "sidecar") {
    return [
      {
        label: "Sidecar 产物声明",
        value: JSON.stringify(plugin.manifest.sidecar?.executable ?? {}),
      },
    ];
  }
  if (plugin.manifest.type === "native") {
    return [
      {
        label: "Native 产物声明",
        value: JSON.stringify(plugin.manifest.native?.library ?? {}),
      },
    ];
  }
  return [
    {
      label: "JS 入口",
      value: plugin.manifest.main || "未声明",
    },
  ];
}

export function getPrimaryPluginDiagnostic(
  plugin: PluginProxy
): PluginDiagnostic | undefined {
  return plugin.diagnostics?.find((item) => item.severity === "error");
}

export function getPluginFailureSummary(plugin: PluginProxy): string {
  const diagnostic = getPrimaryPluginDiagnostic(plugin);
  if (diagnostic) {
    const resolution = diagnostic.resolution
      ? `；处理建议：${diagnostic.resolution}`
      : "";
    return `${diagnostic.title}：${diagnostic.message}${resolution}`;
  }
  return plugin.error?.message || "未记录具体故障原因，请查看应用日志";
}

export function markPluginRuntimeFailure(
  plugin: PluginProxy,
  stage: "load" | "activation",
  error: unknown
): void {
  const normalizedError =
    error instanceof Error ? error : new Error(errorMessage(error));
  const stageLabel = stage === "load" ? "加载" : "启动";
  const classification = classifyRuntimeFailure(stage, normalizedError.message);
  const diagnostic: PluginDiagnostic = {
    code: classification.code,
    severity: "error",
    title: classification.title,
    message: normalizedError.message,
    details: [
      { label: "阶段", value: stageLabel },
      { label: "插件 ID", value: plugin.manifest.id },
      { label: "插件类型", value: plugin.manifest.type },
      { label: "安装目录", value: plugin.installPath },
      ...runtimeArtifactDetails(plugin),
      { label: "错误类型", value: normalizedError.name || "Error" },
    ],
    resolution: classification.resolution,
  };

  plugin.isBroken = true;
  plugin.error = normalizedError;
  plugin.diagnostics = [
    ...(plugin.diagnostics ?? []).filter(
      (item) =>
        item.code !== "PLUGIN_LOAD_FAILED" &&
        item.code !== "PLUGIN_ACTIVATION_FAILED" &&
        item.code !== "PLUGIN_PROTOCOL_METHOD_UNSUPPORTED" &&
        item.code !== "PLUGIN_PROTOCOL_HANDSHAKE_FAILED" &&
        item.code !== "PLUGIN_ARTIFACT_NOT_FOUND"
    ),
    diagnostic,
  ];
}

export function clearPluginRuntimeFailures(plugin: PluginProxy): void {
  plugin.diagnostics = plugin.diagnostics?.filter(
    (item) =>
      item.code !== "PLUGIN_LOAD_FAILED" &&
      item.code !== "PLUGIN_ACTIVATION_FAILED" &&
      item.code !== "PLUGIN_PROTOCOL_METHOD_UNSUPPORTED" &&
      item.code !== "PLUGIN_PROTOCOL_HANDSHAKE_FAILED" &&
      item.code !== "PLUGIN_ARTIFACT_NOT_FOUND"
  );
  if (plugin.diagnostics?.length === 0) {
    delete plugin.diagnostics;
  }
}
