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

export interface BackupWarning {
  code: string;
  message: string;
  assetId?: string | null;
}

export interface BackupInspectResult {
  sourcePath: string;
  sourceEntry?: string | null;
  format: string;
  formatVersion: number;
  libraryId: string;
  libraryName: string;
  entryCount: number;
  assetCount: number;
  hasConflict: boolean;
  conflictingLibraryName: string | null;
  conflictingEntryCount: number | null;
  legacyContentOnly: boolean;
  warnings: BackupWarning[];
}

export interface BackupInspectItem {
  sourceEntry?: string | null;
  libraryName: string;
  inspect?: BackupInspectResult | null;
  error?: string | null;
}

export interface BackupImportReport {
  sourcePath: string;
  status: "success" | "skipped";
  libraryId?: string | null;
  libraryName: string;
  entryCount: number;
  restoredAssetCount: number;
  missingAssetCount: number;
  replacedExisting: boolean;
  importedAsCopy: boolean;
  legacyContentOnly: boolean;
  vectorsNeedRebuild: boolean;
  warnings: BackupWarning[];
}

export interface BackupExportResult {
  libraryId: string;
  libraryName: string;
  outputPath: string;
  entryCount: number;
  assetCount: number;
  warnings: BackupWarning[];
}

export interface BackupExportFailure {
  libraryId: string;
  error: string;
}

export interface BackupBatchExportResult {
  exportedAt: string;
  targetDirectory: string;
  outputPath: string;
  succeeded: BackupExportResult[];
  failed: BackupExportFailure[];
  cancelled: boolean;
}

export interface BackupOperationItem {
  key: string;
  name: string;
  status: "success" | "failed" | "skipped";
  detail: string;
  warnings: BackupWarning[];
}

export interface BackupProgressEvent {
  operation: "export";
  current: number;
  total: number;
  failed: number;
  libraryId: string;
}
