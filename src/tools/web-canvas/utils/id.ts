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

import { nanoid } from "nanoid";
import { format } from "date-fns";

/**
 * 生成符合新规范的画布项目 ID
 * 格式: cp_{yyyyMMdd}_{short_id}
 */
export function generateCanvasId(): string {
  const dateStr = format(new Date(), "yyyyMMdd");
  const shortId = nanoid(6);
  return `cp_${dateStr}_${shortId}`;
}

/**
 * 判断是否为有效的画布项目 ID
 */
export function isValidCanvasId(id: string): boolean {
  return /^cp_\d{8}_[A-Za-z0-9_-]{6}$/.test(id);
}
