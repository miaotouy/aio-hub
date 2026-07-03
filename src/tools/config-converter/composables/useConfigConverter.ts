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

import { ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useDebounceFn } from "@vueuse/core";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type {
  ConfigFormat,
  ConvertOptions,
  BatchFileItem,
  ScanOptions,
} from "../types";
import { convertConfig } from "../logic/converter";
import { detectFormat, detectFormatByPath } from "../logic/detect";

const errorHandler = createModuleErrorHandler("ConfigConverter");

export function useConfigConverter() {
  // 模式：single (单文件双栏) | batch (批量文件/目录)
  const mode = ref<"single" | "batch">("single");

  // ==========================================
  // 单文件模式状态
  // ==========================================
  const singleInput = ref("");
  const singleOutput = ref("");
  const singleFrom = ref<ConfigFormat>("json");
  const singleTo = ref<ConfigFormat>("yaml");
  const singleError = ref("");
  const singleWarnings = ref<string[]>([]);
  const singleOptions = ref<ConvertOptions>({
    iniDelimiter: ".",
    xmlRootName: "root",
    xmlFormat: true,
    yamlIndent: 2,
    jsonIndent: 2,
  });

  // ==========================================
  // 批量模式状态
  // ==========================================
  const batchItems = ref<BatchFileItem[]>([]);
  const batchTo = ref<ConfigFormat>("json");
  const batchOptions = ref<ConvertOptions>({
    iniDelimiter: ".",
    xmlRootName: "root",
    xmlFormat: true,
    yamlIndent: 2,
    jsonIndent: 2,
  });
  const scanOptions = ref<ScanOptions>({
    maxDepth: 0, // 无限制
    showHidden: false,
  });
  const outputMode = ref<"preview" | "inplace" | "directory">("preview");
  const outputDirectory = ref("");
  const isConverting = ref(false);

  // ==========================================
  // 单文件转换逻辑
  // ==========================================
  /**
   * 单文件模式下加载文件
   */
  const loadSingleFile = async (filePath: string) => {
    try {
      const isDir = await invoke<boolean>("is_directory", { path: filePath });
      if (isDir) {
        // 如果是目录，自动切换到批量模式并添加
        mode.value = "batch";
        await addFiles([filePath]);
        return;
      }

      const content = await invoke<string>("read_text_file_force", {
        path: filePath,
      });

      const detected = detectFormat(filePath, content);
      singleFrom.value = detected;

      singleInput.value = content;
      const fileName = filePath.substring(
        Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1
      );
      customMessage.success(`已成功加载文件: ${fileName}`);
    } catch (error: any) {
      errorHandler.error(error, `加载文件失败: ${filePath}`);
    }
  };

  const loadSingleFileObject = async (file: File) => {
    try {
      const content = await file.text();
      const detected = detectFormat(file.name, content);
      singleFrom.value = detected;
      singleInput.value = content;
      customMessage.success(`已成功加载文件: ${file.name}`);
    } catch (error: any) {
      errorHandler.error(error, `加载文件失败: ${file.name}`);
    }
  };

  /**
   * 处理单文件模式下的拖放/导入
   */
  const handleSingleImport = async (paths: string[]) => {
    if (paths.length === 0) return;

    if (paths.length > 1) {
      // 多个文件，自动切换到批量模式并添加
      mode.value = "batch";
      await addFiles(paths);
      customMessage.info("已自动切换到批量模式并添加文件");
      return;
    }

    // 单个文件/目录
    await loadSingleFile(paths[0]);
  };

  const handleSingleImportFiles = async (files: File[]) => {
    if (files.length === 0) return;

    if (files.length > 1) {
      customMessage.warning(
        "原生拖放无法提供批量转换所需的文件路径，已加载第一个文件"
      );
    }

    await loadSingleFileObject(files[0]);
  };

  const convertSingleInternal = () => {
    singleError.value = "";
    singleWarnings.value = [];

    if (!singleInput.value.trim()) {
      singleOutput.value = "";
      return;
    }

    const result = convertConfig(
      singleInput.value,
      singleFrom.value,
      singleTo.value,
      singleOptions.value
    );

    if (result.success) {
      singleOutput.value = result.output;
      singleWarnings.value = result.warnings || [];
    } else {
      singleError.value = result.error || "转换失败";
      singleOutput.value = "";
    }
  };

  const convertSingle = useDebounceFn(convertSingleInternal, 300);

  // 监听单文件输入和格式变化
  watch([singleInput, singleFrom, singleTo, singleOptions], convertSingle, {
    deep: true,
  });

  // ==========================================
  // 批量模式逻辑
  // ==========================================

  /**
   * 选择输出目录
   */
  const selectOutputDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择输出目录",
      });
      if (selected) {
        outputDirectory.value = selected as string;
      }
    } catch (error: any) {
      errorHandler.error(error, "选择目录失败");
    }
  };

  /**
   * 递归解析 Rust 返回的目录树节点，收集所有文件
   */
  const collectFilesFromTree = (
    node: any,
    currentPath: string,
    files: { name: string; path: string; size: number }[] = []
  ) => {
    // 拼接当前节点的完整路径
    // 注意：Rust 返回的根节点 name 是目录名，子节点 name 是文件名/子目录名
    const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;

    if (!node.is_dir) {
      files.push({
        name: node.name,
        path: nodePath.replace(/\\/g, "/"), // 统一使用正斜杠
        size: node.size,
      });
    } else if (node.children) {
      for (const child of node.children) {
        // 递归时传递当前节点的路径
        collectFilesFromTree(
          child,
          currentPath ? `${currentPath}/${node.name}` : currentPath,
          files
        );
      }
    }
    return files;
  };

  /**
   * 添加文件或目录
   */
  const addFiles = async (paths: string[]) => {
    for (const p of paths) {
      try {
        const isDir = await invoke<boolean>("is_directory", { path: p });

        if (isDir) {
          // 调用 Rust 高性能并行目录树生成指令
          const result = await invoke<any>("generate_directory_tree", {
            path: p,
            showFiles: true,
            showHidden: scanOptions.value.showHidden,
            maxDepth: scanOptions.value.maxDepth,
            ignorePatterns: ["__USE_GITIGNORE__"],
          });

          if (result && result.structure) {
            // 获取父目录路径，用于拼接完整路径
            const parentDir = p.substring(
              0,
              p.lastIndexOf(result.structure.name)
            );
            const files = collectFilesFromTree(
              result.structure,
              parentDir.replace(/\\/g, "/")
            );

            for (const file of files) {
              addSingleFileToBatch(file.path, file.name, file.size);
            }
          }
        } else {
          // 单个文件
          const metadata = await invoke<any>("get_file_metadata", { path: p });
          const name = p.substring(
            Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")) + 1
          );
          addSingleFileToBatch(p, name, metadata.size);
        }
      } catch (error: any) {
        errorHandler.error(error, `添加路径失败: ${p}`);
      }
    }
  };

  /**
   * 辅助函数：添加单个文件到批量列表
   */
  const addSingleFileToBatch = (
    filePath: string,
    name: string,
    size: number
  ) => {
    // 避免重复添加
    if (batchItems.value.some((item) => item.path === filePath)) {
      return;
    }

    const detected = detectFormatByPath(filePath);

    // 过滤掉不支持的格式（如果是批量添加目录，只添加支持的配置文件）
    if (detected === "unknown") {
      return;
    }

    batchItems.value.push({
      id: filePath,
      name,
      path: filePath,
      size,
      sourceFormat: detected,
      targetFormat: batchTo.value,
      status: "pending",
    });
  };

  /**
   * 移除文件
   */
  const removeFile = (id: string) => {
    batchItems.value = batchItems.value.filter((item) => item.id !== id);
  };

  /**
   * 清空文件列表
   */
  const clearFiles = () => {
    batchItems.value = [];
  };

  /**
   * 执行批量转换
   */
  const convertBatch = async () => {
    if (batchItems.value.length === 0) {
      customMessage.warning("请先添加待转换的文件");
      return;
    }

    if (outputMode.value === "directory" && !outputDirectory.value) {
      customMessage.warning("请选择输出目录");
      return;
    }

    isConverting.value = true;

    try {
      for (const item of batchItems.value) {
        if (item.status === "success" && outputMode.value === "preview") {
          // 预览模式下，如果已经成功转换过，跳过
          continue;
        }

        item.status = "converting";

        try {
          // 1. 读取文件内容
          const content = await invoke<string>("read_text_file_force", {
            path: item.path,
          });

          // 2. 自动检测源格式（如果之前是未知）
          let fromFormat = item.sourceFormat;
          if (fromFormat === "unknown") {
            fromFormat = detectFormat(item.path, content);
            item.sourceFormat = fromFormat;
          }

          // 3. 执行转换
          const result = convertConfig(
            content,
            fromFormat,
            item.targetFormat,
            batchOptions.value
          );

          if (result.success) {
            item.convertedContent = result.output;
            item.warnings = result.warnings;
            item.error = undefined;

            // 4. 根据输出模式写入文件
            if (outputMode.value === "inplace") {
              // 原地生成：替换扩展名
              const dotIndex = item.path.lastIndexOf(".");
              const basePath =
                dotIndex !== -1 ? item.path.substring(0, dotIndex) : item.path;
              const targetPath = `${basePath}.${item.targetFormat}`;

              await invoke("write_text_file_force", {
                path: targetPath,
                content: result.output,
              });
            } else if (outputMode.value === "directory") {
              // 写入指定目录：保持文件名，替换扩展名
              const dotIndex = item.name.lastIndexOf(".");
              const baseName =
                dotIndex !== -1 ? item.name.substring(0, dotIndex) : item.name;
              const targetPath = `${outputDirectory.value}/${baseName}.${item.targetFormat}`;

              await invoke("write_text_file_force", {
                path: targetPath,
                content: result.output,
              });
            }

            item.status = "success";
          } else {
            item.status = "error";
            item.error = result.error || "转换失败";
          }
        } catch (err: any) {
          item.status = "error";
          item.error = err.message || String(err);
        }
      }

      customMessage.success("批量转换完成！");
    } catch (error: any) {
      errorHandler.error(error, "批量转换过程中发生错误");
    } finally {
      isConverting.value = false;
    }
  };

  // 监听批量目标格式变化，同步更新列表中的目标格式
  watch(batchTo, (newFormat) => {
    for (const item of batchItems.value) {
      item.targetFormat = newFormat;
      if (item.status === "success") {
        item.status = "pending"; // 重置状态以便重新转换
      }
    }
  });

  return {
    mode,
    // 单文件
    singleInput,
    singleOutput,
    singleFrom,
    singleTo,
    singleError,
    singleWarnings,
    singleOptions,
    convertSingle,
    handleSingleImport,
    handleSingleImportFiles,
    // 批量
    batchItems,
    batchTo,
    batchOptions,
    scanOptions,
    outputMode,
    outputDirectory,
    isConverting,
    selectOutputDirectory,
    addFiles,
    removeFile,
    clearFiles,
    convertBatch,
  };
}
