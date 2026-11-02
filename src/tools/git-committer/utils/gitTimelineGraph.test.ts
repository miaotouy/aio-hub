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
import { describe, expect, it } from "vitest";

import { computeTimelineGraph, GIT_GRAPH_COLORS } from "./gitTimelineGraph";
import type { GitCommitSummary } from "../types";

const makeCommit = (
  hash: string,
  parents: string[] = []
): GitCommitSummary => ({
  hash,
  author: "Alice",
  email: "alice@example.com",
  date: "2026-03-30T10:00:00Z",
  message: `Commit ${hash}`,
  parents,
});

describe("gitTimelineGraph", () => {
  it("handles empty commits gracefully", () => {
    const res = computeTimelineGraph([]);
    expect(res.items.size).toBe(0);
    expect(res.maxLanes).toBe(1);
  });

  it("assigns single linear commits to lane 0", () => {
    // 3 -> 2 -> 1
    const commits = [
      makeCommit("c3", ["c2"]),
      makeCommit("c2", ["c1"]),
      makeCommit("c1", []),
    ];
    const { items, maxLanes } = computeTimelineGraph(commits);

    expect(maxLanes).toBe(1);

    const item3 = items.get("c3")!;
    expect(item3.lane).toBe(0);
    expect(item3.color).toBe(GIT_GRAPH_COLORS[0]);
    expect(item3.isMerge).toBe(false);
    expect(item3.hasIncoming).toBe(false);
    expect(item3.rowLanes).toBe(1);
    expect(item3.outgoingConnections).toEqual([
      { fromLane: 0, toLane: 0, color: GIT_GRAPH_COLORS[0] },
    ]);

    const item2 = items.get("c2")!;
    expect(item2.lane).toBe(0);
    expect(item2.hasIncoming).toBe(true);
    expect(item2.rowLanes).toBe(1);
    expect(item2.outgoingConnections).toEqual([
      { fromLane: 0, toLane: 0, color: GIT_GRAPH_COLORS[0] },
    ]);

    const item1 = items.get("c1")!;
    expect(item1.lane).toBe(0);
    expect(item1.hasIncoming).toBe(true);
    expect(item1.rowLanes).toBe(1);
    expect(item1.outgoingConnections).toEqual([]); // root commit
  });

  it("handles merge commits and branch splitting", () => {
    // c_merge (parents: c_main, c_feat)
    // c_main (parents: c_base)
    // c_feat (parents: c_base)
    // c_base (parents: [])
    const commits = [
      makeCommit("c_merge", ["c_main", "c_feat"]),
      makeCommit("c_main", ["c_base"]),
      makeCommit("c_feat", ["c_base"]),
      makeCommit("c_base", []),
    ];

    const { items, maxLanes } = computeTimelineGraph(commits);
    expect(maxLanes).toBeGreaterThanOrEqual(2);

    const mergeNode = items.get("c_merge")!;
    expect(mergeNode.lane).toBe(0);
    expect(mergeNode.isMerge).toBe(true);
    expect(mergeNode.rowLanes).toBe(2);
    // 两个出线连接：一个到 lane 0 (c_main)，一个到 lane 1 (c_feat)
    expect(mergeNode.outgoingConnections).toHaveLength(2);
    expect(mergeNode.outgoingConnections[0]).toEqual({
      fromLane: 0,
      toLane: 0,
      color: GIT_GRAPH_COLORS[0],
    });
    expect(mergeNode.outgoingConnections[1]).toEqual({
      fromLane: 0,
      toLane: 1,
      color: GIT_GRAPH_COLORS[1],
    });

    const mainNode = items.get("c_main")!;
    expect(mainNode.lane).toBe(0);
    // 在 c_main 这一行，lane 1 正在等待 c_feat，因此它是穿透线
    expect(mainNode.passThroughLanes).toEqual([
      { lane: 1, color: GIT_GRAPH_COLORS[1] },
    ]);

    const featNode = items.get("c_feat")!;
    expect(featNode.lane).toBe(1);
    // c_feat 的父是 c_base，但 c_base 已经被 c_main 挂在 lane 0 等待了
    // 因此 c_feat 的出线会合流弯向 lane 0
    expect(featNode.outgoingConnections).toHaveLength(1);
    expect(featNode.outgoingConnections[0].fromLane).toBe(1);
    expect(featNode.outgoingConnections[0].toLane).toBe(0);
  });
});
