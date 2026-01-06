export default {
  id: "ui-tester",
  name: "UI 组件测试",
  icon: "Component",
  route: {
    path: "/tools/ui-tester",
    name: "UiTester",
    component: () => import("./views/UiTesterView.vue"),
    meta: { title: "UI 组件测试" },
  },
};