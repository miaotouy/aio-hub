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

import type { UpgradeContributionDefinition } from "./types";

export class UpgradeContributionRegistry {
  private readonly definitions = new Map<
    string,
    UpgradeContributionDefinition
  >();

  register<TSnapshot>(
    definition: UpgradeContributionDefinition<TSnapshot>
  ): void {
    if (!definition.id.trim()) {
      throw new Error("升级贡献项必须提供非空 id");
    }
    if (this.definitions.has(definition.id)) {
      throw new Error(`升级贡献项已注册: ${definition.id}`);
    }
    this.definitions.set(
      definition.id,
      definition as UpgradeContributionDefinition
    );
  }

  get(id: string): UpgradeContributionDefinition | undefined {
    return this.definitions.get(id);
  }

  getAll(): UpgradeContributionDefinition[] {
    return [...this.definitions.values()].sort(
      (left, right) => left.order - right.order
    );
  }

  clear(): void {
    this.definitions.clear();
  }
}

export const upgradeContributionRegistry = new UpgradeContributionRegistry();
