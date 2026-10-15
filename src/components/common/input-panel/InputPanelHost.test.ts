// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { afterEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, nextTick, ref, type PropType } from "vue";
import InputPanelHost from "@/components/common/input-panel/InputPanelHost.vue";
import {
  provideInputPanel,
  type InputPanelRepeatClickAction,
} from "@/composables/useInputPanel";

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
  components: { InputPanelHost },
  props: {
    repeatClickAction: {
      type: String as PropType<InputPanelRepeatClickAction>,
      default: "collapse",
    },
  },
  setup(props) {
    const panel = provideInputPanel(() => props.repeatClickAction);
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
      <InputPanelHost v-if="activePanel"
        :panel="activePanel" :content-id="contentId"
        v-model:collapsed="collapsed" @close="panel.close(true)">
        <component :is="activePanel.component" :key="activePanel.id" v-bind="activePanel.props" />
      </InputPanelHost>
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
  // Protects configurable trigger behavior independently of title controls and panel layout.
  it("folds on repeated trigger clicks by default and restores the current edits", async () => {
    wrapper = mount(Harness, { attachTo: document.body });
    await click("打开 A");
    await wrapper.get("input").setValue("保留搜索");
    await click("打开 A");
    expect(wrapper.get("input").isVisible()).toBe(false);
    await click("打开 A");
    expect(wrapper.get("input").isVisible()).toBe(true);
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe(
      "保留搜索"
    );
  });

  it("applies close mode immediately, reopens folded panels, and releases edits on close", async () => {
    wrapper = mount(Harness, { attachTo: document.body });
    await click("打开 A");
    await wrapper.get("input").setValue("临时搜索");
    await wrapper.setProps({ repeatClickAction: "close" });
    await click("折叠面板");
    await click("打开 A");
    expect(wrapper.get("input").isVisible()).toBe(true);
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe(
      "临时搜索"
    );
    await click("打开 B");
    await click("打开 A");
    await wrapper.get("input").setValue("即将释放");
    await click("打开 A");
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.findComponent(InputPanelHost).exists()).toBe(false);
    expect(document.activeElement).toBe(button("打开 A").element);
    await click("打开 A");
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("A");
    await wrapper.setProps({ repeatClickAction: "collapse" });
    await click("打开 A");
    expect(wrapper.get("input").isVisible()).toBe(false);
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      "草稿保留"
    );
  });

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

  // Fixed regions share the host's visibility and keyboard/focus contract.
  it("folds all named regions together and handles focus and Escape from the footer", async () => {
    wrapper = mount(InputPanelHost, {
      attachTo: document.body,
      props: {
        panel: { id: "fixed-controls", title: "面板", component: LocalEditor },
        contentId: "fixed-controls-content",
        collapsed: false,
      },
      slots: {
        controls: '<input aria-label="筛选内容" />',
        default: '<button aria-label="选择项目">选择</button>',
        footer: '<button aria-label="底部操作">操作</button>',
      },
    });
    await nextTick();
    const filter = wrapper.get('input[aria-label="筛选内容"]');
    const footer = button("底部操作");
    expect(document.activeElement).toBe(filter.element);
    await filter.setValue("保留筛选");
    (footer.element as HTMLButtonElement).focus();
    await wrapper.setProps({ collapsed: true });
    expect(document.activeElement).toBe(button("展开面板").element);
    expect(filter.isVisible()).toBe(false);
    expect(button("选择项目").isVisible()).toBe(false);
    expect(footer.isVisible()).toBe(false);
    await wrapper.setProps({ collapsed: false });
    expect(filter.isVisible()).toBe(true);
    expect(footer.isVisible()).toBe(true);
    expect((filter.element as HTMLInputElement).value).toBe("保留筛选");
    await footer.trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
