import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ModelRoutingEditor from "../ModelRoutingEditor.vue";

const stubs = {
  ElSelect: { template: "<div><slot /></div>" },
  ElOption: { template: "<div><slot /></div>" },
  ElInput: { template: "<input />" },
  ElButton: { template: "<button><slot /></button>" },
  ElTag: { template: '<span class="route-tag-stub"><slot /></span>' },
};

function mountEditor(overrides: Record<string, unknown> = {}) {
  return mount(ModelRoutingEditor, {
    props: {
      modelValue: undefined,
      providerType: "openai",
      ...overrides,
    },
    global: { stubs },
  });
}

function stateOf(wrapper: ReturnType<typeof mountEditor>) {
  return (wrapper.vm.$ as any).setupState;
}

describe("ModelRoutingEditor", () => {
  it("shows the channel default as the effective route when no routing exists", () => {
    const wrapper = mountEditor();
    const hint = wrapper.find(".route-hint").text();
    expect(hint).toContain("OpenAI Chat Completions");
    expect(hint).toContain("渠道默认");
  });

  it("writes a manual chat binding and reports it as effective", async () => {
    const wrapper = mountEditor({ providerType: "openai-compatible" });
    const state = stateOf(wrapper);

    state.onAdapterChange("chat", "anthropic-messages");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([
      { bindings: { chat: { adapterId: "anthropic-messages", source: "manual" } } },
    ]);

    await wrapper.setProps({
      modelValue: {
        bindings: {
          chat: { adapterId: "anthropic-messages", source: "manual" },
        },
      },
    });
    const hint = wrapper.find(".route-hint").text();
    expect(hint).toContain("Anthropic Messages");
    expect(hint).toContain("手动绑定");
  });

  it("keeps an explicit endpoint when the adapter changes", async () => {
    const wrapper = mountEditor({
      modelValue: {
        bindings: {
          chat: {
            adapterId: "anthropic-messages",
            endpoint: "/v1/messages",
            source: "manual",
          },
        },
      },
    });
    const state = stateOf(wrapper);

    state.onAdapterChange("chat", "openai-responses");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([
      {
        bindings: {
          chat: {
            adapterId: "openai-responses",
            endpoint: "/v1/messages",
            source: "manual",
          },
        },
      },
    ]);
  });

  it("clears a binding back to the channel default", () => {
    const wrapper = mountEditor({
      modelValue: {
        bindings: {
          chat: { adapterId: "anthropic-messages", source: "manual" },
        },
      },
    });
    const state = stateOf(wrapper);

    state.clearBinding("chat");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([
      { bindings: {} },
    ]);
  });

  it("renders the server-declared endpoint set without mutating it", () => {
    const wrapper = mountEditor({
      modelValue: {
        supportedEndpointTypes: ["openai", "future-protocol"],
        bindings: {
          chat: { adapterId: "openai-chat-completions", source: "probe" },
        },
      },
    });
    const tags = wrapper.findAll(".supported-endpoints .route-tag-stub");
    expect(tags.map((tag) => tag.text())).toEqual([
      "openai",
      "future-protocol",
    ]);
  });
});
