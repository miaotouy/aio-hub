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

import { computed, onScopeDispose, ref, watch } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { createAssetDescriber } from "../../services/agentAssetDescriptionService";
import type { AgentAsset, AssetGroup } from "../../types/agent";

const logger = createModuleLogger("AssetDescriptionGeneration");
export interface AssetDescriptionJob {
  asset: AgentAsset;
  status:
    "pending" | "running" | "succeeded" | "failed" | "skipped" | "cancelled";
  error?: string;
}
interface Options {
  agentId: () => string;
  active: () => boolean;
  groups: () => AssetGroup[];
  apply: (snapshot: AgentAsset, description: string) => boolean;
}

export function useAssetDescriptionGeneration(options: Options) {
  const jobs = ref<AssetDescriptionJob[]>([]);
  const running = ref(false);
  const cancelled = ref(false);
  let controller: AbortController | undefined;
  let generation = 0;
  const completed = computed(
    () =>
      jobs.value.filter((job) => !["pending", "running"].includes(job.status))
        .length
  );
  const failed = computed(() =>
    jobs.value.filter((job) => job.status === "failed")
  );
  const succeeded = computed(
    () => jobs.value.filter((job) => job.status === "succeeded").length
  );
  const skipped = computed(
    () => jobs.value.filter((job) => job.status === "skipped").length
  );

  const cancel = () => {
    cancelled.value = true;
    controller?.abort();
    jobs.value.forEach((job) => {
      if (job.status === "pending" || job.status === "running")
        job.status = "cancelled";
    });
  };
  const clear = () => {
    cancel();
    generation++;
    running.value = false;
    jobs.value = [];
  };

  const run = async (
    assets: AgentAsset[],
    prompt: string,
    overwrite = false
  ) => {
    if (running.value || !options.active()) return;
    const token = ++generation;
    const agentId = options.agentId();
    const groups = options.groups().map((group) => ({ ...group }));
    controller = new AbortController();
    const signal = controller.signal;
    cancelled.value = false;
    jobs.value = assets.map((asset) => ({
      asset: { ...asset },
      status: !overwrite && asset.description?.trim() ? "skipped" : "pending",
    }));
    const pending = jobs.value.filter((job) => job.status === "pending");
    if (!pending.length) return;
    running.value = true;
    const active = () =>
      !signal.aborted &&
      token === generation &&
      agentId === options.agentId() &&
      options.active();
    try {
      const describe = await createAssetDescriber(agentId, prompt);
      let cursor = 0;
      const worker = async () => {
        while (active() && cursor < pending.length) {
          const job = pending[cursor++];
          job.status = "running";
          try {
            const description = await describe(
              job.asset,
              groups.find((group) => group.id === job.asset.group),
              signal
            );
            if (!active()) return;
            job.status = options.apply(job.asset, description)
              ? "succeeded"
              : "skipped";
          } catch (error) {
            if (!active()) return;
            job.status = "failed";
            job.error = error instanceof Error ? error.message : String(error);
            logger.warn("资产描述生成失败", {
              filename: job.asset.filename,
              error: job.error,
            });
          }
        }
      };
      await Promise.all([worker(), worker()]);
    } catch (error) {
      if (active()) {
        const message = error instanceof Error ? error.message : String(error);
        pending.forEach((job) => {
          job.status = "failed";
          job.error = message;
        });
        logger.warn("资产描述生成准备失败", { error: message });
      }
    } finally {
      if (token === generation) running.value = false;
    }
  };

  watch(options.agentId, clear);
  watch(options.active, (active) => {
    if (!active) clear();
  });
  onScopeDispose(clear);
  return {
    jobs,
    running,
    cancelled,
    completed,
    failed,
    succeeded,
    skipped,
    run,
    cancel,
    clear,
  };
}
