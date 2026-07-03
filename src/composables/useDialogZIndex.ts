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

let _counter = 1800; // 避让element-ui等库的默认z-index范围（1000-2000），留出足够空间

export function acquireZIndex(): number {
  return ++_counter;
}

export function releaseZIndex(z: number): void {
  if (z === _counter) _counter--;
}
