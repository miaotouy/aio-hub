import { describe, expect, it, vi } from "vitest";
import {
  RECALL_EVIDENCE_MARKERS,
  recallChatScenarios,
} from "../fixtures/recall-scenarios";
import {
  createSsePayload,
  deterministicVector,
  matchChatScenario,
} from "./openai-mock-core";
import { createOpenAiMockHandler } from "./openai-mock";

function chatRequest(body: Record<string, unknown>): Request {
  return new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "e2e-chat", ...body }),
  });
}

describe("Recall E2E OpenAI mock", () => {
  it("uses normalized topic vectors and preserves embedding batch order", async () => {
    const rust = deterministicVector("Rust ownership and borrow checker");
    const banana = deterministicVector("banana bread recipe");

    expect(rust.topicId).toBe("rust-ownership");
    expect(banana.topicId).toBe("banana-bread");
    expect(rust.vector).toHaveLength(8);
    expect(rust.vector).not.toEqual(banana.vector);
    expect(
      Math.sqrt(rust.vector.reduce((sum, value) => sum + value ** 2, 0))
    ).toBeCloseTo(1);

    const writeEmbeddingSummary = vi.fn();
    const handler = createOpenAiMockHandler({ writeEmbeddingSummary });
    const response = await handler.fetch(
      new Request("http://127.0.0.1/v1/embeddings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "e2e-embedding",
          input: ["banana bread", "Rust ownership"],
        }),
      })
    );
    const body = (await response.json()) as {
      data: Array<{ index: number; embedding: number[] }>;
    };

    expect(body.data.map((item) => item.index)).toEqual([0, 1]);
    expect(body.data[0].embedding).toEqual(banana.vector);
    expect(body.data[1].embedding).toEqual(rust.vector);
    expect(writeEmbeddingSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        inputCount: 2,
        responseCount: 2,
        dimension: 8,
        status: 200,
      })
    );
    expect(JSON.stringify(writeEmbeddingSummary.mock.calls)).not.toContain(
      "banana bread"
    );
  });

  it("does not accept evidence copied into the locating user message", () => {
    const match = matchChatScenario(
      [
        {
          role: "user",
          content: `[e2e:recall-renderer-v2] ${RECALL_EVIDENCE_MARKERS.renderer}`,
        },
      ],
      true,
      recallChatScenarios
    );

    expect(match).toMatchObject({
      ok: false,
      reason: "required_evidence_missing",
    });
  });

  it("accepts Recall depth injection in a user-role message before the query", () => {
    const match = matchChatScenario(
      [
        {
          role: "user",
          content: `Injected Recall: ${RECALL_EVIDENCE_MARKERS.renderer}`,
        },
        { role: "user", content: "[e2e:recall-renderer-v2] why?" },
      ],
      true,
      recallChatScenarios
    );

    expect(match).toMatchObject({
      ok: true,
      scenario: { id: "renderer-positive" },
    });
  });

  it("returns a matched multi-chunk SSE response and redacted summary", async () => {
    const writeChatSummary = vi.fn();
    const handler = createOpenAiMockHandler({ writeChatSummary });
    const response = await handler.fetch(
      chatRequest({
        stream: true,
        messages: [
          {
            role: "system",
            content: `Recall context: ${RECALL_EVIDENCE_MARKERS.renderer}`,
          },
          { role: "user", content: "[e2e:recall-renderer-v2] why?" },
        ],
      })
    );
    const payload = await response.text();

    expect(response.status).toBe(200);
    expect(payload).toContain("复杂 Markdown 的停顿点来自");
    expect(payload).toContain("重型组件初始化");
    expect(payload).toContain("data: [DONE]");
    expect(writeChatSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarioId: "renderer-positive",
        scenarioMatch: true,
        status: 200,
        sseChunkCount: 2,
      })
    );
    const persisted = JSON.stringify(writeChatSummary.mock.calls);
    expect(persisted).not.toContain(RECALL_EVIDENCE_MARKERS.renderer);
    expect(persisted).not.toContain("[e2e:recall-renderer-v2]");
  });

  it("fails closed for missing, forbidden, and unknown evidence", async () => {
    const handler = createOpenAiMockHandler();
    const cases = [
      [
        { role: "system", content: "no recall context" },
        { role: "user", content: "[e2e:recall-renderer-v2]" },
      ],
      [
        {
          role: "system",
          content: `${RECALL_EVIDENCE_MARKERS.renderer} ${RECALL_EVIDENCE_MARKERS.base64}`,
        },
        { role: "user", content: "[e2e:recall-renderer-v2]" },
      ],
      [{ role: "user", content: "unregistered E2E request" }],
    ];

    const responses = await Promise.all(
      cases.map((messages) =>
        handler.fetch(chatRequest({ stream: true, messages }))
      )
    );
    const bodies = await Promise.all(
      responses.map((response) => response.json())
    );

    expect(responses.map((response) => response.status)).toEqual([
      422, 422, 422,
    ]);
    expect(
      bodies.map((body) => (body as { error: { reason: string } }).error.reason)
    ).toEqual([
      "required_evidence_missing",
      "forbidden_evidence_present",
      "scenario_not_found",
    ]);
  });

  it("enforces non-stream scenarios and returns standard JSON", async () => {
    const handler = createOpenAiMockHandler();
    const messages = [
      {
        role: "system",
        content: RECALL_EVIDENCE_MARKERS.structure,
      },
      { role: "user", content: "[e2e:recall-non-stream]" },
    ];
    const wrongMode = await handler.fetch(
      chatRequest({ stream: true, messages })
    );
    const response = await handler.fetch(
      chatRequest({ stream: false, messages })
    );
    const body = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    expect(wrongMode.status).toBe(422);
    expect(response.status).toBe(200);
    expect(body.choices[0].message.content).toBe(
      "工具模块按 core、logic、config 和 stores 拆分。"
    );
  });

  it("builds one SSE delta per configured response chunk", () => {
    const payload = createSsePayload(["first", "second"], "stop");
    const dataLines = payload
      .split("\n")
      .filter((line) => line.startsWith("data: "));

    expect(dataLines).toHaveLength(4);
    expect(dataLines.at(-1)).toBe("data: [DONE]");
  });
});

function systemOneRequest(state: Record<string, unknown>): Request {
  return new Request("http://127.0.0.1/v1/systemone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "e2e-jev",
      state,
      questions: {
        risk: { type: "noul" },
        intent: { type: "noul" },
        verdict: { type: "choice" },
      },
    }),
  });
}

describe("JEV decision arbitration E2E mock", () => {
  it("exposes the decision model in /v1/models", async () => {
    const handler = createOpenAiMockHandler();
    const response = await handler.fetch(
      new Request("http://127.0.0.1/v1/models")
    );
    const body = (await response.json()) as {
      data: Array<{ id: string }>;
    };
    expect(body.data.map((item) => item.id)).toContain("e2e-jev");
  });

  it("returns the marker-specific verdict from /v1/systemone", async () => {
    const writeDecisionSummary = vi.fn();
    const handler = createOpenAiMockHandler({ writeDecisionSummary });

    const approve = await handler.fetch(
      systemOneRequest({ recentUserMessage: "[e2e:jev:approve]" })
    );
    const approveBody = (await approve.json()) as {
      answers: {
        risk: { noul: number };
        intent: { noul: number };
        verdict: { choice: string; confidence: number };
      };
    };
    expect(approveBody.answers.verdict.choice).toBe("approve");
    expect(approveBody.answers.risk.noul).toBeLessThan(0.15);
    expect(approveBody.answers.intent.noul).toBeGreaterThan(0.6);

    const deny = await handler.fetch(
      systemOneRequest({ recentUserMessage: "[e2e:jev:deny]" })
    );
    const denyBody = (await deny.json()) as {
      answers: { verdict: { choice: string } };
    };
    expect(denyBody.answers.verdict.choice).toBe("deny");

    expect(writeDecisionSummary).toHaveBeenCalledWith(
      expect.objectContaining({ marker: "approve", verdict: "approve" })
    );
  });

  it("injects a channel failure for the fail marker", async () => {
    const writeDecisionSummary = vi.fn();
    const handler = createOpenAiMockHandler({ writeDecisionSummary });
    const response = await handler.fetch(
      systemOneRequest({ recentUserMessage: "[e2e:jev:fail]" })
    );
    expect(response.status).toBe(500);
    expect(writeDecisionSummary).toHaveBeenCalledWith(
      expect.objectContaining({ marker: "fail", status: 500 })
    );
  });

  it("streams a VCP tool call for the first turn and closes on the tool result", async () => {
    const handler = createOpenAiMockHandler();
    const first = await handler.fetch(
      chatRequest({
        stream: true,
        messages: [{ role: "user", content: "[e2e:jev:approve]" }],
      })
    );
    const firstPayload = await first.text();
    expect(firstPayload).toContain("<<<[TOOL_REQUEST]>>>");
    expect(firstPayload).toContain("json-formatter");
    expect(firstPayload).toContain("formatJson");

    const second = await handler.fetch(
      chatRequest({
        stream: true,
        messages: [
          { role: "user", content: "[e2e:jev:approve]" },
          {
            role: "user",
            content: "[[AIO工具调用结果信息汇总: ... ]]",
          },
        ],
      })
    );
    const secondPayload = await second.text();
    expect(secondPayload).toContain("E2E JEV 工具执行完成");
    expect(secondPayload).not.toContain("<<<[TOOL_REQUEST]>>>");
  });

  it("routes danger and force markers to their dedicated tools", async () => {
    const handler = createOpenAiMockHandler();

    const danger = await handler.fetch(
      chatRequest({
        stream: true,
        messages: [{ role: "user", content: "[e2e:jev:danger]" }],
      })
    );
    expect(await danger.text()).toContain("sudo rm -rf /");

    const force = await handler.fetch(
      chatRequest({
        stream: true,
        messages: [{ role: "user", content: "[e2e:jev:force]" }],
      })
    );
    const forcePayload = await force.text();
    expect(forcePayload).toContain("llm-chat-agent-mgmt");
    expect(forcePayload).toContain("set_agent_field");
  });
});
