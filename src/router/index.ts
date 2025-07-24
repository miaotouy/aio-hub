import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import HomePage from '../components/HomePage.vue';
import RegexApplier from '../components/RegexApplier.vue';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Home',
    component: HomePage,
  },
  {
    path: '/regex-applier',
    name: 'RegexApplier',
    component: RegexApplier, // 直接导入组件
  },
  // 后续会添加其他工具的路由
  // {
  //   path: '/media-info-reader',
  //   name: 'MediaInfoReader',
  //   component: () => import('../components/MediaInfoReader.vue'),
  // },
  // {
  //   path: '/text-diff',
  //   name: 'TextDiff',
  //   component: () => import('../components/TextDiff.vue'),
  // },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;