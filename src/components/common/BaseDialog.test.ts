import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, onMounted, ref } from "vue";
import BaseDialog from "./BaseDialog.vue";

vi.mock("@/composables/useThemeAppearance", () => ({
  useThemeAppearance: () => ({ appearanceSettings: ref({}) }),
}));

const wrappers: ReturnType<typeof mount>[] = [];
function openDialog(modelValue = true, content = "<button>操作</button>") {
  const wrapper = mount(BaseDialog, {
    attachTo: document.body,
    props: { modelValue, enableTransition: false },
    slots: { default: content },
    global: { directives: { loading: () => undefined } },
  });
  wrappers.push(wrapper);
  return wrapper;
}
function focusTrigger() {
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  return trigger;
}
function key(key: string, shiftKey = false) {
  const event = new KeyboardEvent("keydown", {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement?.dispatchEvent(event);
  return event;
}

afterEach(() => {
  wrappers.reverse().forEach((wrapper) => wrapper.unmount());
  wrappers.length = 0;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("BaseDialog keyboard focus", () => {
  it("takes focus on initial mount and returns it when closed or reopened", async () => {
    const trigger = focusTrigger();
    const wrapper = openDialog();
    await nextTick();
    expect(document.activeElement).toBe(
      document.querySelector('[role="dialog"]')
    );
    await wrapper.setProps({ modelValue: false });
    expect(document.activeElement).toBe(trigger);
    await wrapper.setProps({ modelValue: true });
    await nextTick();
    expect(document.activeElement).toBe(
      document.querySelector('[role="dialog"]')
    );
    wrapper.unmount();
    expect(document.activeElement).toBe(trigger);
    wrappers.pop();
  });

  it("keeps Tab within visible enabled controls in either direction", async () => {
    focusTrigger();
    openDialog(
      true,
      "<button disabled>禁用</button><button hidden>隐藏</button><button data-last>末项</button>"
    );
    await nextTick();
    const first = document.querySelector<HTMLElement>(".dialog-close-btn")!;
    const last = document.querySelector<HTMLElement>("[data-last]")!;
    expect(key("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    key("Tab", true);
    expect(document.activeElement).toBe(last);
    key("Tab");
    expect(document.activeElement).toBe(first);
  });

  it("focuses the content's autofocus target for immediate keyboard interaction", async () => {
    focusTrigger();
    openDialog(true, '<div tabindex="0" autofocus>播放器</div>');
    await nextTick();
    expect(document.activeElement).toBe(document.querySelector("[autofocus]"));
  });

  it("preserves focus deliberately set by the dialog content", async () => {
    const Content = defineComponent({
      setup() {
        const input = ref<HTMLInputElement>();
        onMounted(() => input.value?.focus());
        return { input };
      },
      template: '<input ref="input" />',
    });
    const wrapper = mount(BaseDialog, {
      attachTo: document.body,
      props: { modelValue: true },
      slots: { default: Content },
      global: { directives: { loading: () => undefined } },
    });
    wrappers.push(wrapper);
    await nextTick();
    expect(document.activeElement).toBe(document.querySelector("input"));
  });

  it("closes only the focused nested dialog on Escape and restores the parent control", async () => {
    vi.useFakeTimers();
    focusTrigger();
    const parent = openDialog();
    await nextTick();
    const parentButton =
      document.querySelector<HTMLElement>(".dialog-close-btn")!;
    parentButton.focus();
    const child = openDialog();
    await nextTick();
    key("Escape");
    await vi.advanceTimersByTimeAsync(0);
    expect(child.emitted("close")).toHaveLength(1);
    expect(parent.emitted("close")).toBeUndefined();
    await child.setProps({ modelValue: false });
    expect(document.activeElement).toBe(parentButton);
  });

  it("lets an inner control consume Escape before the dialog", async () => {
    vi.useFakeTimers();
    const wrapper = openDialog();
    await nextTick();
    const button = document.querySelector<HTMLElement>(".dialog-close-btn")!;
    button.addEventListener("keydown", (event) => event.preventDefault());
    (button as HTMLElement).focus();
    key("Escape");
    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("preserves focus deliberately moved elsewhere before the dialog closes", async () => {
    focusTrigger();
    const wrapper = openDialog();
    await nextTick();
    const other = focusTrigger();
    await wrapper.setProps({ modelValue: false });
    expect(document.activeElement).toBe(other);
  });
});
