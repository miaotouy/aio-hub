// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { afterEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import MessageInputPanelHost from "./MessageInputPanelHost.vue";
import { provideMessageInputPanel } from "../../composables/input/useMessageInputPanel";

// Protects the slot lifecycle and keyboard contract through actual user interactions.
// Local edits survive folding; replacement and close release the previous panel.
const LocalEditor = defineComponent({
  props: { initial: { type: String, required: true } },
  setup(props) {
    const value = ref(props.initial);
    return { value };
  },
  template: '<input v-model="value" aria-label="面板内容" />',
});

const Harness = defineComponent({
  components: { MessageInputPanelHost },
  setup() {
    const panel = provideMessageInputPanel();
    const triggerA = ref<HTMLButtonElement>();
    const triggerB = ref<HTMLButtonElement>();
    const draft = ref("草稿保留");
    function toggle(id: string) {
      panel.toggle(
        {
          id,
          title: id,
          component: LocalEditor,
          props: { initial: id },
        },
        () => (id === "A" ? triggerA.value : triggerB.value)
      );
    }
    return { panel, ...panel, triggerA, triggerB, toggle, draft };
  },
  template: `
    <div>
      <button ref="triggerA" aria-label="打开 A" @click="toggle('A')">A</button>
      <button ref="triggerB" aria-label="打开 B" @click="toggle('B')">B</button>
      <MessageInputPanelHost v-if="activePanel"
        :panel="activePanel" :content-id="contentId"
        v-model:collapsed="collapsed" @close="panel.close(true)">
        <component :is="activePanel.component" :key="activePanel.id" v-bind="activePanel.props" />
      </MessageInputPanelHost>
      <textarea v-model="draft" aria-label="输入草稿" />
    </div>`,
});

let wrapper: VueWrapper;
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
});
const button = (label: string) => wrapper.get(`button[aria-label="${label}"]`);

async function click(label: string) {
  const target = button(label);
  (target.element as HTMLButtonElement).focus();
  await target.trigger("click");
  await nextTick();
}

describe("message input panel slot", () => {
  it("preserves the active panel's edits while folding and lets the draft remain editable", async () => {
    wrapper = mount(Harness, { attachTo: document.body });
    await click("打开 A");
    await wrapper.get("input").setValue("正在配置");
    await click("折叠面板");
    expect(wrapper.get("input").isVisible()).toBe(false);
    await wrapper.get("textarea").setValue("继续输入");
    await click("打开 A");
    expect(wrapper.get("input").isVisible()).toBe(true);
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe(
      "正在配置"
    );
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "继续输入"
    );
  });

  it("replaces the current content and reopens the old panel from its current business state", async () => {
    wrapper = mount(Harness, { attachTo: document.body });
    await click("打开 A");
    await wrapper.get("input").setValue("A 的临时搜索");
    await click("打开 B");
    expect(wrapper.findAll("input")).toHaveLength(1);
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("B");
    await click("打开 A");
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("A");
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "草稿保留"
    );
  });

  it("closes with Escape or the close control, returns focus, and releases local edits", async () => {
    wrapper = mount(Harness, { attachTo: document.body });
    await click("打开 A");
    await wrapper.get("input").setValue("临时内容");
    await wrapper.get("input").trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(document.activeElement).toBe(button("打开 A").element);
    await click("打开 A");
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("A");
    await click("关闭面板");
    expect(document.activeElement).toBe(button("打开 A").element);
    await click("打开 B");
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("B");
  });
});
