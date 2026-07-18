export default {
  id: "ui-tester",
  name: "组件与平台测试",
  icon: { type: "text", value: "🧪" },
  description: "验证移动端组件、平台文件与 SQLite 能力",
  route: {
    path: "/tools/ui-tester",
    name: "UiTester",
    component: () => import("./views/UiTesterView.vue"),
    meta: { title: "组件与平台测试" },
  },
};
