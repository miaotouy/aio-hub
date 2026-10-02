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
 * Git Committer 右键菜单项构建器（纯函数，不含动作）
 *
 * 动作由各区域组件按 item.id 分发执行；构建器只负责按上下文
 * 产出菜单结构（项集合、禁用态、danger 标记、分隔线）。
 */

import type { Component } from "vue";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  ExternalLink,
  FileDiff,
  FileText,
  FolderGit2,
  FolderOpen,
  GitCommitHorizontal,
  MessageSquareText,
  Minus,
  Pencil,
  Palette,
  Plus,
  RefreshCw,
  Trash2,
  Undo2,
  X,
} from "lucide-vue-next";
import type { DiffTabRef, RepositoryConfig } from "./types";
import {
  CHANGES_VIEW_TAB_PATH,
  COMMIT_VIEW_TAB_PATH,
  REPO_PROMPT_TAB_PATH,
} from "./utils";

/** 单个右键菜单项；separator 为 true 时该项渲染为分隔线 */
export interface GitContextMenuItem {
  id: string;
  label: string;
  icon?: Component;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

const sep = (): GitContextMenuItem => ({
  id: "sep",
  label: "",
  separator: true,
});

// ===== 仓库列表 =====

export function buildRepoContextMenuItems(
  _repo: RepositoryConfig,
  ctx: { isCurrent: boolean }
): GitContextMenuItem[] {
  return [
    {
      id: "repo:open",
      label: "打开仓库",
      icon: FolderGit2,
      disabled: ctx.isCurrent,
    },
    { id: "repo:reveal", label: "在资源管理器中显示", icon: FolderOpen },
    { id: "repo:refresh", label: "刷新状态", icon: RefreshCw },
    { id: "repo:pull", label: "拉取 (Pull)", icon: ArrowDown },
    { id: "repo:push", label: "推送 (Push)", icon: ArrowUp },
    sep(),
    { id: "repo:alias", label: "修改别名", icon: Pencil },
    { id: "repo:color", label: "修改颜色", icon: Palette },
    { id: "repo:prompt", label: "设置 AI 提示词", icon: MessageSquareText },
    sep(),
    { id: "repo:remove", label: "移出列表", icon: Trash2, danger: true },
  ];
}

// ===== 文件标签页 =====

export interface TabMenuContext {
  /** 当前打开的 Tab 总数（用于禁用「关闭其他」） */
  openCount: number;
  /** 该 Tab 右侧的 Tab 数量（用于禁用「关闭右侧」） */
  tabsAfter: number;
}

export function buildTabContextMenuItems(
  tab: DiffTabRef,
  ctx: TabMenuContext
): GitContextMenuItem[] {
  const closeGroup: GitContextMenuItem[] = [
    { id: "tab:close", label: "关闭", icon: X },
    {
      id: "tab:close-others",
      label: "关闭其他标签页",
      icon: X,
      disabled: ctx.openCount <= 1,
    },
    {
      id: "tab:close-right",
      label: "关闭右侧标签页",
      icon: X,
      disabled: ctx.tabsAfter === 0,
    },
    { id: "tab:close-all", label: "关闭所有标签页", icon: X },
  ];

  // 提交总览 / 更改总览 / AI 提示词：只有关闭组与（提交总览的）复制哈希
  if (!isFileTab(tab)) {
    const items = [...closeGroup];
    if (tab.commitHash) {
      items.push(sep(), {
        id: "tab:copy-hash",
        label: "复制提交哈希",
        icon: Copy,
      });
    }
    return items;
  }

  const items: GitContextMenuItem[] = [...closeGroup, sep()];
  if (tab.viewMode === "file") {
    items.push({
      id: "tab:open-diff",
      label: "查看差异",
      icon: FileDiff,
    });
  } else {
    items.push({
      id: "tab:open-file",
      label: "查看文件当前内容",
      icon: FileText,
    });
  }
  if (!tab.commitHash) {
    items.push(
      tab.isStaged
        ? { id: "tab:unstage", label: "取消暂存", icon: Minus }
        : { id: "tab:stage", label: "暂存文件", icon: Plus }
    );
  }
  items.push(
    sep(),
    { id: "tab:copy-path", label: "复制完整路径", icon: Copy },
    { id: "tab:copy-relative", label: "复制相对路径", icon: FolderGit2 },
    { id: "tab:reveal", label: "在资源管理器中显示", icon: FolderOpen }
  );
  if (tab.commitHash) {
    items.push({ id: "tab:copy-hash", label: "复制提交哈希", icon: Copy });
  }
  return items;
}

/** 是否为实际对应某个文件路径的标签页（区别于总览/提示词虚拟 Tab） */
function isFileTab(tab: DiffTabRef): boolean {
  if (tab.path === REPO_PROMPT_TAB_PATH) return false;
  if (tab.path === COMMIT_VIEW_TAB_PATH) return false;
  if (tab.path === CHANGES_VIEW_TAB_PATH) return false;
  return true;
}

// ===== 更改列表文件 =====

export function buildFileContextMenuItems(
  file: { path: string; status: string },
  isStaged: boolean
): GitContextMenuItem[] {
  const deleted = file.status === "D";
  const items: GitContextMenuItem[] = [
    { id: "file:open-diff", label: "打开差异", icon: FileDiff },
    {
      id: "file:open-file",
      label: "查看文件当前内容",
      icon: Eye,
      disabled: deleted,
    },
    sep(),
    { id: "file:copy-path", label: "复制完整路径", icon: Copy },
    { id: "file:copy-relative", label: "复制相对路径", icon: FolderGit2 },
    {
      id: "file:reveal",
      label: "在资源管理器中显示",
      icon: FolderOpen,
      disabled: deleted,
    },
  ];
  if (isStaged) {
    items.push(sep(), { id: "file:unstage", label: "取消暂存", icon: Minus });
  } else {
    const isUntracked = file.status === "A";
    items.push(
      sep(),
      { id: "file:stage", label: "暂存文件", icon: Plus },
      {
        id: "file:discard",
        label: isUntracked ? "删除文件" : "放弃更改",
        icon: isUntracked ? Trash2 : Undo2,
        danger: true,
      }
    );
  }
  return items;
}

// ===== 提交历史 =====

export function buildCommitContextMenuItems(ctx: {
  isExpanded: boolean;
}): GitContextMenuItem[] {
  return [
    { id: "commit:open-changes", label: "打开更改总览", icon: FileDiff },
    {
      id: "commit:toggle-expand",
      label: ctx.isExpanded ? "收起变更文件" : "展开变更文件",
      icon: GitCommitHorizontal,
    },
    sep(),
    { id: "commit:copy-hash", label: "复制提交哈希", icon: Copy },
    { id: "commit:copy-message", label: "复制提交信息", icon: Copy },
    { id: "commit:open-remote", label: "在远端打开", icon: ExternalLink },
  ];
}

export function buildCommitFileContextMenuItems(): GitContextMenuItem[] {
  return [
    { id: "commit-file:open-diff", label: "打开文件差异", icon: FileDiff },
    { id: "commit-file:copy-path", label: "复制完整路径", icon: Copy },
    {
      id: "commit-file:copy-relative",
      label: "复制相对路径",
      icon: FolderGit2,
    },
  ];
}
