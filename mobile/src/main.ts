import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

// Varlet 样式
import "@varlet/ui/es/style";
import "@varlet/touch-emulator"; // 适配桌面端调试触摸事件

// 自定义主题灵魂
import "./assets/styles/theme.css";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);

app.mount("#app");
