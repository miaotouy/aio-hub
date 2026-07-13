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

import type { Point } from "../types";

/**
 * 将屏幕/视口坐标转换为文档/画布坐标
 */
export function screenToDoc(
  screenPoint: Point,
  stagePos: Point,
  scale: number
): Point {
  return {
    x: (screenPoint.x - stagePos.x) / scale,
    y: (screenPoint.y - stagePos.y) / scale,
  };
}

/**
 * 将文档/画布坐标转换为屏幕/视口坐标
 */
export function docToScreen(
  docPoint: Point,
  stagePos: Point,
  scale: number
): Point {
  return {
    x: docPoint.x * scale + stagePos.x,
    y: docPoint.y * scale + stagePos.y,
  };
}
