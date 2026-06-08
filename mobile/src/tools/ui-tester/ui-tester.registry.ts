export default {
  id: "ui-tester",
  name: "UI 组件测试",
  icon: { type: "text", value: "🧪" },
  description: "测试移动端 UI 组件与主题表现",
  route: {
    path: "/tools/ui-tester",
    name: "UiTester",
    component: () => import("./views/UiTesterView.vue"),
    meta: { title: "UI 组件测试" },
  },
};
