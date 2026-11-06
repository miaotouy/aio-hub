// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { formatBytes } from "@/utils/fileUtils";
import { formatDateTime } from "@/utils/time";
import type { FileEntry, FileOperationResult, FileSearchHit } from "../types";

const cell = (value: string) =>
  value.replace(/\|/g, "\\|").replace(/\r\n|\r|\n/g, " ↵ ");
const size = (bytes: unknown) =>
  typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0
    ? formatBytes(bytes)
    : "未知";
const date = (seconds: unknown) =>
  typeof seconds === "number" &&
  Number.isFinite(seconds) &&
  Number.isFinite(new Date(seconds * 1000).getTime())
    ? formatDateTime(seconds * 1000, "yyyy-MM-dd HH:mm:ss")
    : "未知";

/** Preserve the domain result and add the text consumed by local and distributed agents. */
export function presentFileOperationResult(
  result: FileOperationResult,
  context: { directoryPath?: string } = {}
): FileOperationResult {
  const data = result.data;
  const lines = [
    result.success ? result.message : "操作失败：" + result.message,
  ];
  if (result.success && data) {
    if (typeof data.content === "string") {
      if (typeof data.size === "number")
        lines.push("文件大小：" + size(data.size));
      if (data.lineRange) {
        const range = data.lineRange;
        lines.push(
          range.returnedLines
            ? "行范围：" +
                range.startLine +
                "–" +
                range.endLine +
                " / 共 " +
                range.totalLines +
                " 行"
            : "所选行范围为空 / 共 " + range.totalLines + " 行"
        );
      }
      // File text stays literal, including whitespace, quotes and its original line endings.
      return {
        ...result,
        content: [
          { type: "text", text: lines.join("\n") + "\n\n" + data.content },
        ],
      };
    }
    if (Array.isArray(data.entries)) {
      if (!data.entries.length) lines.push("目录为空。");
      else
        lines.push(
          "",
          "| 名称 | 类型 | 大小 | 修改时间 |",
          "| --- | --- | --- | --- |",
          ...data.entries.map(
            (entry: FileEntry) =>
              "| " +
              cell(entry.name) +
              " | " +
              (entry.isDirectory ? "目录" : "文件") +
              " | " +
              (entry.isDirectory ? "—" : size(entry.size)) +
              " | " +
              date(entry.modified) +
              " |"
          )
        );
    } else if (Array.isArray(data.hits)) {
      if (context.directoryPath)
        lines.push("搜索目录：" + context.directoryPath);
      if (!data.hits.length) lines.push("未找到匹配项。");
      else
        lines.push(
          "",
          "| 路径 | 类型 | 大小 |",
          "| --- | --- | --- |",
          ...data.hits.map(
            (hit: FileSearchHit) =>
              "| " +
              cell(hit.relativePath) +
              " | " +
              (hit.isDir ? "目录" : "文件") +
              " | " +
              (hit.isDir ? "—" : size(hit.size)) +
              " |"
          )
        );
    } else if (data.metadata) {
      const metadata = data.metadata;
      lines.push("类型：" + (metadata.isDir ? "目录" : "文件"));
      if (!metadata.isDir) lines.push("大小：" + size(metadata.size));
      lines.push(
        "修改时间：" + date(metadata.modified),
        "创建时间：" + date(metadata.created)
      );
    } else if (data.mimeType) {
      lines.push("媒体类型：" + data.mimeType, "大小：" + size(data.size));
    } else if (
      typeof data.path === "string" &&
      !result.message.includes(data.path)
    ) {
      lines.push("路径：" + data.path);
    }
    if (Array.isArray(data.warnings) && data.warnings.length) {
      lines.push(
        "",
        "注意：",
        ...data.warnings.map((warning: string) => "- " + warning)
      );
    }
  }
  return { ...result, content: [{ type: "text", text: lines.join("\n") }] };
}
