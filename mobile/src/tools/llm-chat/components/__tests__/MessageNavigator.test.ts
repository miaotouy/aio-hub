// @vitest-environment jsdom

import { defineComponent } from "vue";
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import MessageNavigator from "../MessageNavigator.vue";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ tRaw: (key: string) => key }),
}));

const VarButtonStub = defineComponent({
  inheritAttrs: false,
  template: '<button v-bind="$attrs"><slot /></button>',
});

function mountNavigator(currentIndex = 2, total = 4) {
  return mount(MessageNavigator, {
    props: { currentIndex, total },
    global: { stubs: { "var-button": VarButtonStub } },
  });
}

describe("MessageNavigator", () => {
  it("emits directional navigation events from its compact controls", async () => {
    const wrapper = mountNavigator();
    const buttons = wrapper.findAll("button");

    await buttons[0].trigger("click");
    await buttons[1].trigger("click");
    await buttons[2].trigger("click");
    await buttons[3].trigger("click");

    expect(wrapper.emitted()).toMatchObject({
      top: [[]],
      previous: [[]],
      next: [[]],
      bottom: [[]],
    });
  });

  it("hides for fewer than two messages and disables unavailable directions", () => {
    const single = mountNavigator(1, 1);
    expect(single.find('[data-testid="message-navigator"]').exists()).toBe(false);

    const first = mountNavigator(1, 3);
    const buttons = first.findAll("button");
    expect(buttons[0].attributes("disabled")).toBeDefined();
    expect(buttons[1].attributes("disabled")).toBeDefined();
    expect(buttons[2].attributes("disabled")).toBeUndefined();
    expect(buttons[3].attributes("disabled")).toBeUndefined();
  });
});
