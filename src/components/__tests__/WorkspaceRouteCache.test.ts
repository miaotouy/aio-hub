// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import {
  defineComponent,
  h,
  nextTick,
  onUnmounted,
  onMounted,
  onScopeDispose,
  ref,
  type VNode,
} from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  type RouteLocationNormalizedLoaded,
} from "vue-router";
import { afterEach, describe, expect, it } from "vitest";
import WorkspaceRouteCache from "../WorkspaceRouteCache.vue";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function workspace(initial = "/tool-a") {
  const released: number[] = [];
  let instances = 0;
  // 两个路由共用组件，组件名也与路由名不同。
  const createPage = (name: string) =>
    defineComponent({
      name,
      props: { label: String },
      setup(props) {
        const id = ++instances;
        const count = ref(0);
        onUnmounted(() => released.push(id));
        return () =>
          h(
            "button",
            { onClick: () => count.value++ },
            [props.label, String(id), String(count.value)].join(":")
          );
      },
    });
  const Page = createPage("SharedEditor");
  const Home = createPage("HomePage");
  const Settings = createPage("PreferencesPage");
  const cachedKeys = ref(["/", "/tool-a", "/tool-b"]);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ["/", "/tool-a", "/tool-b", "/settings"].map((path) => ({
      path,
      component: path === "/" ? Home : path === "/settings" ? Settings : Page,
      props: (route) => ({ label: String(route.query.label || path) }),
    })),
  });
  await router.push(initial);
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(
          RouterView,
          {},
          {
            default: ({
              Component,
              route,
            }: {
              Component: VNode;
              route: RouteLocationNormalizedLoaded;
            }) =>
              h(WorkspaceRouteCache, {
                component: Component,
                cacheKey: route.path,
                cachedKeys: cachedKeys.value,
              }),
          }
        ),
    }),
    { global: { plugins: [router] } }
  );
  cleanups.push(() => wrapper.unmount());
  await flushPromises();
  async function go(path: string) {
    await router.push(path);
    await flushPromises();
  }
  async function retain(paths: string[]) {
    cachedKeys.value = paths;
    await nextTick();
  }
  return { wrapper, released, go, retain };
}

describe("workspace route lifecycle", () => {
  it("preserves each open workspace while switching and updates route props", async () => {
    const { wrapper, released, go } = await workspace();
    await wrapper.get("button").trigger("click");
    const first = wrapper.text();
    await go("/tool-b");
    expect(wrapper.text()).not.toBe(first);
    await go("/tool-a");
    expect(wrapper.text()).toBe(first);
    await go("/");
    await go("/tool-a");
    expect(wrapper.text()).toBe(first);
    await go("/tool-a?label=updated");
    expect(wrapper.text()).toBe("updated:1:1");
    expect(released).toEqual([]);
  });

  it("releases a closed inactive tool and opens a fresh workspace", async () => {
    const { wrapper, released, go, retain } = await workspace();
    await wrapper.get("button").trigger("click");
    await go("/tool-b");
    await retain(["/", "/tool-b"]);
    expect(released).toEqual([1]);
    // 另一个使用同一组件的工具继续保留。
    expect(wrapper.text()).toBe("/tool-b:2:0");
    await retain(["/", "/tool-a", "/tool-b"]);
    await go("/tool-a");
    expect(wrapper.text()).toBe("/tool-a:3:0");
    await go("/tool-b");
    expect(wrapper.text()).toBe("/tool-b:2:0");
  });

  it("releases the active tool on close and navigation", async () => {
    const { released, go, retain } = await workspace();
    await retain(["/"]);
    await go("/");
    expect(released).toEqual([1]);
  });

  it("clears multiple tools while retaining the home workspace", async () => {
    const { wrapper, released, go, retain } = await workspace("/");
    await wrapper.get("button").trigger("click");
    await go("/tool-a");
    await go("/tool-b");
    await retain(["/"]);
    await go("/");
    expect(released.sort()).toEqual([2, 3]);
    expect(wrapper.text()).toBe("/:1:1");
  });

  it("unmounts settings on leaving regardless of its component name", async () => {
    const { wrapper, released, go } = await workspace("/settings");
    await go("/");
    expect(released).toEqual([1]);
    await go("/settings");
    expect(wrapper.text()).toBe("/settings:3:0");
  });
  it("disposes a closed async workspace before its setup completes", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let disposed = false;
    let mounted = false;
    const AsyncPage = defineComponent({
      async setup() {
        onScopeDispose(() => {
          disposed = true;
        });
        onMounted(() => {
          mounted = true;
        });
        await pending;
        return () => h("div", "late workspace");
      },
    });
    const wrapper = mount(WorkspaceRouteCache, {
      props: {
        component: h(AsyncPage),
        cacheKey: "/pending",
        cachedKeys: ["/pending"],
      },
    });
    cleanups.push(() => wrapper.unmount());
    await wrapper.setProps({
      component: h(defineComponent({ render: () => h("div", "home") })),
      cacheKey: "/",
      cachedKeys: ["/"],
    });
    await nextTick();
    expect(disposed).toBe(true);
    finish();
    await flushPromises();
    expect(mounted).toBe(false);
    expect(wrapper.text()).toBe("home");
  });
});
