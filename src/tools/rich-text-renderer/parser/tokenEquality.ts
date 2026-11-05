// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { isEqual } from "lodash-es";
import type { Token } from "./types";

/** Token records contain scalar fields and small attribute/argument maps. */
export function tokenEquals(left: Token, right: Token): boolean {
  if (left === right) return true;
  if (left.type !== right.type) return false;
  const beforeFields = left as unknown as Record<string, unknown>;
  const afterFields = right as unknown as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    const before = beforeFields[key],
      after = afterFields[key];
    if (before === after) continue;
    // Most tokens never need the generic object comparison stack.
    if (
      before === null ||
      after === null ||
      typeof before !== "object" ||
      typeof after !== "object" ||
      !isEqual(before, after)
    )
      return false;
  }
  return true;
}
