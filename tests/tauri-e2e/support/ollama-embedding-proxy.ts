import fs from "node:fs";
import path from "node:path";
import { sha256 } from "./openai-mock-core";

interface OllamaEmbeddingProxyOptions {
  targetBaseUrl: string;
  artifactDir: string;
  port?: number;
}

export function startOllamaEmbeddingProxy(
  options: OllamaEmbeddingProxyOptions
) {
  const target = new URL(options.targetBaseUrl);
  const logPath = path.join(options.artifactDir, "ollama-requests.jsonl");
  fs.mkdirSync(options.artifactDir, { recursive: true });
  fs.writeFileSync(logPath, "", "utf8");

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "OPTIONS")
        return new Response(null, { status: 204 });
      const bodyText = await request.text();
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      const response = await fetch(new URL(url.pathname + url.search, target), {
        method: request.method,
        headers: { "content-type": "application/json" },
        body: bodyText,
      });
      const payload = (await response.json()) as {
        data?: Array<{ embedding?: unknown[] }>;
      };
      const rawInputs = Array.isArray(body.input)
        ? body.input
        : [body.input ?? ""];
      fs.appendFileSync(
        logPath,
        `${JSON.stringify({
          at: new Date().toISOString(),
          endpoint: url.pathname,
          model: typeof body.model === "string" ? body.model : null,
          status: response.status,
          inputCount: rawInputs.length,
          inputs: rawInputs.map((value, index) => {
            const input = String(value);
            return {
              index,
              inputHash: sha256(input),
              inputLength: input.length,
            };
          }),
          responseCount: payload.data?.length ?? 0,
          dimension: payload.data?.[0]?.embedding?.length ?? null,
        })}\n`,
        "utf8"
      );
      return Response.json(payload, { status: response.status });
    },
  });

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
}
