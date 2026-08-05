// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useNotificationStore } from "../notification";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("app-notifications-initialized", "true");
  setActivePinia(createPinia());
});

describe("notification store stable entries", () => {
  it("upserts a stable notification without duplicating or resetting read state", () => {
    const store = useNotificationStore();
    store.upsert("release-notes:1.0.0:r1", {
      title: "Version 1",
      content: "Initial summary",
      type: "system",
    });
    store.markRead("release-notes:1.0.0:r1");
    store.upsert("release-notes:1.0.0:r1", {
      title: "Version 1",
      content: "Updated summary",
      type: "system",
    });

    expect(store.notifications).toHaveLength(1);
    expect(store.notifications[0]).toMatchObject({
      id: "release-notes:1.0.0:r1",
      content: "Updated summary",
      read: true,
    });
  });
});
