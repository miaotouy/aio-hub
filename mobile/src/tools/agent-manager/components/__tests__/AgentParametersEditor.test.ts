// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/i18n", () => ({
  useI18n: () => ({ tRaw: (key: string) => key }),
}));

import AgentParametersEditor from "../AgentParametersEditor.vue";
import type { LlmParameters } from "../../types/agent";

function emittedParameters(
  wrapper: ReturnType<typeof mount>
): LlmParameters | undefined {
  const events = wrapper.emitted("update:modelValue");
  return events?.[events.length - 1]?.[0] as LlmParameters | undefined;
}

describe("AgentParametersEditor", () => {
  it("updates and clears supported request parameters without discarding others", async () => {
    const wrapper = mount(AgentParametersEditor, {
      props: {
        modelValue: { temperature: 0.4, custom: { enabled: true } },
      },
    });

    await wrapper
      .get('[data-testid="agent-parameter-maxTokens"]')
      .setValue("2048");
    expect(emittedParameters(wrapper)).toEqual({
      temperature: 0.4,
      maxTokens: 2048,
      custom: { enabled: true },
    });

    await wrapper
      .get('[data-testid="agent-parameter-temperature"]')
      .setValue("");
    expect(emittedParameters(wrapper)).toEqual({
      custom: { enabled: true },
    });
  });

  it("retains a negative penalty until the number input is committed", async () => {
    const wrapper = mount(AgentParametersEditor, {
      props: { modelValue: { presencePenalty: 0 } },
    });

    await wrapper
      .get('[data-testid="agent-parameter-presencePenalty"]')
      .setValue("-0.2");

    expect(emittedParameters(wrapper)).toEqual({ presencePenalty: -0.2 });
  });

  it("normalizes stop sequences and context truncation settings", async () => {
    const wrapper = mount(AgentParametersEditor, { props: { modelValue: {} } });

    await wrapper
      .get('[data-testid="agent-parameter-stop"]')
      .setValue("END\n\n DONE ");
    const stopParameters = emittedParameters(wrapper);
    expect(stopParameters).toEqual({ stop: ["END", "DONE"] });
    await wrapper.setProps({ modelValue: stopParameters });

    await wrapper
      .get('[data-testid="agent-context-management-enabled"]')
      .setValue(true);
    const enabledParameters = emittedParameters(wrapper);
    expect(enabledParameters).toEqual({
      stop: ["END", "DONE"],
      contextManagement: { enabled: true },
    });
    await wrapper.setProps({ modelValue: enabledParameters });

    await wrapper
      .get('[data-testid="agent-context-management-max-tokens"]')
      .setValue("4096");
    expect(emittedParameters(wrapper)).toEqual({
      stop: ["END", "DONE"],
      contextManagement: { enabled: true, maxContextTokens: 4096 },
    });
  });
});
