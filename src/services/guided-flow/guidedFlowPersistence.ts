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

import { createConfigManager } from "@/utils/configManager";
import type { GuidedFlowState } from "./types";

interface GuidedFlowPersistenceData {
  states: Record<string, GuidedFlowState>;
}

export interface GuidedFlowPersistence {
  load(): Promise<Record<string, GuidedFlowState>>;
  save(states: Record<string, GuidedFlowState>): Promise<void>;
}

export class ConfigGuidedFlowPersistence implements GuidedFlowPersistence {
  private readonly configManager =
    createConfigManager<GuidedFlowPersistenceData>({
      moduleName: "guided-flow",
      fileName: "guided-flow-state.json",
      version: "1.0.0",
      createDefault: () => ({ states: {} }),
    });

  async load(): Promise<Record<string, GuidedFlowState>> {
    const data = await this.configManager.load();
    return data.states ?? {};
  }

  async save(states: Record<string, GuidedFlowState>): Promise<void> {
    await this.configManager.save({ states });
  }
}

export const guidedFlowPersistence = new ConfigGuidedFlowPersistence();
