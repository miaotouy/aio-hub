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

/** Validate the exit status after a child process has finished. */
export function assertProcessSucceeded(
  child: { exitCode: number | null; signalCode: string | null },
  label: string
): void {
  if (child.signalCode)
    throw new Error(label + " 因信号 " + child.signalCode + " 中止");
  if (child.exitCode === null) throw new Error(label + " 退出状态不可用");
  if (child.exitCode !== 0)
    throw new Error(label + " 退出码 " + child.exitCode);
}
