// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { ElMessageBox } from "element-plus";
import { invoke } from "@tauri-apps/api/core";
import { customMessage } from "@/utils/customMessage";
import type { RepositoryConfig } from "../types";
import { removeRepository } from "./useGitCommitterState";

/** Shared repository actions used by the rail and panorama cards. */
export function useGitRepositoryManagement() {
  const editAlias = async (repo: RepositoryConfig): Promise<void> => {
    try {
      const { value } = await ElMessageBox.prompt(
        "请输入仓库别名",
        "修改别名",
        {
          confirmButtonText: "保存",
          cancelButtonText: "取消",
          inputValue: repo.alias || "",
          lockScroll: false,
        }
      );
      repo.alias = value?.trim() || "";
    } catch {
      // Cancelled by the user.
    }
  };

  const openDirectory = async (repo: RepositoryConfig): Promise<void> => {
    try {
      await invoke("open_file_directory", { path: repo.path });
    } catch {
      customMessage.error("无法打开仓库目录");
    }
  };

  const remove = async (repo: RepositoryConfig): Promise<void> => {
    try {
      await ElMessageBox.confirm(
        `确定要从列表中移除“${repo.alias || repo.name}”吗？不会删除本地文件。`,
        "移除仓库",
        {
          confirmButtonText: "移除",
          cancelButtonText: "取消",
          type: "warning",
          lockScroll: false,
        }
      );
      removeRepository(repo.path);
    } catch {
      // Cancelled by the user.
    }
  };

  return { editAlias, openDirectory, remove };
}
