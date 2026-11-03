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

/** Browser clipboard access retains permission errors and user-activation semantics. */
export function getBrowserClipboard(): Clipboard {
  return navigator.clipboard;
}

/** Keep popup handles available to callers such as the PDF print view. */
export function openBrowserWindow(
  ...args: Parameters<Window["open"]>
): Window | null {
  return window.open(...args);
}
