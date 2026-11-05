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
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { applicationPath } from "./application-path";
import { assetPath, text } from "./asset-store";
import { filePath } from "./filesystem";
import { detectAssetMime } from "./asset-mime";
import { runDocumentProcess, type DocumentProcess } from "./document-process";
import { runMicrosoftOffice } from "./document-office";
import type { AssetImportWarning } from "../src/types/asset-management";

type Provider =
  "auto" | "libreOffice" | "microsoftWord" | "abiWord" | "textutil";
type Format = "docx" | "pptx" | "xlsx";
interface Config {
  autoConvertLegacyDoc: boolean;
  preferredProvider: Provider;
  libreOfficePath: string;
  abiWordPath: string;
  timeoutSeconds: number;
  isolatedProfile: boolean;
}
export interface ConverterCheck {
  available: boolean;
  version: string | null;
  message: string | null;
}
export interface ConverterCandidate extends ConverterCheck {
  provider: Provider;
  label: string;
  path: string | null;
  requiresPath: boolean;
}
interface Host {
  root: string;
  emit(event: string, payload: unknown): void;
  run?: DocumentProcess;
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
}
export interface PreparedDocument {
  path: string;
  warnings: AssetImportWarning[];
  cleanup(): Promise<void>;
}
const labels: Record<Provider, string> = {
  auto: "自动选择",
  libreOffice: "LibreOffice",
  microsoftWord: "Microsoft Office (Word/PowerPoint/Excel)",
  abiWord: "AbiWord",
  textutil: "macOS textutil",
};
function provider(value: unknown, fallback: Provider = "auto"): Provider {
  switch (value) {
    case "auto":
      return "auto";
    case "libreOffice":
    case "libreoffice":
    case "libre_office":
      return "libreOffice";
    case "microsoftWord":
    case "microsoft_word":
    case "word":
      return "microsoftWord";
    case "abiWord":
    case "abiword":
    case "abi_word":
      return "abiWord";
    case "textutil":
      return "textutil";
    default:
      return fallback;
  }
}
function legacyFormat(filename: string, mime: string): Format | undefined {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".ppt" || mime === "application/vnd.ms-powerpoint")
    return "pptx";
  if (extension === ".xls" || mime === "application/vnd.ms-excel")
    return "xlsx";
  if (
    extension === ".doc" ||
    mime === "application/msword" ||
    (extension === ".wps" && mime === "application/rtf")
  )
    return "docx";
}
/** Local converters, shared by asset imports and document preview. */
export class DocumentConverter {
  private run: DocumentProcess;
  private platform: NodeJS.Platform;
  private env: NodeJS.ProcessEnv;
  constructor(private host: Host) {
    this.run = host.run ?? runDocumentProcess;
    this.platform = host.platform ?? process.platform;
    this.env = host.environment ?? process.env;
  }
  async command(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    if (name === "detect_libreoffice_path") return this.detect("libreOffice");
    if (name === "detect_asset_manager_document_converters") {
      const result: ConverterCandidate[] = [];
      for (const id of [
        "libreOffice",
        "microsoftWord",
        "abiWord",
        "textutil",
      ] as const) {
        const executable =
          id === "libreOffice" || id === "abiWord"
            ? await this.detect(id)
            : null;
        const checked =
          executable || id === "microsoftWord" || id === "textutil"
            ? await this.check(id, executable ?? "")
            : {
                available: false,
                version: null,
                message: "未检测到 " + labels[id],
              };
        result.push({
          ...checked,
          provider: id,
          label: labels[id],
          path: executable,
          requiresPath: id === "libreOffice" || id === "abiWord",
        });
      }
      return result;
    }
    if (name === "check_asset_manager_document_converter") {
      const id = provider(args.provider, "libreOffice");
      if (id === "auto") {
        const detected = (await this.command(
          "detect_asset_manager_document_converters"
        )) as ConverterCandidate[];
        const available = detected.find((item) => item.available);
        return available
          ? {
              available: true,
              version: available.version ?? available.label,
              message: null,
            }
          : {
              available: false,
              version: null,
              message: "未检测到可用的文档转换依赖",
            };
      }
      return this.check(id, args.path == null ? "" : text(args.path).trim());
    }
    throw new Error("未知文档转换命令: " + name);
  }
  private async config(): Promise<Config | undefined> {
    let item: Partial<Config>;
    try {
      item = JSON.parse(
        await fs.readFile(
          await applicationPath(this.host.root, "asset-manager/config.json"),
          "utf8"
        )
      )?.documentConversion;
      if (!item || typeof item !== "object") return;
    } catch (error) {
      if (
        error instanceof SyntaxError ||
        (error as NodeJS.ErrnoException).code === "ENOENT"
      )
        return;
      throw error;
    }
    return {
      autoConvertLegacyDoc:
        typeof item.autoConvertLegacyDoc === "boolean"
          ? item.autoConvertLegacyDoc
          : true,
      preferredProvider: provider(item.preferredProvider),
      libreOfficePath:
        typeof item.libreOfficePath === "string"
          ? item.libreOfficePath.trim()
          : "",
      abiWordPath:
        typeof item.abiWordPath === "string" ? item.abiWordPath.trim() : "",
      timeoutSeconds: Number.isFinite(item.timeoutSeconds)
        ? Math.max(10, Math.min(1800, Number(item.timeoutSeconds)))
        : 120,
      isolatedProfile: item.isolatedProfile !== false,
    };
  }
  private async check(
    id: Exclude<Provider, "auto">,
    executable = ""
  ): Promise<ConverterCheck> {
    try {
      let version: string;
      if (id === "microsoftWord") {
        if (this.platform !== "win32")
          throw new Error("Microsoft Office COM 转换仅支持 Windows");
        const directory = await this.workDirectory("office-check");
        try {
          version = await runMicrosoftOffice(this.run, directory, "docx", 8000);
        } finally {
          await fs.rm(directory, { recursive: true, force: true });
        }
      } else if (id === "textutil") {
        if (this.platform !== "darwin")
          throw new Error("textutil 转换仅支持 macOS");
        await this.run("/usr/bin/textutil", ["-help"], { timeoutMs: 5000 });
        version = "macOS textutil";
      } else {
        if (!executable)
          throw new Error("请配置 " + labels[id] + " 可执行文件路径");
        const output = await this.run(executable, ["--version"], {
          timeoutMs: 5000,
        });
        const reported = output.stdout || output.stderr || labels[id];
        version =
          id === "libreOffice"
            ? reported.replace(/\s+[a-f0-9]{20,64}$/i, "")
            : reported;
      }
      return { available: true, version, message: null };
    } catch (error) {
      return {
        available: false,
        version: null,
        message: (error as Error).message,
      };
    }
  }
  private async detect(id: "libreOffice" | "abiWord"): Promise<string | null> {
    const candidates: string[] = [];
    if (this.platform === "win32") {
      for (const base of [
        this.env.ProgramFiles || "C:\\Program Files",
        this.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
      ]) {
        if (id === "libreOffice") {
          for (const version of ["", " 5", " 6", " 7", " 24", " 25", " 26"])
            for (const file of ["soffice.com", "soffice.exe"])
              candidates.push(
                path.join(base, "LibreOffice" + version, "program", file)
              );
        } else
          candidates.push(
            path.join(base, "AbiWord/bin/AbiWord.exe"),
            path.join(base, "AbiWord/AbiWord.exe")
          );
      }
    } else if (this.platform === "darwin") {
      candidates.push(
        id === "libreOffice"
          ? "/Applications/LibreOffice.app/Contents/MacOS/soffice"
          : "/Applications/AbiWord.app/Contents/MacOS/AbiWord"
      );
      for (const base of ["/opt/homebrew/bin", "/usr/local/bin"])
        candidates.push(
          path.join(base, id === "libreOffice" ? "soffice" : "abiword")
        );
    } else {
      for (const base of ["/usr/bin", "/usr/local/bin", "/snap/bin"])
        candidates.push(
          path.join(base, id === "libreOffice" ? "soffice" : "abiword")
        );
      if (id === "libreOffice")
        candidates.push(
          "/usr/bin/libreoffice",
          "/usr/local/bin/libreoffice",
          "/snap/bin/libreoffice",
          "/var/lib/flatpak/exports/bin/org.libreoffice.LibreOffice"
        );
    }
    const names =
      this.platform === "win32"
        ? id === "libreOffice"
          ? ["soffice.com", "soffice.exe"]
          : ["AbiWord.exe", "abiword.exe"]
        : id === "libreOffice"
          ? ["soffice", "libreoffice"]
          : ["abiword"];
    for (const name of names) candidates.push(name);
    for (const executable of [...new Set(candidates)]) {
      if (
        path.isAbsolute(executable) &&
        !(await fs.stat(executable).catch(() => undefined))?.isFile()
      )
        continue;
      if ((await this.check(id, executable)).available) return executable;
    }
    return null;
  }
  private async resolve(
    config: Config
  ): Promise<{ id: Exclude<Provider, "auto">; executable: string }> {
    const configured = (id: "libreOffice" | "abiWord") =>
      id === "libreOffice" ? config.libreOfficePath : config.abiWordPath;
    if (config.preferredProvider !== "auto") {
      const id = config.preferredProvider;
      const executable =
        id === "libreOffice" || id === "abiWord"
          ? configured(id) || (await this.detect(id)) || ""
          : "";
      const result = await this.check(id, executable);
      if (!result.available)
        throw new Error(result.message || "转换器暂不可用");
      return { id, executable };
    }
    if (
      config.libreOfficePath &&
      (await this.check("libreOffice", config.libreOfficePath)).available
    )
      return { id: "libreOffice", executable: config.libreOfficePath };
    if ((await this.check("microsoftWord")).available)
      return { id: "microsoftWord", executable: "" };
    if (
      config.abiWordPath &&
      (await this.check("abiWord", config.abiWordPath)).available
    )
      return { id: "abiWord", executable: config.abiWordPath };
    for (const id of ["libreOffice", "abiWord"] as const) {
      const executable = await this.detect(id);
      if (executable) return { id, executable };
    }
    if ((await this.check("textutil")).available)
      return { id: "textutil", executable: "" };
    throw new Error("未检测到可用的文档转换依赖");
  }
  private async workDirectory(prefix: string): Promise<string> {
    const directory = await applicationPath(
      this.host.root,
      "work/conversions/" + prefix + "-" + randomUUID()
    );
    await fs.mkdir(directory, { recursive: true });
    return directory;
  }
  private warning(
    source: string,
    original: string,
    format: Format | undefined,
    suffix: "NotConfigured" | "NotSupported",
    detail = ""
  ): AssetImportWarning {
    const extension = path.extname(source).slice(1).toUpperCase();
    const label =
      extension === "WPS"
        ? "WPS"
        : format === "pptx"
          ? "PPT"
          : format === "xlsx"
            ? "XLS"
            : "DOC";
    const code =
      label === "WPS"
        ? "wpsConverter"
        : "legacy" + label[0] + label.slice(1).toLowerCase() + "Converter";
    return {
      code: code + suffix,
      title: label + " 文档待转换",
      message:
        "「" +
        path.basename(original || source) +
        "」已按原格式入库。请在资产管理器「文件操作 → 文档转换设置」中启用并配置转换器，保存后重新导入，可转换为 " +
        (format || "docx").toUpperCase() +
        "。" +
        (detail ? "当前检测结果：" + detail : ""),
      sourcePath: original,
    };
  }
  async shouldPrepareAgain(name: string, mime: string): Promise<boolean> {
    return (
      !!legacyFormat(name, mime) &&
      !!(await this.config())?.autoConvertLegacyDoc
    );
  }
  async prepare(
    source: string,
    base: string,
    original: string
  ): Promise<PreparedDocument> {
    const mime = await detectAssetMime(source);
    const format = legacyFormat(source, mime);
    const unchanged = (
      warnings: AssetImportWarning[] = []
    ): PreparedDocument => ({
      path: source,
      warnings,
      cleanup: async () => {},
    });
    if (!format) {
      if (
        path.extname(source).toLowerCase() === ".wps" &&
        mime === "application/kswps"
      )
        return unchanged([
          {
            code: "wpsUnsupportedFormat",
            title: "WPS 文档待转换",
            message:
              "文件已按原格式入库。此 WPS 使用其他格式或加密结构，请用 WPS 另存为 DOCX 后重新导入。",
            sourcePath: original,
          },
        ]);
      return unchanged();
    }
    const config = await this.config();
    if (!config?.autoConvertLegacyDoc)
      return unchanged([
        this.warning(source, original, format, "NotConfigured"),
      ]);
    let resolved: Awaited<ReturnType<DocumentConverter["resolve"]>>;
    try {
      resolved = await this.resolve(config);
    } catch (error) {
      return unchanged([
        this.warning(
          source,
          original,
          format,
          "NotConfigured",
          (error as Error).message
        ),
      ]);
    }
    if (
      format !== "docx" &&
      resolved.id !== "libreOffice" &&
      resolved.id !== "microsoftWord"
    )
      return unchanged([
        this.warning(
          source,
          original,
          format,
          "NotSupported",
          labels[resolved.id] +
            " 仅支持 Word 文档，请选择 LibreOffice 或 Microsoft Office"
        ),
      ]);
    const parent = await assetPath(base, ".conversion-cache");
    await fs.mkdir(parent, { recursive: true });
    const directory = await fs.mkdtemp(path.join(parent, "document-"));
    const cleanup = () => fs.rm(directory, { recursive: true, force: true });
    try {
      this.host.emit("asset-import-progress", {
        originalPath: original,
        phase: "converting",
        detail:
          "使用 " + labels[resolved.id] + " 转换为 " + format.toUpperCase(),
        convertedName: null,
      });
      const output = path.join(directory, "output");
      await fs.mkdir(output);
      let input = source;
      if (path.extname(source).toLowerCase() === ".wps") {
        const staging = path.join(directory, "source");
        await fs.mkdir(staging);
        input = path.join(
          staging,
          path.parse(source).name +
            (mime === "application/rtf" ? ".rtf" : ".doc")
        );
        await fs.copyFile(source, input);
      }
      const target = path.join(output, path.parse(input).name + "." + format);
      const options = {
        timeoutMs: config.timeoutSeconds * 1000,
        cwd: directory,
      };
      if (resolved.id === "libreOffice") {
        const args = [
          "--headless",
          "--nologo",
          "--nofirststartwizard",
          "--nolockcheck",
          "--nodefault",
        ];
        if (config.isolatedProfile) {
          const profile = path.join(directory, "profile");
          await fs.mkdir(path.join(profile, "user"), { recursive: true });
          await fs.writeFile(
            path.join(profile, "user/registrymodifications.xcu"),
            '<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>'
          );
          args.push("-env:UserInstallation=" + pathToFileURL(profile).href);
        }
        args.push("--convert-to", format, "--outdir", output, input);
        await this.run(resolved.executable, args, options);
      } else if (resolved.id === "abiWord")
        await this.run(
          resolved.executable,
          ["--to=docx", "--to-name=" + target, input],
          options
        );
      else if (resolved.id === "textutil")
        await this.run(
          "/usr/bin/textutil",
          ["-convert", "docx", "-output", target, input],
          options
        );
      else
        await runMicrosoftOffice(
          this.run,
          directory,
          format,
          options.timeoutMs,
          input,
          target
        );
      const stat = await fs.lstat(target).catch(() => undefined);
      if (!stat?.isFile() || stat.isSymbolicLink() || !stat.size)
        throw new Error(
          labels[resolved.id] +
            " 已结束，但未生成有效的 " +
            format.toUpperCase() +
            " 文件"
        );
      // Verify the container, rather than accepting an unchanged legacy payload with a new extension.
      const { fileTypeFromFile } = await import("file-type");
      const detected = await fileTypeFromFile(target).catch(() => undefined);
      if (detected?.ext !== format)
        throw new Error("转换结果与 " + format.toUpperCase() + " 格式不匹配");
      return { path: target, warnings: [], cleanup };
    } catch (error) {
      await cleanup();
      throw error;
    }
  }
  async preview(value: unknown, base: string): Promise<string | null> {
    const input = text(value, "文档路径");
    const source =
      path.isAbsolute(input) || input.startsWith("file:")
        ? filePath(input, undefined, {})
        : await assetPath(base, input);
    if (!(await fs.stat(source)).isFile()) throw new Error("文档文件不存在");
    const mime = await detectAssetMime(source);
    const wps = path.extname(source).toLowerCase() === ".wps";
    const modernWps = wps && mime.includes("wordprocessingml");
    if (wps && !modernWps && !legacyFormat(source, mime))
      throw new Error(
        "此 WPS 文件使用其他格式或加密结构，请用 WPS 另存为 DOCX 后打开"
      );
    if (!legacyFormat(source, mime) && !modernWps) return null;
    const output = await this.workDirectory("preview");
    let prepared: PreparedDocument | undefined;
    try {
      prepared = modernWps
        ? { path: source, warnings: [], cleanup: async () => {} }
        : await this.prepare(source, base, input);
      if (!modernWps && prepared.path === source)
        throw new Error(
          prepared.warnings[0]?.message || "请先配置文档转换程序"
        );
      const name =
        path.parse(prepared.path).name +
        (modernWps ? ".docx" : path.extname(prepared.path));
      const target = path.join(output, name);
      await fs.copyFile(prepared.path, target);
      return target;
    } catch (error) {
      await fs.rm(output, { recursive: true, force: true });
      throw error;
    } finally {
      await prepared?.cleanup();
    }
  }
}
