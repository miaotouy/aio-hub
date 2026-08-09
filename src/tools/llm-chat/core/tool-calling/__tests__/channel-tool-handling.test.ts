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

import { describe, expect, it } from "vitest";
import {
  isChannelToolHandling,
  isSameHost,
  resolveChannelToolHandling,
} from "../channel-tool-handling";

describe("channel tool handling", () => {
  it("normalizes loopback hostnames when matching VCP endpoints", () => {
    expect(isSameHost("http://127.0.0.1:6505/v1", "ws://localhost:6505")).toBe(
      true
    );
    expect(isSameHost("http://localhost:6505/v1", "ws://localhost:6506")).toBe(
      false
    );
  });

  it("uses an explicit VCP text declaration even when the endpoint host differs", () => {
    const resolved = resolveChannelToolHandling(
      {
        baseUrl: "https://proxy.example.com/v1",
        toolHandling: {
          callConsumer: "upstream",
          upstreamProtocol: "vcp-text",
          aioDistributedExposure: "complete",
          evidence: "heuristic",
        },
      },
      "ws://127.0.0.1:6505"
    );

    expect(resolved.source).toBe("explicit");
    expect(resolved.isVcpTextChannel).toBe(true);
    expect(resolved.handling.evidence).toBe("explicit");
  });

  it("lets explicit non-VCP handling override the legacy same-host heuristic", () => {
    const resolved = resolveChannelToolHandling(
      {
        baseUrl: "http://localhost:6505/v1",
        toolHandling: {
          callConsumer: "aio",
          upstreamProtocol: "transparent",
        },
      },
      "ws://127.0.0.1:6505"
    );

    expect(resolved.source).toBe("explicit");
    expect(resolved.isVcpTextChannel).toBe(false);
  });

  it("keeps the same-host heuristic for legacy profiles", () => {
    const resolved = resolveChannelToolHandling(
      { baseUrl: "http://localhost:6505/v1" },
      "ws://127.0.0.1:6505"
    );

    expect(resolved.source).toBe("same-host-heuristic");
    expect(resolved.handling.aioDistributedExposure).toBe("unknown");
    expect(resolved.isVcpTextChannel).toBe(true);
  });

  it("rejects invalid persisted declarations", () => {
    expect(
      isChannelToolHandling({
        callConsumer: "unknown",
        upstreamProtocol: "vcp-text",
      })
    ).toBe(false);
    expect(
      isChannelToolHandling({
        callConsumer: "upstream",
        upstreamProtocol: "vcp-text",
        aioDistributedExposure: "invalid",
      })
    ).toBe(false);
  });
});
