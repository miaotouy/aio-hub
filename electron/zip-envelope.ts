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

export interface ZipLimits {
  archive: number;
  expanded: number;
  file: number;
  entries: number;
}
/** Inspect the standard central directory before JSZip can discard duplicate/empty entries.
 * PKWARE APPNOTE 4.3.12/4.3.16. Backups are bounded below ZIP64 size/count thresholds.
 */
export function validateZipEnvelope(
  data: Buffer,
  limits: ZipLimits,
  validateName?: (name: string) => unknown
): number {
  let end = -1;
  for (
    let offset = data.length - 22;
    offset >= Math.max(0, data.length - 65557);
    offset--
  ) {
    if (
      data.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + data.readUInt16LE(offset + 20) === data.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("ZIP 目录尾记录损坏");
  const count = data.readUInt16LE(end + 10);
  const length = data.readUInt32LE(end + 12);
  let offset = data.readUInt32LE(end + 16);
  if (
    data.readUInt16LE(end + 4) ||
    data.readUInt16LE(end + 6) ||
    data.readUInt16LE(end + 8) !== count ||
    count === 0xffff ||
    length === 0xffffffff ||
    offset === 0xffffffff
  )
    throw new Error("请使用普通单卷 ZIP，分卷和 ZIP64 归档请先重新打包");
  if (count > limits.entries * 2 + 1 || offset + length !== end)
    throw new Error("ZIP 目录范围或条目数量无效");
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || data.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("ZIP 中央目录损坏");
    const method = data.readUInt16LE(offset + 10);
    const compressed = data.readUInt32LE(offset + 20);
    const expanded = data.readUInt32LE(offset + 24);
    const names = data.readUInt16LE(offset + 28);
    const size =
      46 +
      names +
      data.readUInt16LE(offset + 30) +
      data.readUInt16LE(offset + 32);
    const attributes = data.readUInt32LE(offset + 38);
    if (offset + size > end || !names || data.readUInt16LE(offset + 34))
      throw new Error("ZIP 条目范围无效");
    validateName?.(
      data.subarray(offset + 46, offset + 46 + names).toString("utf8")
    );
    const directory =
      !!(attributes & 16) ||
      ((attributes >>> 16) & 0o170000) === 0o040000 ||
      data[offset + 46 + names - 1] === 47;
    // JSZip drops directory contents and declared-empty file contents while loading.
    // Bound those hidden payloads before the later CRC pass sees the original archive.
    if (directory && expanded) throw new Error("ZIP 目录条目含文件数据");
    if (!expanded && compressed > (method === 8 ? 2 : 0))
      throw new Error("ZIP 空条目含异常压缩数据");
    total += expanded;
    if (expanded > limits.file || total > limits.expanded)
      throw new Error("ZIP 解压数据超出导入大小上限");
    offset += size;
  }
  if (offset !== end) throw new Error("ZIP 中央目录数量不匹配");
  return count;
}
