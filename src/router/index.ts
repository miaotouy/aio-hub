import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import HomePage from '../components/HomePage.vue';
import RegexApplier from '../components/RegexApplier.vue';
import MediaInfoReader from '../components/MediaInfoReader.vue';

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
  {
    path: '/media-info-reader',
    name: 'MediaInfoReader',
    component: MediaInfoReader,
  },
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