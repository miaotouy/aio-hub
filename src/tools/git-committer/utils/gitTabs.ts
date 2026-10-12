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

import type { DiffTabRef, RepoSession } from "../types";
import { buildTabKey } from "../utils";

export interface OpenTabOptions {
  preview?: boolean;
}

/** Alt 单击临时使用预览，其余单击遵循设置。 */
export function shouldPreviewFile(
  singleClickOpensPermanentTab: boolean,
  event?: Pick<MouseEvent, "altKey">
): boolean {
  return event?.altKey === true || !singleClickOpensPermanentTab;
}

/** 同一会话只有一个预览位；固定标签再次预览时保持固定。 */
export function openSessionTab(
  session: RepoSession,
  tab: DiffTabRef,
  { preview = false }: OpenTabOptions = {}
): void {
  const key = buildTabKey(tab);
  const existing = session.openTabs.find((item) => buildTabKey(item) === key);
  if (existing) {
    if (!preview) delete existing.isPreview;
  } else {
    const nextTab: DiffTabRef = { ...tab };
    if (preview) {
      nextTab.isPreview = true;
      const previewIndex = session.openTabs.findIndex((item) => item.isPreview);
      if (previewIndex >= 0) {
        session.openTabs.splice(previewIndex, 1, nextTab);
      } else {
        session.openTabs.push(nextTab);
      }
    } else {
      delete nextTab.isPreview;
      session.openTabs.push(nextTab);
    }
  }
  session.activeTabPath = key;
}

/** 固定会话中实际打开的标签，保持原有顺序与激活项。 */
export function keepSessionTab(session: RepoSession, tab: DiffTabRef): void {
  const key = buildTabKey(tab);
  const existing = session.openTabs.find((item) => buildTabKey(item) === key);
  if (existing) delete existing.isPreview;
}
