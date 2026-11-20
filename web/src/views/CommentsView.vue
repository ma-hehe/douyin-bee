<template>
  <div>
    <div class="page-header">
      <div>
        <h2 class="page-title">评论数据</h2>
        <div class="page-subtitle">按视频、关键词、时间等条件检索已采集的评论，并可导出为 Excel</div>
      </div>
      <div class="header-actions">
        <el-button :icon="Download" type="primary" @click="openExport">导出 Excel</el-button>
      </div>
    </div>

    <!-- 筛选区 -->
    <div class="panel panel--pad" style="margin-bottom: 16px">
      <el-form :inline="true" class="filter-form">
        <el-form-item label="视频">
          <el-select
            v-model="query.videoId"
            placeholder="全部视频"
            clearable
            filterable
            style="width: 240px"
            @change="onSearch"
          >
            <el-option v-for="v in videoOptions" :key="v.id" :label="v.title" :value="v.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            placeholder="评论内容 / 昵称"
            clearable
            style="width: 180px"
            @keyup.enter="onSearch"
          />
        </el-form-item>
        <el-form-item label="时间">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 250px"
            @change="onSearch"
          />
        </el-form-item>
        <el-form-item label="归属地">
          <el-select v-model="query.ipLabel" placeholder="全部" clearable style="width: 120px" @change="onSearch">
            <el-option v-for="ip in ipOptions" :key="ip" :label="ip" :value="ip" />
          </el-select>
        </el-form-item>
        <el-form-item label="点赞">
          <el-input-number v-model="query.minDigg" :min="0" :controls="false" placeholder="最小" style="width: 88px" />
          <span class="range-sep">-</span>
          <el-input-number v-model="query.maxDigg" :min="0" :controls="false" placeholder="最大" style="width: 88px" />
        </el-form-item>
        <el-form-item label="范围">
          <el-select v-model="query.replies" style="width: 130px" @change="onSearch">
            <el-option :value="''" label="仅一级评论" />
            <el-option value="include" label="含二级回复" />
            <el-option value="only" label="仅二级回复" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-select v-model="sortKey" style="width: 130px" @change="onSortChange">
            <el-option value="time_desc" label="时间最新" />
            <el-option value="time_asc" label="时间最早" />
            <el-option value="digg_desc" label="点赞最多" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
          <el-button :icon="RefreshLeft" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 数据表 -->
    <div class="panel panel--pad">
      <div class="table-head">
        <span class="muted">共 <b class="count">{{ formatNumber(total) }}</b> 条评论</span>
      </div>

      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        :empty-text="loading ? ' ' : '没有符合条件的评论数据'"
        @row-click="toggle"
      >
        <el-table-column type="expand" width="40">
          <template #default="{ row }">
            <div class="reply-box" @click.stop>
              <div v-loading="replyLoading[row.id]" class="reply-inner">
                <div v-if="!(replies[row.id]?.length)" class="muted reply-empty">
                  {{ row.replyCount > 0 ? '正在加载回复…' : '该评论暂无回复' }}
                </div>
                <div v-for="r in replies[row.id]" :key="r.id" class="reply-line">
                  <el-avatar :size="24" class="reply-avatar">{{ (r.userNickname || '匿').slice(0, 1) }}</el-avatar>
                  <div class="reply-body">
                    <div class="reply-top">
                      <span class="reply-name">{{ r.userNickname || '匿名用户' }}</span>
                      <span class="muted">{{ r.ipLabel }}</span>
                      <span class="muted">{{ r.createTimeText }}</span>
                    </div>
                    <div class="reply-text">{{ r.text }}</div>
                    <div class="reply-stats muted">
                      <el-icon><Pointer /></el-icon>{{ formatNumber(r.diggCount) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="评论内容" min-width="360">
          <template #default="{ row }">
            <div class="comment-main">
              <div class="comment-top">
                <el-tag v-if="row.isHot" type="danger" effect="plain" size="small" round>热门</el-tag>
                <span class="nickname">{{ row.userNickname || '匿名用户' }}</span>
                <span class="ip muted" v-if="row.ipLabel">{{ row.ipLabel }}</span>
                <span class="muted time">{{ row.createTimeText }}</span>
              </div>
              <div class="comment-text">{{ row.text }}</div>
              <div v-if="row.replyCount" class="reply-count">
                <el-icon><ChatLineSquare /></el-icon>
                有 {{ formatNumber(row.replyCount) }} 条回复<span class="muted"> · 点击展开</span>
              </div>
              <div v-else class="no-reply muted">暂无回复</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="点赞" width="90" align="center">
          <template #default="{ row }">
            <span class="digg"><el-icon><Pointer /></el-icon>{{ formatNumber(row.diggCount) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="所属视频" min-width="180">
          <template #default="{ row }">
            <span class="text-ellipsis video-name" :title="row.videoTitle || row.awemeId">
              {{ row.videoTitle || row.awemeId }}
            </span>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 100, 200]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="load"
        @size-change="onSearch"
      />
    </div>

    <!-- 导出对话框 -->
    <el-dialog v-model="exportVisible" title="导出评论数据" width="520px">
      <el-form label-position="top">
        <el-form-item label="导出范围">
          <el-radio-group v-model="exportScope">
            <el-radio value="current">当前筛选的视频</el-radio>
            <el-radio value="pick">指定视频</el-radio>
            <el-radio value="all">全部视频</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="exportScope === 'pick'" label="选择视频">
          <el-select v-model="exportVideoId" filterable placeholder="请选择视频" style="width: 100%">
            <el-option v-for="v in videoOptions" :key="v.id" :label="v.title" :value="v.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="是否包含二级回复">
          <el-switch v-model="exportReplies" active-text="包含回复" />
        </el-form-item>
        <el-form-item label="筛选条件">
          <span class="muted" style="font-size: 12.5px">
            {{ filterSummary }}
          </span>
        </el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" show-icon title="导出为 .xlsx 文件，包含评论数据与导出说明两个工作表" />
      <template #footer>
        <el-button @click="exportVisible = false">取消</el-button>
        <el-button type="primary" :loading="exporting" @click="doExport">开始导出</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  ChatLineSquare,
  Download,
  Pointer,
  RefreshLeft,
  Search,
} from '@element-plus/icons-vue';
import { commentApi, videoApi, type Comment, type VideoOption } from '@/api';
import { downloadFile } from '@/api/http';
import { formatNumber } from '@/utils/format';

const route = useRoute();

const rows = ref<Comment[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);

const videoOptions = ref<VideoOption[]>([]);
const ipOptions = ref<string[]>([]);
const dateRange = ref<[string, string] | null>(null);
const sortKey = ref('time_desc');

// 模板中 v-model 绑定了 query 的属性，必须用 ref 包裹（reactive 对象会被按 ref 解包）
const query = ref({
  videoId: undefined as number | undefined,
  keyword: '',
  from: '',
  to: '',
  ipLabel: '',
  minDigg: undefined as number | undefined,
  maxDigg: undefined as number | undefined,
  replies: '' as '' | 'only' | 'include',
  sort: 'time' as 'time' | 'digg',
  order: 'desc' as 'asc' | 'desc',
});

const replies = ref<Record<number, Comment[]>>({});
const replyLoading = ref<Record<number, boolean>>({});

/* ---------- 导出 ---------- */
const exportVisible = ref(false);
const exporting = ref(false);
const exportScope = ref<'current' | 'pick' | 'all'>('current');
const exportVideoId = ref<number | undefined>();
const exportReplies = ref(false);

const filterSummary = computed(() => {
  const q = query.value;
  const parts: string[] = [];
  if (q.keyword) parts.push(`关键词「${q.keyword}」`);
  if (dateRange.value) parts.push(`${dateRange.value[0]} ~ ${dateRange.value[1]}`);
  if (q.ipLabel) parts.push(`归属地 ${q.ipLabel}`);
  if (q.minDigg !== undefined || q.maxDigg !== undefined) {
    parts.push(`点赞 ${q.minDigg ?? 0}~${q.maxDigg ?? '不限'}`);
  }
  return parts.length ? parts.join('，') : '无（导出全部）';
});

async function load() {
  loading.value = true;
  try {
    const r = await commentApi.list({
      ...query.value,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = r.list;
    total.value = r.total;
    replies.value = {};
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  page.value = 1;
  void load();
}

function onSortChange() {
  const [sort, order] = sortKey.value.split('_') as ['time' | 'digg', 'asc' | 'desc'];
  query.value.sort = sort;
  query.value.order = order;
  onSearch();
}

function resetQuery() {
  query.value.videoId = undefined;
  query.value.keyword = '';
  query.value.ipLabel = '';
  query.value.minDigg = undefined;
  query.value.maxDigg = undefined;
  query.value.replies = '';
  dateRange.value = null;
  sortKey.value = 'time_desc';
  query.value.sort = 'time';
  query.value.order = 'desc';
  onSearch();
}

/** 展开行时加载二级回复 */
async function toggle(row: Comment, column?: { type?: string }) {
  void column;
  if (!row.replyCount || replies.value[row.id]?.length) return;
  replyLoading.value[row.id] = true;
  try {
    const r = await commentApi.replies(row.awemeId, row.commentId);
    replies.value[row.id] = r.list.filter((c) => c.commentId !== row.commentId);
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    replyLoading.value[row.id] = false;
  }
}

watch(dateRange, () => {
  query.value.from = dateRange.value?.[0] ?? '';
  query.value.to = dateRange.value?.[1] ?? '';
});

function openExport() {
  exportScope.value = query.value.videoId ? 'current' : 'all';
  exportVideoId.value = query.value.videoId;
  exportReplies.value = query.value.replies === 'include';
  exportVisible.value = true;
}

async function doExport() {
  let videoId: number | undefined;
  if (exportScope.value === 'current') {
    videoId = query.value.videoId;
    if (!videoId) {
      ElMessage.warning('当前未筛选视频，请选择「指定视频」或「全部视频」');
      return;
    }
  } else if (exportScope.value === 'pick') {
    videoId = exportVideoId.value;
    if (!videoId) {
      ElMessage.warning('请选择要导出的视频');
      return;
    }
  }
  exporting.value = true;
  try {
    const q = query.value;
    const body = {
      scope: exportScope.value === 'all' ? 'all' : 'video',
      videoId,
      keyword: q.keyword,
      from: dateRange.value?.[0] ?? '',
      to: dateRange.value?.[1] ?? '',
      ipLabel: q.ipLabel,
      minDigg: q.minDigg,
      maxDigg: q.maxDigg,
      replies: exportReplies.value ? 'include' : '',
    };
    const name = await downloadFile('/api/comments/export', body, 'comments.xlsx');
    ElMessage.success(`已开始下载：${name}`);
    exportVisible.value = false;
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    exporting.value = false;
  }
}

onMounted(async () => {
  // 支持从素材页带 videoId 跳转
  const vid = route.query.videoId;
  if (vid) query.value.videoId = Number(vid);
  await load();
  try {
    videoOptions.value = await videoApi.options();
    ipOptions.value = await commentApi.ips();
  } catch {
    /* ignore */
  }
});
</script>

<style scoped>
.header-actions {
  display: flex;
  gap: 10px;
}

.filter-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
}
.filter-form :deep(.el-form-item) {
  margin-bottom: 12px;
  margin-right: 8px;
}
.range-sep {
  margin: 0 6px;
  color: var(--text-3);
}

.table-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 13px;
}
.count {
  color: var(--brand-600);
}

.comment-main {
  padding: 4px 0;
}
.comment-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12.5px;
}
.nickname {
  font-weight: 600;
  color: var(--brand-600);
}
.ip {
  padding: 0 6px;
  border-radius: 6px;
  background: var(--bg-soft);
  font-size: 11.5px;
}
.time {
  font-size: 11.5px;
}
.comment-text {
  margin-top: 6px;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--text-1);
  white-space: pre-wrap;
  word-break: break-word;
}
.reply-count {
  margin-top: 6px;
  font-size: 12px;
  color: var(--brand-500);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.no-reply {
  margin-top: 6px;
  font-size: 12px;
}

.digg {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-2);
  font-size: 13px;
}

.video-name {
  display: block;
  font-size: 12.5px;
  color: var(--text-2);
}

.reply-box {
  background: var(--bg-soft);
  border-radius: 10px;
  padding: 10px 14px;
  margin: 2px 0;
}
.reply-inner {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.reply-empty {
  font-size: 12.5px;
  text-align: center;
  padding: 12px 0;
}
.reply-line {
  display: flex;
  gap: 10px;
}
.reply-avatar {
  background: linear-gradient(135deg, #a5b4fc, #818cf8);
  color: #fff;
  font-size: 11px;
  flex-shrink: 0;
}
.reply-body {
  flex: 1;
  min-width: 0;
}
.reply-top {
  display: flex;
  gap: 8px;
  font-size: 12px;
  flex-wrap: wrap;
}
.reply-name {
  font-weight: 600;
  color: var(--text-1);
}
.reply-text {
  margin-top: 2px;
  font-size: 13px;
  color: var(--text-1);
  word-break: break-word;
  white-space: pre-wrap;
}
.reply-stats {
  margin-top: 2px;
  font-size: 11.5px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

:deep(.el-table__row) {
  cursor: pointer;
}
</style>
