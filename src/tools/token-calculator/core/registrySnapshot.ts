// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type {
  TokenizerProfile,
  BuiltinProfileOverride,
} from "../types/tokenizer-profile";

/** Builtin overrides have the same replacement semantics in every execution owner. */
export function applyBuiltinTokenizerOverrides(
  defaults: TokenizerProfile[],
  overrides: Record<string, BuiltinProfileOverride>
): TokenizerProfile[] {
  return defaults.map((profile) => {
    const next = { ...profile };
    const override = Object.prototype.hasOwnProperty.call(overrides, profile.id)
      ? overrides[profile.id]
      : undefined;
    if (override?.enabled !== undefined) next.enabled = override.enabled;
    if (override?.calibration !== undefined)
      next.calibration = { ...override.calibration };
    return next;
  });
}
