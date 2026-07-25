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

import type { GuidedFlowDefinition } from "./types";

export class GuidedFlowRegistry {
  private readonly definitions = new Map<string, GuidedFlowDefinition>();

  register<TContext>(definition: GuidedFlowDefinition<TContext>): void {
    if (!definition.id.trim()) {
      throw new Error("Guided Flow 必须提供非空 id");
    }
    if (!definition.version.trim()) {
      throw new Error(`Guided Flow ${definition.id} 必须提供版本号`);
    }
    if (definition.steps.length === 0) {
      throw new Error(`Guided Flow ${definition.id} 至少需要一个步骤`);
    }
    if (this.definitions.has(definition.id)) {
      throw new Error(`Guided Flow 已注册: ${definition.id}`);
    }

    const stepIds = new Set<string>();
    for (const step of definition.steps) {
      if (!step.id.trim() || stepIds.has(step.id)) {
        throw new Error(`Guided Flow ${definition.id} 包含空或重复的步骤 id`);
      }
      stepIds.add(step.id);
    }

    this.definitions.set(definition.id, definition as GuidedFlowDefinition);
  }

  get(id: string): GuidedFlowDefinition | undefined {
    return this.definitions.get(id);
  }

  getAll(): GuidedFlowDefinition[] {
    return [...this.definitions.values()];
  }

  clear(): void {
    this.definitions.clear();
  }
}

export const guidedFlowRegistry = new GuidedFlowRegistry();
