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

import fs from "node:fs/promises";
import path from "node:path";
import { applicationPath, relativeApplicationPath } from "./application-path";
import { filePath } from "./filesystem";
import { pluginId } from "./plugin-packages";

export interface PluginRuntimeHost {
  root: string;
  workspaceRoot?: string;
}
export interface SidecarSpec {
  id: string;
  directory: string;
  executable: string;
  args: string[];
  dataDirectory: string;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("插件运行配置无效");
  return value as Record<string, unknown>;
}
async function resolveRuntime(
  host: PluginRuntimeHost,
  args: Record<string, unknown>,
  type: "native" | "sidecar"
) {
  const id = pluginId(args.pluginId);
  let directory: string;
  if (args.installPath === undefined)
    directory = path.join(host.root, "plugins", id);
  else if (typeof args.installPath !== "string")
    throw new Error("插件安装路径无效");
  else
    directory = path.isAbsolute(args.installPath)
      ? filePath(args.installPath, undefined, {})
      : path.resolve(
          host.workspaceRoot ?? host.root,
          relativeApplicationPath(args.installPath.replaceAll("\\", "/"))
        );
  const installed = path.join(host.root, "plugins", id);
  if (!path.relative(installed, directory))
    directory = await applicationPath(host.root, "plugins/" + id);
  else {
    if (!host.workspaceRoot) throw new Error("插件路径超出安装目录");
    const folder = pluginId(
      path
        .relative(path.join(host.workspaceRoot, "plugins"), directory)
        .replaceAll(path.sep, "/")
    );
    directory = await applicationPath(host.workspaceRoot, "plugins/" + folder);
  }
  const manifestFile = await applicationPath(directory, "manifest.json");
  if ((await fs.stat(manifestFile)).size > 1024 ** 2)
    throw new Error("插件清单过大");
  const manifest = object(JSON.parse(await fs.readFile(manifestFile, "utf8")));
  if (manifest.id !== id || manifest.type !== type)
    throw new Error("插件 ID 或类型与安装清单不匹配");
  return { id, directory, manifest };
}
function requestedArtifact(
  host: PluginRuntimeHost,
  directory: string,
  executable: string,
  declared: string,
  request: unknown
) {
  if (typeof request !== "string") throw new Error("需要插件当前平台产物路径");
  const requested = request.replaceAll("\\", "/");
  const resolved =
    requested === declared
      ? executable
      : path.resolve(host.workspaceRoot ?? directory, requested);
  if (path.relative(executable, resolved))
    throw new Error("产物路径与 manifest 当前平台声明不匹配");
}
export async function resolveSidecar(
  host: PluginRuntimeHost,
  args: Record<string, unknown>
): Promise<SidecarSpec> {
  const { id, directory, manifest } = await resolveRuntime(
    host,
    args,
    "sidecar"
  );
  const sidecar = object(manifest.sidecar),
    binaries = object(sidecar.executable);
  if (args.resident === true && sidecar.resident !== true)
    throw new Error("插件未声明常驻 Sidecar 模式");
  const platform = process.platform + "-" + process.arch;
  if (typeof binaries[platform] !== "string")
    throw new Error("插件不支持当前平台: " + platform);
  const declared = relativeApplicationPath(
    (binaries[platform] as string).replaceAll("\\", "/")
  );
  const executable = await applicationPath(directory, declared);
  const info = await fs.stat(executable);
  if (!info.isFile() || !info.size)
    throw new Error("插件当前平台产物无效: " + declared);
  requestedArtifact(host, directory, executable, declared, args.executablePath);
  const commandArgs = sidecar.args ?? [];
  if (
    !Array.isArray(commandArgs) ||
    commandArgs.some(
      (value) => typeof value !== "string" || value.includes("\0")
    ) ||
    JSON.stringify(args.args ?? []) !== JSON.stringify(commandArgs)
  )
    throw new Error("Sidecar 参数与 manifest 声明不匹配");
  const dataDirectory = await applicationPath(host.root, "plugins-data/" + id);
  await fs.mkdir(dataDirectory, { recursive: true });
  return { id, directory, executable, args: commandArgs, dataDirectory };
}

export interface NativeSpec {
  id: string;
  directory: string;
  library: string;
  reloadable: boolean;
}
export async function resolveNative(
  host: PluginRuntimeHost,
  args: Record<string, unknown>
): Promise<NativeSpec> {
  const { id, directory, manifest } = await resolveRuntime(
    host,
    args,
    "native"
  );
  const native = object(manifest.native),
    libraries = object(native.library);
  const platform = process.platform + "-" + process.arch;
  if (typeof libraries[platform] !== "string")
    throw new Error("插件不支持当前平台: " + platform);
  const declared = relativeApplicationPath(
    (libraries[platform] as string).replaceAll("\\", "/")
  );
  const library = await applicationPath(directory, declared);
  const stat = await fs.stat(library);
  if (!stat.isFile() || !stat.size)
    throw new Error("插件当前平台产物无效: " + declared);
  requestedArtifact(host, directory, library, declared, args.libraryPath);
  const reloadable = native.reloadable === true;
  if (args.reloadable !== undefined && args.reloadable !== reloadable)
    throw new Error("卸载策略与 manifest 声明不匹配");
  return { id, directory, library, reloadable };
}
