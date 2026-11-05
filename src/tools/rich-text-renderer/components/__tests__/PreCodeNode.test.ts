// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PreCodeNode from "../nodes/code-block/PreCodeNode.vue";

it("keeps source text and every logical line number when toggling wrapped preview", async () => {
  const content = "const value = '长行 🌿';\r\n\r\nlast line\r\n";
  const viewer = mount(PreCodeNode, {
    props: {
      content,
      theme: "codemirror",
      lineNumbers: true,
      wordWrapEnabled: false,
    },
  });
  const numbers = () =>
    viewer.findAll(".num").flatMap((n) => n.text().split(/\s+/));
  try {
    expect(viewer.get("code").element.textContent).toBe(content);
    expect(numbers()).toEqual(["1", "2", "3", "4"]);
    await viewer.setProps({ wordWrapEnabled: true });
    expect(viewer.get("code").element.textContent).toBe(
      content.replace(/\r\n?/g, "\n")
    );
    expect(numbers()).toEqual(["1", "2", "3", "4"]);
    await viewer.setProps({ content: "updated", wordWrapEnabled: false });
    expect(viewer.get("code").element.textContent).toBe("updated");
    expect(numbers()).toEqual(["1"]);
  } finally {
    viewer.unmount();
  }
});
