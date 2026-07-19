import fs from "node:fs";
import path from "node:path";

interface OpenAiMockOptions {
  logPath: string;
  port?: number;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

function deterministicVector(input: string, dimensions: number): number[] {
  return Array.from({ length: dimensions }, (_, index) => {
    const value = (input.length + index * 13) % 19;
    return Number(((value + 1) / 20).toFixed(6));
  });
}

export function startOpenAiMock(options: OpenAiMockOptions) {
  fs.mkdirSync(path.dirname(options.logPath), { recursive: true });
  fs.writeFileSync(options.logPath, "", "utf8");

  const requests: Array<Record<string, unknown>> = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") return json({ ok: true });
      if (url.pathname === "/health") return json({ ok: true });
      if (url.pathname === "/__requests") return json({ requests });

      let body: Record<string, unknown> = {};
      if (request.method === "POST") {
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ error: { message: "Invalid JSON body" } }, 400);
        }
      }

      const summary = {
        at: new Date().toISOString(),
        method: request.method,
        path: url.pathname,
        model: body.model,
        stream: body.stream === true,
        inputCount: Array.isArray(body.input) ? body.input.length : body.input ? 1 : 0,
        messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
      };
      requests.push(summary);
      fs.appendFileSync(options.logPath, `${JSON.stringify(summary)}\n`, "utf8");

      if (request.method === "GET" && url.pathname === "/v1/models") {
        return json({
          object: "list",
          data: [
            { id: "e2e-chat", object: "model", owned_by: "aiohub-e2e" },
            { id: "e2e-embedding", object: "model", owned_by: "aiohub-e2e" },
          ],
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/embeddings") {
        const rawInput = Array.isArray(body.input) ? body.input : [body.input ?? ""];
        const dimensions =
          typeof body.dimensions === "number" && Number.isInteger(body.dimensions)
            ? Math.max(1, body.dimensions)
            : 2;
        return json({
          object: "list",
          model: body.model ?? "e2e-embedding",
          data: rawInput.map((item, index) => ({
            object: "embedding",
            index,
            embedding: deterministicVector(String(item), dimensions),
          })),
          usage: { prompt_tokens: rawInput.length, total_tokens: rawInput.length },
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const lastMessage = messages.at(-1) as { content?: unknown } | undefined;
        const content = `E2E mock response: ${String(lastMessage?.content ?? "ok").slice(0, 120)}`;
        if (body.stream === true) {
          const chunks = [
            {
              id: "chatcmpl-e2e",
              object: "chat.completion.chunk",
              choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }],
            },
            {
              id: "chatcmpl-e2e",
              object: "chat.completion.chunk",
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            },
          ];
          const payload = `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;
          return new Response(payload, {
            headers: {
              "content-type": "text/event-stream",
              "cache-control": "no-cache",
              "access-control-allow-origin": "*",
            },
          });
        }
        return json({
          id: "chatcmpl-e2e",
          object: "chat.completion",
          model: body.model ?? "e2e-chat",
          choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }

      return json({ error: { message: `Unhandled mock route: ${url.pathname}` } }, 404);
    },
  });

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    port: server.port,
    stop: () => server.stop(true),
  };
}
