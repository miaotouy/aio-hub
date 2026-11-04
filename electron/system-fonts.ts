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

import { isTrustedDocument } from "./security";
export function allowLocalFonts(
  permission: string,
  owned: boolean,
  mainFrame: boolean,
  requestingUrl: string | undefined,
  ownerUrl: string,
  devOrigin?: string
): boolean {
  return (
    permission === "local-fonts" &&
    owned &&
    mainFrame &&
    isTrustedDocument(requestingUrl ?? "", devOrigin) &&
    isTrustedDocument(ownerUrl, devOrigin)
  );
}
export function normalizeFontFamilies(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((family) => typeof family !== "string")
  )
    throw new Error("读取系统字体失败，请重新打开字体列表");
  return [
    ...new Set(
      value.filter((family: string) => family && !family.startsWith("."))
    ),
  ].sort();
}
export const FONT_FAMILIES_SCRIPT =
  "window.queryLocalFonts().then(fonts => fonts.map(font => font.family))";
