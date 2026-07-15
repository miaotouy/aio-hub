// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import { describe, expect, it } from "vitest";
import { buildLlmApiUrl } from "@/utils/llm-api-url";
import {
  normalizeLlmBaseUrl,
  parseLlmChannelConfig,
  type LlmConfigImportDocument,
} from "..";

const document = (
  content: string,
  name?: string,
  id = name || "pasted"
): LlmConfigImportDocument => ({ id, name, content });

describe("normalizeLlmBaseUrl", () => {
  it.each([
    [
      "https://proxy.example.com/v1/chat/completions",
      "https://proxy.example.com/v1",
    ],
    [
      "https://proxy.example.com/antigravity/v1/messages",
      "https://proxy.example.com/antigravity/v1",
    ],
    [
      "https://proxy.example.com/antigravity/v1beta/",
      "https://proxy.example.com/antigravity/v1beta",
    ],
    [
      "https://proxy.example.com/custom/v1/responses",
      "https://proxy.example.com/custom/v1",
    ],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeLlmBaseUrl(input)).toBe(expected);
  });

  it("rejects non HTTP URLs", () => {
    expect(normalizeLlmBaseUrl("file:///tmp/config")).toBeNull();
  });

  it("stays compatible with adapter URL completion", () => {
    expect(
      buildLlmApiUrl("https://proxy.example.com/custom/v1", "openai")
    ).toBe("https://proxy.example.com/custom/v1/chat/completions");
    expect(
      buildLlmApiUrl("https://proxy.example.com/antigravity/v1beta", "gemini")
    ).toBe(
      "https://proxy.example.com/antigravity/v1beta/models/{model}:generateContent"
    );
  });
});

describe("parseLlmChannelConfig", () => {
  it.each(["\\", "^", "`"])(
    "parses cURL with %s continuation",
    (continuation) => {
      const result = parseLlmChannelConfig(
        [
          document(
            `curl -X POST "https://proxy.example.com/v1/chat/completions" ${continuation}\n` +
              `  -H "Authorization: Bearer sk-live-secret" ${continuation}\n` +
              `  -d '{"model":"gpt-4o"}'`
          ),
        ],
        "curl"
      );
      expect(result.profiles[0]).toMatchObject({
        baseUrl: "https://proxy.example.com/v1",
        providerType: "openai",
        apiKeys: ["sk-live-secret"],
        models: [{ id: "gpt-4o", name: "gpt-4o" }],
      });
    }
  );

  it("parses Gemini cURL key header", () => {
    const result = parseLlmChannelConfig(
      [
        document(
          'curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent" -H "x-goog-api-key: gemini-secret"'
        ),
      ],
      "curl"
    );
    expect(result.profiles[0].providerType).toBe("gemini");
    expect(result.profiles[0].apiKeys).toEqual(["gemini-secret"]);
    expect(result.profiles[0].baseUrl).toBe(
      "https://generativelanguage.googleapis.com/v1beta"
    );
    expect(result.profiles[0].customEndpoints).toBeUndefined();
  });

  it("filters placeholder cURL keys", () => {
    const result = parseLlmChannelConfig(
      [
        document(
          'curl "https://api.example.com/v1/responses" -H "Authorization: Bearer ${API_KEY}"'
        ),
      ],
      "curl"
    );
    expect(result.profiles[0].apiKeys).toEqual([]);
    expect(result.profiles[0].warnings).toContainEqual(
      expect.objectContaining({ code: "api-key-missing" })
    );
  });

  it("filters OpenCode environment references", () => {
    const result = parseLlmChannelConfig(
      [
        document(
          JSON.stringify({
            provider: {
              openai: {
                options: {
                  baseURL: "https://proxy.example.com/v1",
                  apiKey: "{env:OPENAI_API_KEY}",
                },
              },
            },
          })
        ),
      ],
      "json"
    );
    expect(result.profiles[0].apiKeys).toEqual([]);
  });

  it.each([
    [
      'export ANTHROPIC_BASE_URL="https://proxy.example.com/antigravity/v1"\nexport ANTHROPIC_AUTH_TOKEN="claude-secret"',
      "claude",
    ],
    [
      "set GOOGLE_GEMINI_BASE_URL=https://proxy.example.com/antigravity/v1beta\nset GEMINI_API_KEY=gemini-secret\nset GEMINI_MODEL=gemini-2.5-pro",
      "gemini",
    ],
    [
      '$env:OPENAI_BASE_URL="https://proxy.example.com/v1"\n$env:OPENAI_API_KEY="openai-secret"',
      "openai",
    ],
  ])("parses environment variables", (content, providerType) => {
    const result = parseLlmChannelConfig([document(content)], "env");
    expect(result.profiles[0].providerType).toBe(providerType);
    expect(result.profiles[0].baseUrl).toContain("proxy.example.com");
  });

  it("parses Claude settings JSON", () => {
    const result = parseLlmChannelConfig(
      [
        document(
          JSON.stringify({
            env: {
              ANTHROPIC_BASE_URL: "https://claude.example.com/v1",
              ANTHROPIC_AUTH_TOKEN: "claude-secret",
            },
          }),
          "settings.json"
        ),
      ],
      "json"
    );
    expect(result.profiles[0]).toMatchObject({
      providerType: "claude",
      apiKeys: ["claude-secret"],
    });
  });

  it("keeps every OpenCode provider as a separate candidate", () => {
    const result = parseLlmChannelConfig(
      [
        document(
          JSON.stringify({
            provider: {
              anthropic: {
                options: {
                  baseURL: "https://proxy.example.com/antigravity/v1",
                  apiKey: "claude-secret",
                },
                models: { "claude-sonnet-4": { name: "Claude Sonnet 4" } },
              },
              gemini: {
                options: {
                  baseURL: "https://proxy.example.com/antigravity/v1beta",
                  apiKey: "gemini-secret",
                },
                models: { "gemini-2.5-pro": {} },
              },
            },
          }),
          "opencode.json"
        ),
      ],
      "json"
    );
    expect(result.profiles).toHaveLength(2);
    expect(result.profiles.map((profile) => profile.providerType)).toEqual([
      "claude",
      "gemini",
    ]);
  });

  it("pairs one Codex config.toml with one auth.json", () => {
    const result = parseLlmChannelConfig([
      document(
        'model = "gpt-5"\nmodel_provider = "proxy"\n[model_providers.proxy]\nbase_url = "https://proxy.example.com/v1"\nwire_api = "responses"\nsupports_websockets = true',
        "config.toml"
      ),
      document('{"OPENAI_API_KEY":"codex-secret"}', "auth.json"),
    ]);
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0]).toMatchObject({
      providerType: "openai-responses",
      apiKeys: ["codex-secret"],
      models: [{ id: "gpt-5", name: "gpt-5" }],
    });
    expect(result.profiles[0].warnings).toContainEqual(
      expect.objectContaining({ code: "websocket-unsupported" })
    );
  });

  it.each([
    [
      'model = "gpt-5"\nmodel_provider = "proxy"\n[model_providers.proxy]\nbase_url = "https://proxy.example.com/v1"\nwire_api = "responses"\n\n{"OPENAI_API_KEY":"codex-secret"}',
      "TOML then JSON",
    ],
    [
      '{"OPENAI_API_KEY":"codex-secret"}\n\nmodel = "gpt-5"\nmodel_provider = "proxy"\n[model_providers.proxy]\nbase_url = "https://proxy.example.com/v1"\nwire_api = "responses"',
      "JSON then TOML",
    ],
    [
      '### config.toml\n```toml\nmodel = "gpt-5"\nmodel_provider = "proxy"\n[model_providers.proxy]\nbase_url = "https://proxy.example.com/v1"\nwire_api = "responses"\n```\n\n### auth.json\n```json\n{"OPENAI_API_KEY":"codex-secret"}\n```',
      "named Markdown blocks",
    ],
  ])("pairs Codex files pasted together as %s", (content) => {
    const result = parseLlmChannelConfig([document(content)]);
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0]).toMatchObject({
      providerType: "openai-responses",
      apiKeys: ["codex-secret"],
      models: [{ id: "gpt-5", name: "gpt-5" }],
    });
  });

  it("keeps manual format parsing strict for compound pasted content", () => {
    const content =
      'model_provider = "proxy"\n[model_providers.proxy]\nbase_url = "https://proxy.example.com/v1"\nwire_api = "responses"\n{"OPENAI_API_KEY":"codex-secret"}';
    expect(
      parseLlmChannelConfig([document(content)], "toml").profiles
    ).toHaveLength(0);
  });

  it("does not split JSON embedded inside a TOML string", () => {
    const result = parseLlmChannelConfig([
      document(
        'model_provider = "proxy"\nprompt = \'return {"ok":true}\'\n[model_providers.proxy]\nbase_url = "https://proxy.example.com/v1"\nwire_api = "responses"'
      ),
    ]);
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0].apiKeys).toEqual([]);
  });

  it("does not pair auth when multiple Codex providers are possible", () => {
    const result = parseLlmChannelConfig([
      document(
        '[model_providers.first]\nbase_url = "https://first.example.com/v1"\nwire_api = "responses"\n[model_providers.second]\nbase_url = "https://second.example.com/v1"\nwire_api = "responses"',
        "config.toml"
      ),
      document('{"OPENAI_API_KEY":"codex-secret"}', "auth.json"),
    ]);
    expect(result.profiles).toHaveLength(2);
    expect(
      result.profiles.every((profile) => profile.apiKeys.length === 0)
    ).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "codex-auth-ambiguous" })
    );
  });

  it("maps Grok responses backend to Responses API", () => {
    const result = parseLlmChannelConfig(
      [
        document(
          '[model.default]\nmodel = "grok-4"\nbase_url = "https://api.x.ai/v1"\napi_key = "grok-secret"\napi_backend = "responses"'
        ),
      ],
      "toml"
    );
    expect(result.profiles[0].providerType).toBe("openai-responses");
  });

  it("ignores structurally unrelated JSON and TOML", () => {
    expect(
      parseLlmChannelConfig([document('{"theme":"dark"}')], "json").profiles
    ).toHaveLength(0);
    expect(
      parseLlmChannelConfig([document('theme = "dark"')], "toml").profiles
    ).toHaveLength(0);
  });

  it("never leaks keys into diagnostics", () => {
    const secret = "sk-super-secret-value";
    const result = parseLlmChannelConfig(
      [
        document(
          `ANTHROPIC_BASE_URL=https://one.example.com\nANTHROPIC_BASE_URL=https://two.example.com\nANTHROPIC_API_KEY=${secret}\nANTHROPIC_AUTH_TOKEN=another-secret`
        ),
      ],
      "env"
    );
    expect(JSON.stringify(result.diagnostics)).not.toContain(secret);
    expect(JSON.stringify(result.profiles[0].warnings)).not.toContain(secret);
    expect(result.profiles[0].warnings).toContainEqual(
      expect.objectContaining({ code: "api-key-conflict", blocking: true })
    );
  });
});
