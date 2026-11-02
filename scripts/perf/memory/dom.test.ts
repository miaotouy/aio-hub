// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it } from "vitest";
import { collectDomCensus } from "./dom";

afterEach(() => {
  document.body.replaceChildren();
  delete (
    globalThis as typeof globalThis & { __aioMemoryDomRoot?: WeakRef<Element> }
  ).__aioMemoryDomRoot;
});

// Protects attribution accuracy: nested categories count each descendant once and never export content/IDs.
it("counts nested list subtrees without double-counting and follows a weakly retained inactive chat", () => {
  document.body.innerHTML =
    '<main class="llm-chat-wrapper"><aside class="sessions-sidebar"><div class="session-item">private-session-title</div></aside><section class="message-list-container"><article class="message-slot" data-role="assistant" data-message-id="private-id"><div class="rich-text-renderer"><ul><li>private-body<ul><li>nested-body</li></ul></li></ul><table><tbody><tr><td>cell</td></tr></tbody></table></div></article></section></main>';
  const active = collectDomCensus();
  expect(active.chatConnected).toBe(true);
  expect(active.chat!.groups.lists).toMatchObject({
    roots: 2,
    outermostRoots: 1,
    nodes: 6,
  });
  expect(active.layout!.groups.sessionItems.roots).toBe(1);
  expect(active.chat!.messages).toMatchObject([
    { index: 0, role: "assistant", tables: 1, listItems: 2 },
  ]);
  expect(active.chat!.nodes).toBe(
    active.chat!.elements + active.chat!.textNodes + active.chat!.comments
  );
  expect(JSON.stringify(active)).not.toMatch(
    /private-body|private-id|private-session-title|nested-body/
  );
  const cached = document.querySelector("main")!;
  cached.remove();
  const inactive = collectDomCensus();
  expect(inactive.chatConnected).toBe(false);
  expect(inactive.chat!.nodes).toBe(active.chat!.nodes);
  expect(inactive.document.groups.richText.roots).toBe(0);
  expect(inactive.layout!.groups.sessionItems.roots).toBe(1);
  expect(
    (globalThis as typeof globalThis & { __aioMemoryDomRoot: WeakRef<Element> })
      .__aioMemoryDomRoot
  ).toBeInstanceOf(WeakRef);
});

// Portal subtrees must be attributed independently; a nested dropdown is outside its toolbar's DOM.
it("attributes unopened teleported message menus without merging their distinct subtrees", () => {
  document.body.innerHTML =
    '<div class="message-menubar"></div><div class="el-popper llm-chat-message-toolbar-popover" style="display:none"><div>action</div></div><div class="el-popper" style="display:none"><div class="translation-mode-switch">mode</div></div><div class="el-popper llm-chat-branch-selector-popover" style="display:none"></div>';
  const groups = collectDomCensus().document.groups;
  expect(groups.messageMorePoppers).toMatchObject({
    roots: 1,
    nodes: 3,
    inlineHiddenRoots: 1,
  });
  expect(groups.messageTranslationPoppers).toMatchObject({
    roots: 1,
    nodes: 3,
    inlineHiddenRoots: 1,
  });
  expect(groups.messageBranchPoppers).toMatchObject({
    roots: 1,
    nodes: 1,
    inlineHiddenRoots: 1,
  });
  expect(groups.poppers.nodes).toBe(7);
});
