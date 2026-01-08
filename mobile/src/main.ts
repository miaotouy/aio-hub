import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import i18n from "./i18n";

// Varlet 样式
import "@varlet/ui/es/style";

// 应用自身主题
import "./assets/styles/theme.css";

function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  app.use(router);
  app.use(i18n);

  app.mount("#app");
}

bootstrap();
