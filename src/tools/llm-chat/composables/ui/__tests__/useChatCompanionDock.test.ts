import { beforeEach, describe, expect, it } from "vitest";
import { useChatCompanionDock } from "../useChatCompanionDock";

describe("伴生分栏可用空间", () => {
  const dock = useChatCompanionDock();
  beforeEach(() => {
    dock.closeDock();
    dock.setHostWidth(0);
    dock.setDockWidth(420);
  });
  it("按宿主剩余宽度回退，并为主聊天保留480px", () => {
    dock.setHostWidth(416.67);
    dock.openDock("test");
    expect(dock.canDock.value).toBe(false);
    expect(dock.isDockVisible.value).toBe(false);
    expect(dock.dockWidth.value).toBe(0);
    dock.setHostWidth(900);
    expect(dock.isDockVisible.value).toBe(true);
    dock.setDockWidth(720);
    expect(dock.dockWidth.value).toBe(420);
    dock.setHostWidth(1200);
    expect(dock.dockWidth.value).toBe(720);
    dock.setHostWidth(839);
    expect(dock.isDockVisible.value).toBe(false);
  });
  it("只允许占用方收起分栏", () => {
    dock.setHostWidth(1200);
    dock.openDock("owner");
    dock.closeDock("other");
    expect(dock.isDockVisible.value).toBe(true);
    dock.closeDock("owner");
    expect(dock.isDockVisible.value).toBe(false);
  });
});
