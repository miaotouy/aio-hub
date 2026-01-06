import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";

// Varlet 样式
import "@varlet/ui/es/style";

// 自定义主题灵魂
import "./assets/styles/theme.css";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

app.mount("#app");
