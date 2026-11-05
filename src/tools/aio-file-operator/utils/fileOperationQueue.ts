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

import { isPathWithinRoot, resolvePathForSecurity } from "./security";

interface Reservation {
  paths: string[];
  done: Promise<void>;
}
const pending = new Set<Reservation>();

/** 一次预留全部路径；祖先目录与后代路径互斥，独立文件可并发。 */
export async function withFileOperationLocks<T>(
  paths: string[],
  operation: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  signal?.throwIfAborted();
  const resolved = [
    ...new Set(await Promise.all(paths.map(resolvePathForSecurity))),
  ].sort();
  signal?.throwIfAborted();
  const previous = [...pending]
    .filter((entry) =>
      entry.paths.some((a) =>
        resolved.some((b) => isPathWithinRoot(a, b) || isPathWithinRoot(b, a))
      )
    )
    .map((entry) => entry.done);
  let release!: () => void;
  const reservation: Reservation = {
    paths: resolved,
    done: new Promise((resolve) => {
      release = resolve;
    }),
  };
  pending.add(reservation);
  try {
    await Promise.all(previous);
    signal?.throwIfAborted();
    return await operation();
  } finally {
    pending.delete(reservation);
    release();
  }
}
