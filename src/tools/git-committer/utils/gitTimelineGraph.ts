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
import type { GitCommitSummary } from "../types";

/**
 * 经典 VSCode / Git Graph 风格分支泳道调色板
 */
export const GIT_GRAPH_COLORS: readonly string[] = [
  "#f97316", // 橙色 (主干优先)
  "#ec4899", // 粉红 / 洋红
  "#14b8a6", // 青绿
  "#3b82f6", // 蓝色
  "#a855f7", // 紫色
  "#eab308", // 黄色
  "#06b6d4", // 天蓝
  "#10b981", // 翠绿
];

export interface GraphConnection {
  fromLane: number;
  toLane: number;
  color: string;
}

export interface CommitGraphItem {
  hash: string;
  lane: number;
  color: string;
  isMerge: boolean;
  hasIncoming: boolean;
  passThroughLanes: { lane: number; color: string }[];
  outgoingConnections: GraphConnection[];
  /** 当前行实际涉及的泳道数（用于像 VSCode 一样按需紧凑缩进） */
  rowLanes: number;
}

export interface TimelineGraphResult {
  items: Map<string, CommitGraphItem>;
  maxLanes: number;
}

/**
 * 获取泳道对应的颜色
 */
export function getLaneColor(lane: number): string {
  return GIT_GRAPH_COLORS[lane % GIT_GRAPH_COLORS.length];
}

/**
 * 计算线性提交列表的 Git 时间线拓扑与分支泳道布局
 *
 * @param commits 按时间倒序（最新在上，最旧在下）的提交摘要数组
 * @returns 包含每个 commit 的图谱元数据及最大泳道数的映射对象
 */
export function computeTimelineGraph(
  commits: GitCommitSummary[]
): TimelineGraphResult {
  const items = new Map<string, CommitGraphItem>();
  if (!commits || commits.length === 0) {
    return { items, maxLanes: 1 };
  }

  // 活跃泳道数组：第 index 个槽代表第 index 个泳道正在等待的 commit hash
  // 为 null 表示当前槽空闲，可复用
  const activeLanes: (string | null)[] = [];
  let maxLanesObserved = 1;

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const isMerge = Boolean(commit.parents && commit.parents.length > 1);

    // 1. 查找当前 commit 是否被已有泳道追踪
    let commitLane = activeLanes.indexOf(commit.hash);
    let hasIncoming = false;

    if (commitLane !== -1) {
      // 已经被上方某个泳道追踪
      hasIncoming = true;
      activeLanes[commitLane] = null;
    } else {
      // 未被追踪（如 HEAD 或孤立提交）：寻找第一个空槽，若无则分配在末尾
      const emptySlot = activeLanes.indexOf(null);
      if (emptySlot !== -1) {
        commitLane = emptySlot;
      } else {
        commitLane = activeLanes.length;
      }
      hasIncoming = false;
    }

    // 检查是否有其他泳道也追踪到了当前 commit（多分支合流到本节点）
    for (let l = 0; l < activeLanes.length; l++) {
      if (l !== commitLane && activeLanes[l] === commit.hash) {
        activeLanes[l] = null;
      }
    }

    // 2. 收集当前行需要垂直穿过的其他活跃泳道（在当前 commit 之前已存在，且在之后仍需继续向下）
    const passThroughLanes: { lane: number; color: string }[] = [];
    for (let l = 0; l < activeLanes.length; l++) {
      if (l !== commitLane && activeLanes[l] !== null) {
        passThroughLanes.push({
          lane: l,
          color: getLaneColor(l),
        });
      }
    }

    // 3. 处理父提交向下延伸的出线
    const outgoingConnections: GraphConnection[] = [];
    const parents = commit.parents || [];

    if (parents.length > 0) {
      // 3.1 主父提交 parents[0]
      const parent0 = parents[0];
      const existingParent0Lane = activeLanes.indexOf(parent0);

      if (existingParent0Lane === -1) {
        // 主父提交继续保持在当前泳道向下
        activeLanes[commitLane] = parent0;
        outgoingConnections.push({
          fromLane: commitLane,
          toLane: commitLane,
          color: getLaneColor(commitLane),
        });
      } else {
        // 主父提交已经在另一个泳道被追踪（合流）
        outgoingConnections.push({
          fromLane: commitLane,
          toLane: existingParent0Lane,
          color: getLaneColor(Math.max(commitLane, existingParent0Lane)),
        });
        activeLanes[commitLane] = null;
      }

      // 3.2 次父提交 parents[1..]（合并提交引入的分支）
      for (let p = 1; p < parents.length; p++) {
        const parentK = parents[p];
        const existingLane = activeLanes.indexOf(parentK);

        if (existingLane !== -1) {
          // 已经在某个泳道中被追踪
          outgoingConnections.push({
            fromLane: commitLane,
            toLane: existingLane,
            color: getLaneColor(existingLane),
          });
        } else {
          // 分配新的泳道（找空槽或追加末尾）
          const slot = activeLanes.indexOf(null);
          const newLane = slot !== -1 ? slot : activeLanes.length;
          activeLanes[newLane] = parentK;
          outgoingConnections.push({
            fromLane: commitLane,
            toLane: newLane,
            color: getLaneColor(newLane),
          });
        }
      }
    } else {
      // 无父提交（根提交），当前泳道在此终结
      activeLanes[commitLane] = null;
    }

    // 4. 清理末尾连续的 null，压缩活跃泳道数量
    while (
      activeLanes.length > 0 &&
      activeLanes[activeLanes.length - 1] === null
    ) {
      activeLanes.pop();
    }

    // 统计当前行实际涉及的泳道数
    let currentRowLanes = commitLane + 1;
    for (const pt of passThroughLanes) {
      if (pt.lane + 1 > currentRowLanes) currentRowLanes = pt.lane + 1;
    }
    for (const out of outgoingConnections) {
      if (out.fromLane + 1 > currentRowLanes)
        currentRowLanes = out.fromLane + 1;
      if (out.toLane + 1 > currentRowLanes) currentRowLanes = out.toLane + 1;
    }
    if (currentRowLanes > maxLanesObserved) {
      maxLanesObserved = currentRowLanes;
    }

    items.set(commit.hash, {
      hash: commit.hash,
      lane: commitLane,
      color: getLaneColor(commitLane),
      isMerge,
      hasIncoming,
      passThroughLanes,
      outgoingConnections,
      rowLanes: currentRowLanes,
    });
  }

  return {
    items,
    maxLanes: Math.max(1, maxLanesObserved),
  };
}
