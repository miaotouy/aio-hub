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

/**
 * 图片文件名清洗与查重工具
 *
 * 1. 自动将 "image.png" 转换为 "截图_HHMMSS.png"
 * 2. 自动处理重名，加上 (1), (2) 等后缀
 */

/**
 * 对单个文件名进行清洗：处理默认截图名
 */
export function sanitizeFileName(fileName: string): string {
  if (fileName === "image.png") {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(
      now.getMinutes()
    ).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    return `截图_${timeStr}.png`;
  }
  return fileName;
}

/**
 * 在已有文件名集合中查找可用名（自动递增后缀）
 */
export function resolveUniqueName(
  desiredName: string,
  existingNames: Set<string>
): string {
  let finalName = desiredName;
  let counter = 1;
  const lastDotIndex = desiredName.lastIndexOf(".");
  const baseName =
    lastDotIndex !== -1 ? desiredName.slice(0, lastDotIndex) : desiredName;
  const ext = lastDotIndex !== -1 ? desiredName.slice(lastDotIndex) : "";

  while (existingNames.has(finalName)) {
    finalName = `${baseName} (${counter})${ext}`;
    counter++;
  }

  return finalName;
}

/**
 * 对一组文件进行批量清洗与查重
 * @param files 原始文件列表
 * @param existingNames 当前已有的文件名集合（会被修改）
 * @returns 清洗后的文件列表
 */
export function sanitizeImageFiles(
  files: File[],
  existingNames: Set<string>
): File[] {
  return files.map((file) => {
    // 1. 清洗文件名
    const cleanedName = sanitizeFileName(file.name);

    // 2. 查重
    const uniqueName = resolveUniqueName(cleanedName, existingNames);

    // 3. 记录已用名
    existingNames.add(uniqueName);

    // 4. 如果名字变了，重新包装 File 对象
    if (uniqueName !== file.name) {
      return new File([file], uniqueName, { type: file.type });
    }
    return file;
  });
}
