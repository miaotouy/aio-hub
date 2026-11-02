// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, reactive, ref } from "vue";
import LazyPanelHost from "../LazyPanelHost.vue";

const errors = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => errors,
}));
vi.mock("../BaseDialog.vue", () => ({
  default: defineComponent({
    emits: ["update:modelValue"],
    setup(_, { slots, emit }) {
      return () =>
        h("section", { role: "dialog" }, [
          slots.content?.(),
          h(
            "button",
            {
              "data-close": "",
              onClick: () => emit("update:modelValue", false),
            },
            "close"
          ),
        ]);
    },
  }),
}));
const Panel = defineComponent({
  props: { selected: String, modelValue: Boolean },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const count = ref(0);
    return () =>
      h(
        "article",
        {
          "data-selected": props.selected,
          "data-open": String(props.modelValue),
        },
        [
          h(
            "button",
            { "data-count": "", onClick: () => count.value++ },
            String(count.value)
          ),
          h("button", {
            "data-child-close": "",
            onClick: () => emit("update:modelValue", false),
          }),
        ]
      );
  },
});
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.clearAllMocks();
});
function setup(loader: () => Promise<{ default: typeof Panel }>) {
  const state = reactive({ open: false, selected: "first" });
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(LazyPanelHost, {
          open: state.open,
          loader,
          title: "panel",
          modelValue: state.open,
          selected: state.selected,
          "onUpdate:modelValue": (value: boolean) => {
            state.open = value;
          },
          onClose: () => {
            state.open = false;
          },
        }),
    })
  );
  wrappers.push(wrapper);
  return { state, wrapper };
}

// First open applies the latest target; closing/reopening retains local panel state and events.
it("loads on first open and preserves the panel across close and reopen", async () => {
  let finish!: (module: { default: typeof Panel }) => void;
  const loader = vi.fn(
    () =>
      new Promise<{ default: typeof Panel }>((resolve) => {
        finish = resolve;
      })
  );
  const { state, wrapper } = setup(loader);
  await flushPromises();
  expect(loader).not.toHaveBeenCalled();
  state.open = true;
  await flushPromises();
  state.selected = "latest";
  finish({ default: Panel });
  await flushPromises();
  expect(wrapper.get("article").attributes("data-selected")).toBe("latest");
  await wrapper.get("[data-count]").trigger("click");
  await wrapper.get("[data-child-close]").trigger("click");
  expect(state.open).toBe(false);
  state.open = true;
  await flushPromises();
  expect(wrapper.get("[data-count]").text()).toBe("1");
  expect(wrapper.get("article").attributes("data-open")).toBe("true");
  expect(loader).toHaveBeenCalledTimes(1);
});

// A failed chunk can be dismissed and retried while retaining the caller's target.
it("recovers a failed request and forwards the current panel props", async () => {
  const loader = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ default: Panel });
  const { state, wrapper } = setup(loader);
  state.open = true;
  await flushPromises();
  expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  await wrapper.get("[data-close]").trigger("click");
  expect(state.open).toBe(false);
  state.selected = "task-after-failure";
  state.open = true;
  await flushPromises();
  expect(wrapper.get("article").attributes("data-selected")).toBe(
    "task-after-failure"
  );
  expect(loader).toHaveBeenCalledTimes(2);
  expect(errors.handle).toHaveBeenCalledTimes(1);
});
