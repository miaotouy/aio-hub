import { createApp } from "vue";
import App from "./App.vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import router from "./router"; // 从 ./router/index.ts 导入
import './styles/index.css'; // 导入全局样式，稍后创建

createApp(App)
  .use(ElementPlus)
  .use(router)
  .mount("#app");
