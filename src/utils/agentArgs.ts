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

const TRUE_LITERALS = new Set(["true", "1", "yes", "y", "on"]);
const FALSE_LITERALS = new Set(["false", "0", "no", "n", "off"]);

export function parseAgentBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }

  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (TRUE_LITERALS.has(normalized)) return true;
  if (FALSE_LITERALS.has(normalized)) return false;
  return undefined;
}

export function coerceAgentBoolean(
  value: unknown,
  defaultValue = false
): boolean {
  return parseAgentBoolean(value) ?? defaultValue;
}

export function normalizeAgentBooleanFields<T extends Record<string, unknown>>(
  args: T,
  fields: readonly string[]
): T {
  const normalized: Record<string, unknown> = { ...args };

  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(normalized, field)) continue;

    const parsed = parseAgentBoolean(normalized[field]);
    if (parsed !== undefined) {
      normalized[field] = parsed;
    }
  }

  return normalized as T;
}
