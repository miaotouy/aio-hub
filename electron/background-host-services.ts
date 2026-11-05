// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { ContextFilePolicyReader } from "./context-file-policy";
import type { LlmConfiguration } from "./llm-configuration";
import type { LlmKeyState } from "./llm-key-state";
import type {
  BackgroundHostServices,
  HostServiceHandler,
} from "./background-host-protocol";

/** Both Renderer and utility process use these exact Main-owned transaction owners. */
export function createBackgroundHostServices(owners: {
  environment: BackgroundHostServices["host.initialize"]["result"];
  configuration: Pick<LlmConfiguration, "load">;
  files?: Pick<ContextFilePolicyReader, "load">;
  assets?: { getRoot(): Promise<string> };
  keys: Pick<LlmKeyState, "run">;
}): HostServiceHandler {
  return async (request) => {
    switch (request.method) {
      case "host.initialize":
        return { ...owners.environment };
      case "context.files.policy":
        if (!owners.files) throw new Error("文件策略服务尚未连接");
        return owners.files.load();
      case "context.assets.root":
        if (!owners.assets) throw new Error("资产服务尚未连接");
        return owners.assets.getRoot();
      case "llm.configuration.load":
        return owners.configuration.load();
      case "llm.keys.execute": {
        const command = request.params;
        // Defend the wire boundary as well as its TypeScript surface.
        if (
          !command ||
          !["pick", "sync", "success", "failure"].includes(command.method)
        )
          throw new Error("后台密钥操作无效");
        const { key, unavailable } = await owners.keys.run(command);
        // Execution needs the choice/error, never the whole UI state projection.
        return { key, unavailable };
      }
      default:
        throw new Error("后台宿主服务未实现");
    }
  };
}
