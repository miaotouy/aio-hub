// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0 (the "License");

import fs from "node:fs/promises";
import path from "node:path";
import { filePath } from "./filesystem";
import type { AssetManager, BackupAssetAccess, BackupAssetSource } from "./asset-manager";
import type { Recall } from "./recall";
import type { BackupExportResult, BackupBatchExportResult, BackupImportReport } from "../src/tools/recall/types/backup";

interface ActiveBackup { owner: number; exporting: boolean; cancelled: boolean; task?: Promise<unknown> }
interface ExportSnapshot { token: string; assetIds: string[] }
interface ImportPreparation { token: string; assets: { originalAssetId: string; path: string; name: string; mimeType: string }[]; legacyAssetIds: string[]; skipped?: BackupImportReport }

/** Host-owned orchestration: native sessions own snapshots; AssetManager owns every asset write. */
export class RecallBackup {
  private active?: ActiveBackup;
  private closing = false;
  constructor(
    private readonly recall: Pick<Recall, "run">,
    private readonly assets: Pick<AssetManager, "withBackupAssets">,
    private readonly appVersion: string,
    private readonly emit: (event: string, payload: unknown) => void = () => {},
  ) {}
  get hasPendingOperations() { return !!this.active; }
  private call<T>(command: string, args: Record<string, unknown> = {}) { return this.recall.run(command, args) as Promise<T>; }
  run(command: string, args: Record<string, unknown>, owner = 0): Promise<unknown> {
    if (this.closing) return Promise.reject(new Error("Recall backup is shutting down"));
    if (command === "recall_cancel_backup_operation") {
      if (this.active && this.active.owner !== owner) return Promise.reject(new Error("当前备份由另一个窗口发起，请在原窗口停止"));
      if (this.active?.exporting) this.active.cancelled = true;
      return Promise.resolve(null);
    }
    if (this.active) return Promise.reject(new Error("已有 Recall 备份操作正在运行，请等待完成"));
    const state: ActiveBackup = { owner, exporting: command !== "recall_import_backup", cancelled: false };
    this.active = state;
    state.task = Promise.resolve().then(async () => {
      switch (command) {
        case "recall_export_backup": return this.exportOne(args.recallId, filePath(args.targetDirectory, undefined, {}));
        case "recall_export_backups": return this.exportMany(args, state);
        case "recall_import_backup": return this.importOne(args);
        default: throw new Error("不支持的 Recall 备份操作");
      }
    }).finally(() => { if (this.active === state) this.active = undefined; });
    return state.task;
  }
  private async discard(kind: "export" | "import", token: string) {
    try { await this.call("_recall_backup_discard_" + kind, { token }); }
    catch (error) { console.warn("清理 Recall 备份会话失败", error); }
  }
  private async exportOne(recallId: unknown, targetDirectory: string): Promise<BackupExportResult> {
    const snapshot = await this.call<ExportSnapshot>("_recall_backup_prepare_export", { recallId });
    try {
      return await this.assets.withBackupAssets(async (assets) => {
        const sources: Record<string, BackupAssetSource> = Object.create(null);
        for (const id of snapshot.assetIds) sources[id] = await assets.describe(id);
        return this.call<BackupExportResult>("_recall_backup_export", { token: snapshot.token, targetDirectory, appVersion: this.appVersion, assets: sources });
      });
    } finally { await this.discard("export", snapshot.token); }
  }
  private async exportMany(args: Record<string, unknown>, state: ActiveBackup): Promise<BackupBatchExportResult> {
    const targetDirectory = filePath(args.targetDirectory, undefined, {});
    if (!(await fs.stat(targetDirectory)).isDirectory()) throw new Error("导出目标需为目录");
    if (!Array.isArray(args.recallIds) || !args.recallIds.every((id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new Error("思绪集 ID 列表无效");
    const ids = args.recallIds.length ? [...new Set(args.recallIds as string[])] : (await this.call<{ id: string }[]>("recall_list_bases")).map((meta) => meta.id);
    const staging = await fs.mkdtemp(path.join(targetDirectory, ".aio-recall-export."));
    const canonical = await fs.realpath(staging);
    const exportedAt = new Date().toISOString();
    const succeeded: BackupExportResult[] = [], failed: { libraryId: string; error: string }[] = [];
    const progress = (current: number, libraryId: string) => this.emit("recall-backup-progress", { operation: "export", current, total: ids.length, failed: failed.length, libraryId });
    let cancelled = false;
    try {
      for (const [index, id] of ids.entries()) {
        if (state.cancelled) { cancelled = true; break; }
        progress(index, id);
        try { succeeded.push(await this.exportOne(id, staging)); }
        catch (error) { failed.push({ libraryId: id, error: String(error) }); }
        progress(index + 1, id);
      }
      return await this.call<BackupBatchExportResult>("_recall_backup_finish_batch", { targetDirectory, exportedAt, succeeded, failed, cancelled, appVersion: this.appVersion });
    } finally {
      try {
        const info = await fs.lstat(staging);
        if (info.isSymbolicLink() || await fs.realpath(staging) !== canonical) throw new Error("备份暂存目录被替换，已保留该路径");
        await fs.rm(staging, { recursive: true, force: true });
      } catch (error) { console.warn("清理 Recall 备份暂存失败", error); }
    }
  }
  private async importOne(args: Record<string, unknown>): Promise<BackupImportReport> {
    const prepared = await this.call<ImportPreparation>("_recall_backup_prepare_import", args);
    if (prepared.skipped) return prepared.skipped;
    try {
      return await this.assets.withBackupAssets(async (assets: BackupAssetAccess) => {
        const mapping: Record<string, { id: string; name: string; mimeType: string }> = Object.create(null);
        for (const input of prepared.assets) {
          const asset = await assets.restore(input, String(args.sourcePath));
          mapping[input.originalAssetId] = { id: asset.id, name: asset.name, mimeType: asset.mimeType };
        }
        for (const id of prepared.legacyAssetIds) {
          const asset = await assets.existing(id);
          if (asset) mapping[id] = { id: asset.id, name: asset.name, mimeType: asset.mimeType };
        }
        return this.call<BackupImportReport>("_recall_backup_commit_import", { token: prepared.token, assetMap: mapping });
      });
    } finally { await this.discard("import", prepared.token); }
  }
  async shutdown() { this.closing = true; if (this.active?.task) await this.active.task.catch(() => {}); }
}
