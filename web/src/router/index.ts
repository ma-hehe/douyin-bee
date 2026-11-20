import { createRouter, createWebHistory } from 'vue-router';
import AppLayout from '@/components/AppLayout.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { title: '概览', icon: 'DataBoard' },
        },
        {
          path: 'accounts',
          name: 'accounts',
          component: () => import('@/views/AccountsView.vue'),
          meta: { title: '账户管理', icon: 'User' },
        },
        {
          path: 'videos',
          name: 'videos',
          component: () => import('@/views/VideosView.vue'),
          meta: { title: '视频素材', icon: 'VideoCamera' },
        },
        {
          path: 'comments',
          name: 'comments',
          component: () => import('@/views/CommentsView.vue'),
          meta: { title: '评论数据', icon: 'ChatDotSquare' },
        },
      ],
    },
    // 已合并：旧任务页跳转到素材页
    { path: '/tasks', redirect: '/videos' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.afterEach((to) => {
  const title = (to.meta.title as string) || '';
  document.title = title ? `${title} · 抖音评论采集系统` : '抖音评论采集系统';
});

export default router;
