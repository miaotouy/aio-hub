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

import { ElMessageBox } from "element-plus";
import { invoke } from "@tauri-apps/api/core";
import { useGitContextMenu } from "./useGitContextMenu";
import { errorHandler } from "./useGitCommitterErrorHandler";
import { buildFileContextMenuItems } from "../contextMenus";
import { copyTextToClipboard, getFileName, joinRepoPath } from "../utils";
import { currentRepoPath } from "./useGitCommitterState";
import {
  openDiffTab,
  openFileTab,
  stageFile,
  unstageFile,
  discardFile,
} from "./useGitCommitterRunner";

/**
 * 更改列表文件行的右键菜单（Sidebar 文件列表与 ChangesDiffView 共用）。
 * 动作自包含：暂存/取消暂存/放弃/复制路径/资源管理器定位/打开视图。
 */
export function useGitFileContextMenu() {
  const contextMenu = useGitContextMenu();

  const showFileMenu = (
    file: { path: string; status: string },
    isStaged: boolean,
    event: MouseEvent
  ) => {
    contextMenu.show(event, buildFileContextMenuItems(file, isStaged), {
      dispatch: (itemId) => handleFileMenuAction(itemId, file, isStaged),
    });
  };

  const revealFile = async (relativePath: string) => {
    await errorHandler.wrapAsync(
      () =>
        invoke<void>("open_file_directory", {
          filePath: joinRepoPath(currentRepoPath.value, relativePath),
        }),
      { userMessage: "无法在资源管理器中显示该文件" }
    );
  };

  const discardWithConfirm = async (file: { path: string; status: string }) => {
    const isUntracked = file.status === "A";
    const title = isUntracked ? "删除文件" : "放弃更改";
    const message = isUntracked
      ? `确定要删除「${getFileName(file.path)}」吗？文件将被移至系统回收站。`
      : `确定要放弃「${getFileName(file.path)}」的更改吗？此操作不可撤销。`;
    const confirmButtonText = isUntracked ? "移入回收站" : "放弃更改";

    try {
      await ElMessageBox.confirm(message, title, {
        confirmButtonText,
        cancelButtonText: "取消",
        type: "warning",
        confirmButtonClass: "el-button--danger",
        lockScroll: false,
      });
    } catch {
      return; // 用户取消
    }
    await discardFile(currentRepoPath.value, file.path);
  };

  const handleFileMenuAction = async (
    itemId: string,
    file: { path: string; status: string },
    isStaged: boolean
  ) => {
    switch (itemId) {
      case "file:open-diff":
        openDiffTab(file.path, isStaged);
        break;
      case "file:open-file":
        openFileTab(file.path);
        break;
      case "file:copy-path":
        await copyTextToClipboard(
          joinRepoPath(currentRepoPath.value, file.path),
          "已复制完整路径"
        );
        break;
      case "file:copy-relative":
        await copyTextToClipboard(file.path, "已复制相对路径");
        break;
      case "file:reveal":
        await revealFile(file.path);
        break;
      case "file:stage":
        await stageFile(currentRepoPath.value, file.path);
        break;
      case "file:unstage":
        await unstageFile(currentRepoPath.value, file.path);
        break;
      case "file:discard":
        await discardWithConfirm(file);
        break;
    }
  };

  return { showFileMenu };
}
