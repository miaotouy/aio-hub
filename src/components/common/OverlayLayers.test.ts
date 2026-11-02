// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import { DOMWrapper, mount, flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, ref, nextTick } from "vue";
import { ElSelect, ElOption, ElMessageBox } from "element-plus";
import BaseDialog from "./BaseDialog.vue";
import { resetDialogZIndexCounter } from "@/composables/useDialogZIndex";

vi.mock("@/composables/useThemeAppearance", () => ({
  useThemeAppearance: () => ({ appearanceSettings: ref({}) }),
}));

const wrappers: ReturnType<typeof mount>[] = [];
afterEach(async () => {
  ElMessageBox.close();
  wrappers.reverse().forEach((wrapper) => wrapper.unmount());
  wrappers.length = 0;
  await flushPromises();
  document.body.replaceChildren();
  resetDialogZIndexCounter();
});

function openDialog(zIndex = 0, content?: () => ReturnType<typeof h>) {
  const wrapper = mount(BaseDialog, {
    attachTo: document.body,
    props: { modelValue: true, zIndex, enableTransition: false },
    slots: content ? { default: content } : {},
    global: { directives: { loading: () => undefined } },
  });
  wrappers.push(wrapper);
  return wrapper;
}
const layer = (element: Element) => Number(getComputedStyle(element).zIndex);

describe("overlay stacking", () => {
  // 保护真实 Select / MessageBox 与自定义弹窗交替打开的层级契约。
  it("keeps a dialog's select and confirmation above it, then raises a nested dialog", async () => {
    openDialog(4100, () =>
      h(
        ElSelect,
        { modelValue: "a" },
        {
          default: () => h(ElOption, { label: "选项", value: "a" }),
        }
      )
    );
    await nextTick();
    const dialog = document.querySelector(".base-dialog-backdrop")!;
    await new DOMWrapper(document.body)
      .get(".el-select__wrapper")
      .trigger("click");
    await flushPromises();
    const dropdown = document.querySelector(".el-select__popper")!;
    expect(dropdown).not.toBeNull();
    expect(layer(dropdown)).toBeGreaterThan(layer(dialog));

    ElMessageBox.confirm("确认操作", { lockScroll: false }).catch(() => {});
    await flushPromises();
    const overlay = document.querySelector(".el-overlay")!;
    expect(layer(overlay)).toBeGreaterThan(layer(dropdown));

    openDialog();
    await nextTick();
    const dialogs = document.querySelectorAll(".base-dialog-backdrop");
    expect(layer(dialogs[1])).toBeGreaterThan(layer(overlay));
    ElMessageBox.close();
  });

  it("ignores an overlay kept beneath a hidden ancestor when allocating a new dialog", async () => {
    const parent = document.createElement("div");
    parent.hidden = true;
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.style.zIndex = "9000";
    parent.append(overlay);
    document.body.append(parent);
    openDialog();
    await nextTick();
    expect(
      layer(document.querySelector(".base-dialog-backdrop")!)
    ).toBeLessThan(9000);
  });
});
