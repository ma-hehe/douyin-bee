<template>
  <div class="layout">
    <!-- 侧边栏 -->
    <aside class="sidebar" :class="{ 'is-collapsed': app.collapsed }">
      <div class="brand">
        <div class="brand-logo">
          <svg viewBox="0 0 32 32" width="26" height="26">
            <rect width="32" height="32" rx="9" fill="url(#lg)" />
            <defs>
              <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#8B5CF6" />
                <stop offset="1" stop-color="#6366F1" />
              </linearGradient>
            </defs>
            <path
              d="M11 9h3.2v9.4a2.4 2.4 0 1 0 2.4-2.4c-.2 0-.4 0-.6.1V12.8a5.6 5.6 0 1 1-5 5.56V9z"
              fill="#fff"
            />
          </svg>
        </div>
        <transition name="fade-slide">
          <div v-show="!app.collapsed" class="brand-text">
            <div class="brand-name">抖音评论采集</div>
            <div class="brand-sub">Douyin Bee Console</div>
          </div>
        </transition>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="app.collapsed"
        :collapse-transition="false"
        class="side-menu"
        router
      >
        <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.title }}</template>
        </el-menu-item>
      </el-menu>

      <div class="sidebar-footer">
        <el-tooltip :content="app.collapsed ? '展开菜单' : '收起菜单'" placement="right">
          <el-button text class="collapse-btn" @click="app.toggleSidebar">
            <el-icon><component :is="app.collapsed ? 'Expand' : 'Fold'" /></el-icon>
          </el-button>
        </el-tooltip>
        <span v-show="!app.collapsed" class="version">v{{ version }}</span>
      </div>
    </aside>

    <!-- 主区域 -->
    <div class="main">
      <header class="topbar">
        <div class="crumb">
          <el-icon class="crumb-icon"><component :is="(route.meta.icon as string) || 'Menu'" /></el-icon>
          <span>{{ route.meta.title }}</span>
        </div>

        <div class="top-actions">
          <div class="scheduler-pill" :class="{ busy: scheduler.running }">
            <span class="dot" />
            <span v-if="scheduler.running">正在采集视频 #{{ scheduler.currentVideoId }}</span>
            <span v-else-if="scheduler.queue.length">队列中 {{ scheduler.queue.length }} 个视频</span>
            <span v-else>调度器空闲</span>
          </div>

          <el-tooltip :content="app.theme === 'dark' ? '切换浅色' : '切换深色'" placement="bottom">
            <el-button circle text @click="app.toggleTheme">
              <el-icon><component :is="app.theme === 'dark' ? 'Sunny' : 'Moon'" /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </header>

      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { statsApi, type SchedulerInfo } from '@/api';

const app = useAppStore();
const route = useRoute();

const menus = [
  { path: '/', title: '概览', icon: 'DataBoard' },
  { path: '/accounts', title: '账户管理', icon: 'User' },
  { path: '/videos', title: '视频素材', icon: 'VideoCamera' },
  { path: '/comments', title: '评论数据', icon: 'ChatDotSquare' },
];

const activeMenu = computed(() => route.path);
const scheduler = ref<SchedulerInfo>({ running: false, currentVideoId: null, queue: [] });
const version = ref('1.0.0');

let timer: number | undefined;

async function loadScheduler() {
  if (document.hidden) return;
  try {
    const o = await statsApi.overview();
    scheduler.value = o.scheduler;
  } catch {
    /* 静默失败，不打扰用户 */
  }
}

onMounted(async () => {
  await loadScheduler();
  timer = window.setInterval(loadScheduler, 8000);
  try {
    version.value = (await statsApi.version()).version;
  } catch {
    /* ignore */
  }
});

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ---------------- 侧边栏 ---------------- */
.sidebar {
  width: 232px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  transition: width 0.2s ease;
}
.sidebar.is-collapsed {
  width: 72px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 18px 14px;
  min-height: 72px;
}
.brand-logo {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.14), rgba(99, 102, 241, 0.14));
  flex-shrink: 0;
}
.brand-text {
  overflow: hidden;
}
.brand-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
  white-space: nowrap;
}
.brand-sub {
  font-size: 11px;
  color: var(--text-3);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.side-menu {
  border-right: none;
  flex: 1;
  padding: 4px 10px;
  background: transparent;
  --el-menu-item-height: 46px;
  --el-menu-bg-color: transparent;
  --el-menu-hover-bg-color: var(--bg-soft);
  --el-menu-text-color: var(--text-2);
  --el-menu-active-color: var(--brand-600);
}
.side-menu :deep(.el-menu-item) {
  border-radius: 11px;
  margin-bottom: 4px;
  font-weight: 500;
}
.side-menu :deep(.el-menu-item.is-active) {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.14), rgba(99, 102, 241, 0.06));
  color: var(--brand-600);
}
html.dark .side-menu :deep(.el-menu-item.is-active) {
  color: var(--brand-300);
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.28), rgba(99, 102, 241, 0.1));
}

.sidebar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 14px;
  border-top: 1px solid var(--border);
}
.collapse-btn {
  color: var(--text-3);
}
.version {
  font-size: 11px;
  color: var(--text-3);
}

/* ---------------- 主区域 ---------------- */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  height: 64px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: color-mix(in srgb, var(--bg-card) 82%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}

.crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
}
.crumb-icon {
  color: var(--brand-500);
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.scheduler-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-2);
  background: var(--bg-soft);
  border: 1px solid var(--border);
}
.scheduler-pill .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-3);
}
.scheduler-pill.busy {
  color: var(--brand-600);
}
.scheduler-pill.busy .dot {
  background: #22c55e;
  box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6);
  animation: pulse 1.6s infinite;
}
@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55);
  }
  70% {
    box-shadow: 0 0 0 7px rgba(34, 197, 94, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
}

.content {
  flex: 1;
  overflow: auto;
  padding: 22px 24px 40px;
}

@media (max-width: 900px) {
  .sidebar {
    width: 72px;
  }
  .brand-text {
    display: none;
  }
  .content {
    padding: 16px 14px 32px;
  }
  .topbar {
    padding: 0 14px;
  }
  .scheduler-pill {
    display: none;
  }
}
</style>
