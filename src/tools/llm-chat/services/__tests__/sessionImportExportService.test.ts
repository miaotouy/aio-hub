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
import type { ExportableChatSession } from "../sessionImportExportService";
import {
  SINGLE_SESSION_BACKUP_FORMAT,
  SINGLE_SESSION_BACKUP_VERSION,
  exportSessionAsBackupJson,
  exportSessionsAsZip,
  parseImportFile,
  resolveConflicts,
} from "../sessionImportExportService";

const encoder = new TextEncoder();

const session: ExportableChatSession = {
  index: {
    id: "session-a",
    name: "导入测试",
    displayAgentId: "agent-a",
    messageCount: 1,
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T01:00:00.000Z",
    isFavorite: true,
    favoriteFolderId: "folder-a",
  },
  detail: {
    id: "session-a",
    updatedAt: "2026-08-21T01:00:00.000Z",
    nodes: {
      root: {
        id: "root",
        parentId: null,
        childrenIds: ["user-a"],
        content: "",
        role: "system",
        status: "complete",
      },
      "user-a": {
        id: "user-a",
        parentId: "root",
        childrenIds: [],
        content: "你好",
        role: "user",
        status: "complete",
      },
    },
    rootNodeId: "root",
    activeLeafId: "user-a",
    history: [],
    historyIndex: -1,
    agentUsage: { "agent-a": 1 },
  },
};

describe("sessionImportExportService", () => {
  it("round-trips a versioned single-session backup with the complete tree", async () => {
    const content = exportSessionAsBackupJson(session, { exportedBy: "test" });
    const backup = JSON.parse(content);
    expect(backup).toMatchObject({
      format: SINGLE_SESSION_BACKUP_FORMAT,
      version: SINGLE_SESSION_BACKUP_VERSION,
      exportedBy: "test",
    });

    const parsed = await parseImportFile(encoder.encode(content));

    expect(parsed.metadata).toBeNull();
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0]).toMatchObject({
      index: {
        id: "session-a",
        name: "导入测试",
        favoriteFolderId: "folder-a",
      },
      detail: {
        id: "session-a",
        rootNodeId: "root",
        activeLeafId: "user-a",
      },
    });
    expect(parsed.sessions[0].detail.nodes).toEqual(session.detail.nodes);
  });

  it("imports the existing Raw JSON shape", async () => {
    const parsed = await parseImportFile(
      encoder.encode(
        JSON.stringify({ index: session.index, detail: session.detail })
      )
    );

    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].index.id).toBe("session-a");
    expect(parsed.sessions[0].detail.activeLeafId).toBe("user-a");
  });

  it("continues to import ZIP backups", async () => {
    const archive = await exportSessionsAsZip([session]);
    const parsed = await parseImportFile(archive);

    expect(parsed.metadata).toMatchObject({
      format: "aiohub-chat-session-backup",
      sessionCount: 1,
    });
    expect(parsed.sessions[0].detail.nodes).toEqual(session.detail.nodes);
  });

  it.each([
    [
      "missing nodes",
      { index: session.index, detail: { ...session.detail, nodes: undefined } },
    ],
    [
      "missing root node",
      {
        index: session.index,
        detail: { ...session.detail, rootNodeId: "missing" },
      },
    ],
    [
      "missing active leaf node",
      {
        index: session.index,
        detail: { ...session.detail, activeLeafId: "missing" },
      },
    ],
    [
      "branch-only Raw JSON",
      {
        index: session.index,
        detail: {
          ...session.detail,
          nodes: { "user-a": session.detail.nodes["user-a"] },
        },
      },
    ],
  ])("rejects %s", async (_label, invalid) => {
    await expect(
      parseImportFile(encoder.encode(JSON.stringify(invalid)))
    ).rejects.toThrow("完整会话");
  });

  it("rejects unsupported files with a clear error", async () => {
    await expect(
      parseImportFile(encoder.encode("not a backup"))
    ).rejects.toThrow("不是受支持的 ZIP 备份或 JSON 会话");
  });

  it("reports every conflict strategy", () => {
    const existing = new Set(["session-a"]);

    const kept = resolveConflicts([session], "keep", existing);
    expect(kept).toMatchObject({ importedCount: 1, renamedCount: 1 });
    expect(kept.sessions[0].index.id).not.toBe("session-a");

    expect(resolveConflicts([session], "skip", existing)).toMatchObject({
      importedCount: 0,
      skippedCount: 1,
    });
    expect(resolveConflicts([session], "overwrite", existing)).toMatchObject({
      importedCount: 1,
      overwrittenCount: 1,
    });
  });
});
