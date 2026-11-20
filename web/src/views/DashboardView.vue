<template>
  <div>
    <div class="page-header">
      <div>
        <h2 class="page-title">概览</h2>
        <div class="page-subtitle">采集系统运行状态与数据统计</div>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-grid">
      <StatCard label="抖音账户" :value="overview?.accounts ?? 0" icon="User" tone="brand" :hint="`可用 ${overview?.activeAccounts ?? 0} 个`" />
      <StatCard
        label="视频素材"
        :value="overview?.videos ?? 0"
        icon="VideoCamera"
        tone="sky"
        :hint="`已采集 ${overview?.successVideos ?? 0} · 未采集 ${overview?.idleVideos ?? 0}`"
      />
      <StatCard
        label="采集中"
        :value="(overview?.runningVideos ?? 0) + (overview?.pendingVideos ?? 0)"
        icon="List"
        tone="amber"
        :hint="`运行中 ${overview?.runningVideos ?? 0} · 排队 ${overview?.pendingVideos ?? 0} · 失败 ${overview?.failedVideos ?? 0}`"
      />
      <StatCard
        label="评论数据"
        :value="formatNumber(overview?.comments ?? 0)"
        icon="ChatDotSquare"
        tone="green"
        :hint="`一级 ${formatNumber(overview?.topLevel ?? 0)} · 回复 ${formatNumber(overview?.replies ?? 0)}`"
      />
    </div>

    <div class="grid-2col">
      <!-- 按视频分布 -->
      <div class="panel panel--pad">
        <div class="section-head">
          <h3>各视频评论数</h3>
          <el-button link type="primary" @click="router.push('/videos')">管理素材</el-button>
        </div>
        <div v-if="!overview?.byVideo?.length" class="empty">暂无数据</div>
        <div v-else class="video-rank">
          <div v-for="v in topVideos" :key="v.videoId" class="rank-item">
            <div class="rank-cover">
              <img v-if="v.coverUrl" :src="v.coverUrl" referrerpolicy="no-referrer" alt="" />
              <el-icon v-else><VideoCamera /></el-icon>
            </div>
            <div class="rank-body">
              <div class="rank-title text-ellipsis">{{ v.title || v.awemeId }}</div>
              <div class="rank-bar">
                <div class="rank-bar-inner" :style="{ width: barWidth(v.total) }" />
              </div>
            </div>
            <div class="rank-value">{{ formatNumber(v.total) }}</div>
          </div>
        </div>
      </div>

      <!-- 按天趋势 -->
      <div class="panel panel--pad">
        <div class="section-head">
          <h3>近 14 天评论趋势</h3>
        </div>
        <div v-if="!overview?.byDay?.length" class="empty">暂无数据</div>
        <div v-else class="trend">
          <div v-for="d in overview.byDay" :key="d.date" class="trend-col">
            <el-tooltip :content="`${d.date}：${d.total} 条`" placement="top">
              <div class="trend-bar" :style="{ height: trendHeight(d.total) }" />
            </el-tooltip>
            <div class="trend-label">{{ d.date.slice(5) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid-2col">
      <!-- 归属地分布 -->
      <div class="panel panel--pad">
        <div class="section-head">
          <h3>评论者归属地 Top 10</h3>
        </div>
        <div v-if="!overview?.byIp?.length" class="empty">暂无数据</div>
        <div v-else class="ip-list">
          <div v-for="(ip, i) in overview.byIp" :key="ip.ipLabel" class="ip-item">
            <span class="ip-index" :class="{ top: i < 3 }">{{ i + 1 }}</span>
            <span class="ip-name">{{ ip.ipLabel }}</span>
            <div class="ip-bar"><div class="ip-bar-inner" :style="{ width: ipWidth(ip.total) }" /></div>
            <span class="ip-value">{{ formatNumber(ip.total) }}</span>
          </div>
        </div>
      </div>

      <!-- 快捷操作 -->
      <div class="panel panel--pad">
        <div class="section-head">
          <h3>快捷操作</h3>
        </div>
        <div class="quick-actions">
          <div class="quick-item" @click="router.push('/accounts')">
            <div class="quick-icon brand"><el-icon :size="20"><User /></el-icon></div>
            <div>
              <div class="quick-title">添加采集账户</div>
              <div class="quick-sub">扫码登录抖音账户</div>
            </div>
          </div>
          <div class="quick-item" @click="router.push('/videos')">
            <div class="quick-icon sky"><el-icon :size="20"><VideoCamera /></el-icon></div>
            <div>
              <div class="quick-title">录入视频素材</div>
              <div class="quick-sub">粘贴分享链接即可</div>
            </div>
          </div>
          <div class="quick-item" @click="router.push('/videos')">
            <div class="quick-icon amber"><el-icon :size="20"><List /></el-icon></div>
            <div>
              <div class="quick-title">开始采集评论</div>
              <div class="quick-sub">在素材列表中启动与监控</div>
            </div>
          </div>
          <div class="quick-item" @click="router.push('/comments')">
            <div class="quick-icon green"><el-icon :size="20"><Download /></el-icon></div>
            <div>
              <div class="quick-title">查询 / 导出评论</div>
              <div class="quick-sub">支持 Excel 导出</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Download, List, User, VideoCamera } from '@element-plus/icons-vue';
import StatCard from '@/components/StatCard.vue';
import { statsApi, type Overview } from '@/api';
import { formatNumber } from '@/utils/format';

const router = useRouter();
const overview = ref<Overview | null>(null);
let timer: number | undefined;

const topVideos = computed(() => (overview.value?.byVideo ?? []).slice(0, 8));
const maxVideo = computed(() => Math.max(1, ...topVideos.value.map((v) => v.total)));
const maxIp = computed(() => Math.max(1, ...(overview.value?.byIp ?? []).map((v) => v.total)));
const maxDay = computed(() => Math.max(1, ...(overview.value?.byDay ?? []).map((v) => v.total)));

function barWidth(n: number) {
  return `${Math.max(3, (n / maxVideo.value) * 100)}%`;
}
function ipWidth(n: number) {
  return `${Math.max(3, (n / maxIp.value) * 100)}%`;
}
function trendHeight(n: number) {
  return `${Math.max(4, (n / maxDay.value) * 120)}px`;
}

async function load() {
  if (document.hidden) return;
  try {
    overview.value = await statsApi.overview();
  } catch {
    /* 静默 */
  }
}

onMounted(() => {
  void load();
  timer = window.setInterval(load, 10_000);
});
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.grid-2col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.section-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--text-1);
}

.empty {
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
  padding: 36px 0;
}

/* 视频排行 */
.video-rank {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rank-item {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rank-cover {
  width: 34px;
  height: 44px;
  border-radius: 7px;
  overflow: hidden;
  background: var(--bg-soft);
  display: grid;
  place-items: center;
  color: var(--text-3);
  flex-shrink: 0;
}
.rank-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.rank-body {
  flex: 1;
  min-width: 0;
}
.rank-title {
  font-size: 12.5px;
  color: var(--text-1);
  margin-bottom: 5px;
}
.rank-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--bg-soft);
  overflow: hidden;
}
.rank-bar-inner {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #818cf8, #6366f1);
  transition: width 0.4s ease;
}
.rank-value {
  width: 56px;
  text-align: right;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--brand-600);
  flex-shrink: 0;
}

/* 趋势 */
.trend {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 160px;
  padding-top: 8px;
}
.trend-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  height: 100%;
}
.trend-bar {
  width: 100%;
  max-width: 26px;
  border-radius: 6px 6px 3px 3px;
  background: linear-gradient(180deg, #818cf8, #6366f1);
  transition: height 0.4s ease;
  min-height: 4px;
}
.trend-label {
  font-size: 10.5px;
  color: var(--text-3);
  white-space: nowrap;
  transform: scale(0.9);
}

/* 归属地 */
.ip-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.ip-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
}
.ip-index {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  font-size: 11px;
  color: var(--text-3);
  background: var(--bg-soft);
  flex-shrink: 0;
}
.ip-index.top {
  background: var(--brand-50);
  color: var(--brand-600);
  font-weight: 700;
}
html.dark .ip-index.top {
  background: rgba(99, 102, 241, 0.2);
  color: var(--brand-300);
}
.ip-name {
  width: 70px;
  color: var(--text-1);
  flex-shrink: 0;
}
.ip-bar {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: var(--bg-soft);
  overflow: hidden;
}
.ip-bar-inner {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #34d399, #10b981);
}
.ip-value {
  width: 48px;
  text-align: right;
  color: var(--text-2);
  flex-shrink: 0;
}

/* 快捷操作 */
.quick-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.quick-item {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.18s ease;
}
.quick-item:hover {
  border-color: var(--brand-300);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}
.quick-icon {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.quick-icon.brand {
  background: rgba(99, 102, 241, 0.14);
  color: #6366f1;
}
.quick-icon.sky {
  background: rgba(14, 165, 233, 0.14);
  color: #0ea5e9;
}
.quick-icon.amber {
  background: rgba(245, 158, 11, 0.14);
  color: #f59e0b;
}
.quick-icon.green {
  background: rgba(16, 185, 129, 0.14);
  color: #10b981;
}
.quick-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-1);
}
.quick-sub {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 3px;
}

@media (max-width: 1200px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .grid-2col {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .stat-grid {
    grid-template-columns: 1fr;
  }
  .quick-actions {
    grid-template-columns: 1fr;
  }
}
</style>
