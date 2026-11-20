<template>
  <div>
    <div class="page-header">
      <div>
        <h2 class="page-title">视频素材</h2>
        <div class="page-subtitle">
          录入并管理需要采集评论的视频 · 全局串行采集，当前队列 {{ scheduler.queue.length }} 个
        </div>
      </div>
      <div class="header-actions">
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">录入素材</el-button>
      </div>
    </div>

    <div class="panel panel--pad">
      <div class="filter-bar" style="margin-bottom: 16px">
        <el-input
          v-model="keyword"
          placeholder="搜索标题 / 视频ID / 作者 / 备注"
          :prefix-icon="Search"
          clearable
          style="max-width: 340px"
          @keyup.enter="onSearch"
          @clear="onSearch"
        />
        <el-button @click="onSearch">搜索</el-button>
      </div>

      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        :empty-text="loading ? ' ' : '还没有视频素材，点击「录入素材」开始'"
      >
        <el-table-column label="视频" min-width="300">
          <template #default="{ row }">
            <div class="video-cell">
              <div class="cover">
                <img v-if="row.coverUrl" :src="row.coverUrl" referrerpolicy="no-referrer" alt="" />
                <el-icon v-else :size="20"><VideoCamera /></el-icon>
              </div>
              <div class="video-meta">
                <div class="video-title text-ellipsis" :title="row.title || row.awemeId">
                  {{ row.title || '（未获取标题）' }}
                </div>
                <div class="video-sub">
                  <span class="mono">{{ row.awemeId }}</span>
                  <span v-if="row.authorName" class="dot-sep">·</span>
                  <span v-if="row.authorName">@{{ row.authorName }}</span>
                </div>
                <div v-if="row.remark" class="remark text-ellipsis">备注：{{ row.remark }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="点赞 / 评论" width="120">
          <template #default="{ row }">
            <div class="counts">
              <span><el-icon><Pointer /></el-icon>{{ formatNumber(row.diggCount) }}</span>
              <span><el-icon><ChatDotRound /></el-icon>{{ formatNumber(row.commentCount) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="采集状态" min-width="200">
          <template #default="{ row }">
            <div class="collect-cell">
              <el-tag :type="collectStatus(row.collectStatus).type" effect="light" round>
                <el-icon v-if="row.collectStatus === 'running'" class="is-loading" style="margin-right: 3px">
                  <Loading />
                </el-icon>
                {{ collectStatus(row.collectStatus).label }}
              </el-tag>
              <el-progress
                v-if="['running', 'paused', 'pending'].includes(row.collectStatus)"
                :percentage="progressOf(row)"
                :status="row.collectStatus === 'failed' ? 'exception' : undefined"
                :stroke-width="6"
                :show-text="false"
                class="row-progress"
              />
              <span class="collect-sub muted">
                已采 <b>{{ formatNumber(row.collected) }}</b> 条
                <template v-if="row.collectAccountNickname"> · 账户 {{ row.collectAccountNickname }}</template>
                <template v-if="row.collectReplies"> · 含二级回复</template>
              </span>
              <span v-if="row.collectStatus === 'failed' && row.collectError" class="err text-ellipsis" :title="row.collectError">
                {{ row.collectError }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="录入时间" width="140">
          <template #default="{ row }">
            <span class="muted">{{ formatTime(row.createdAt, 'YYYY-MM-DD HH:mm') }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <!-- 未在采集：开始采集 -->
            <el-button
              v-if="!['running', 'pending', 'paused'].includes(row.collectStatus)"
              link
              type="primary"
              @click="openCollect(row)"
            >
              {{ row.collectStatus === 'idle' ? '开始采集' : '重新采集' }}
            </el-button>
            <el-button v-if="['running', 'pending'].includes(row.collectStatus)" link type="warning" @click="act(row, 'pause')">
              暂停
            </el-button>
            <el-button v-if="row.collectStatus === 'paused'" link type="primary" @click="act(row, 'resume')">
              继续
            </el-button>
            <el-button v-if="['running', 'pending', 'paused'].includes(row.collectStatus)" link type="danger" @click="act(row, 'cancel')">
              取消
            </el-button>

            <el-button link type="primary" :disabled="!row.collected" @click="exportVideo(row)">导出评论</el-button>
            <el-button link type="primary" @click="viewComments(row)">查看评论</el-button>

            <el-dropdown trigger="click" @command="(cmd: string) => onCommand(cmd, row)">
              <el-button link type="primary">更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">编辑信息</el-dropdown-item>
                  <el-dropdown-item command="logs">采集日志</el-dropdown-item>
                  <el-dropdown-item command="delete" divided class="danger-item">删除素材</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="total > pageSize"
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="load"
      />
    </div>

    <!-- 录入素材 -->
    <el-dialog v-model="createVisible" title="录入视频素材" width="620px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="视频链接 / 分享文本 / 视频ID">
          <el-input
            v-model="createForm.raw"
            type="textarea"
            :rows="4"
            placeholder="粘贴抖音分享文本，例如：&#10;7.43 复制打开抖音，看看【xxx的作品】... https://v.douyin.com/xxxx/&#10;或直接填写视频ID：7500000000000000000"
          />
          <div class="muted form-hint">支持分享短链、完整视频链接、纯数字视频ID；多行内容将批量录入</div>
        </el-form-item>
        <el-form-item label="备注（可选）">
          <el-input v-model="createForm.remark" placeholder="例如：竞品A · 11月主推视频" />
        </el-form-item>

        <el-divider content-position="left">采集设置</el-divider>

        <div class="grid-2">
          <el-form-item label="采集账户">
            <el-select v-model="createForm.accountId" placeholder="自动选择可用账户" clearable style="width: 100%">
              <el-option
                v-for="a in accounts"
                :key="a.accountId"
                :label="a.nickname || a.accountId"
                :value="a.accountId"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="采集上限（一级评论，0 表示不限）">
            <el-input-number
              v-model="createForm.maxComments"
              :min="0"
              :step="100"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
        </div>
        <div class="grid-2">
          <el-form-item label="翻页间隔">
            <el-select v-model="createForm.intervalMs" style="width: 100%">
              <el-option :value="300" label="快速（300ms）" />
              <el-option :value="500" label="标准（500ms）" />
              <el-option :value="1000" label="保守（1s）" />
              <el-option :value="2000" label="极慢（2s，降低风控）" />
            </el-select>
          </el-form-item>
          <el-form-item label="二级回复">
            <div class="switch-row">
              <el-switch v-model="createForm.collectReplies" />
              <span class="muted switch-label">{{ createForm.collectReplies ? '采集每条评论下的回复' : '仅采集一级评论' }}</span>
            </div>
          </el-form-item>
        </div>

        <el-form-item>
          <el-checkbox v-model="createForm.autoCollect">录入后立即开始采集（创建即排队自动开始）</el-checkbox>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">确认录入</el-button>
      </template>
    </el-dialog>

    <!-- 编辑素材 -->
    <el-dialog v-model="editVisible" title="编辑视频素材" width="520px">
      <el-form label-position="top">
        <el-form-item label="标题">
          <el-input v-model="editForm.title" placeholder="视频文案" />
        </el-form-item>
        <el-form-item label="封面地址">
          <el-input v-model="editForm.coverUrl" placeholder="https://..." />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 开始采集 -->
    <el-dialog v-model="collectVisible" :title="collectTarget?.collectStatus === 'idle' ? '开始采集' : '重新采集'" width="460px">
      <div v-if="collectTarget" class="collect-target">
        <div class="cover small">
          <img v-if="collectTarget.coverUrl" :src="collectTarget.coverUrl" referrerpolicy="no-referrer" alt="" />
        </div>
        <div class="text-ellipsis">{{ collectTarget.title || collectTarget.awemeId }}</div>
      </div>
      <el-form label-position="top">
        <el-form-item label="采集账户">
          <el-select v-model="collectForm.accountId" placeholder="请选择采集账户" style="width: 100%">
            <el-option v-for="a in accounts" :key="a.accountId" :label="a.nickname || a.accountId" :value="a.accountId" />
          </el-select>
        </el-form-item>
        <el-form-item label="二级回复">
          <div class="switch-row">
            <el-switch v-model="collectForm.collectReplies" />
            <span class="muted switch-label">{{ collectForm.collectReplies ? '采集每条评论下的回复' : '仅采集一级评论' }}</span>
          </div>
        </el-form-item>
        <el-form-item label="采集上限（一级评论，0 表示不限）">
          <el-input-number v-model="collectForm.maxComments" :min="0" :step="100" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="翻页间隔">
          <el-select v-model="collectForm.intervalMs" style="width: 100%">
            <el-option :value="300" label="快速（300ms）" />
            <el-option :value="500" label="标准（500ms）" />
            <el-option :value="1000" label="保守（1s）" />
            <el-option :value="2000" label="极慢（2s，降低风控）" />
          </el-select>
        </el-form-item>
      </el-form>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="采集前会清空该视频的全部旧评论数据"
        style="margin-top: 4px"
      />
      <template #footer>
        <el-button @click="collectVisible = false">取消</el-button>
        <el-button type="primary" :loading="collecting" @click="submitCollect">开始采集</el-button>
      </template>
    </el-dialog>

    <!-- 采集日志 -->
    <el-drawer v-model="logsVisible" :title="`采集日志 · ${logTarget?.title || logTarget?.awemeId || ''}`" size="520px">
      <div class="log-toolbar">
        <el-tag v-if="logTarget" :type="collectStatus(logTarget.collectStatus).type" effect="light">
          {{ collectStatus(logTarget.collectStatus).label }}
        </el-tag>
        <span v-if="logTarget?.collectError" class="error-msg">{{ logTarget.collectError }}</span>
      </div>
      <div ref="logBox" class="log-box">
        <div v-if="!logs.length" class="muted" style="text-align: center; padding: 30px 0">暂无日志</div>
        <div v-for="l in logs" :key="l.id" class="log-line" :class="`level-${l.level}`">
          <span class="log-time">{{ l.createdAt.slice(11) }}</span>
          <span class="log-msg">{{ l.message }}</span>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import {
  ArrowDown,
  ChatDotRound,
  Loading,
  Plus,
  Pointer,
  Refresh,
  Search,
  VideoCamera,
} from '@element-plus/icons-vue';
import {
  accountApi,
  videoApi,
  type SchedulerInfo,
  type Video,
  type VideoLog,
} from '@/api';
import { downloadFile } from '@/api/http';
import { collectStatus, formatNumber, formatTime } from '@/utils/format';

const router = useRouter();

const rows = ref<Video[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const keyword = ref('');
const loading = ref(false);
const accounts = ref<{ accountId: string; nickname: string }[]>([]);
const scheduler = ref<SchedulerInfo>({ running: false, currentVideoId: null, queue: [] });

/* ---------- 录入 ---------- */
const createVisible = ref(false);
const creating = ref(false);
const createForm = ref({
  raw: '',
  remark: '',
  accountId: '',
  collectReplies: false, // 默认仅采集一级评论
  maxComments: 0,
  intervalMs: 500,
  autoCollect: true,
});

/* ---------- 编辑 ---------- */
const editVisible = ref(false);
const saving = ref(false);
const editId = ref(0);
const editForm = ref({ title: '', coverUrl: '', remark: '' });

/* ---------- 开始采集 ---------- */
const collectVisible = ref(false);
const collecting = ref(false);
const collectTarget = ref<Video | null>(null);
const collectForm = ref({
  accountId: '',
  collectReplies: false,
  maxComments: 0,
  intervalMs: 500,
});

/* ---------- 日志 ---------- */
const logsVisible = ref(false);
const logTarget = ref<Video | null>(null);
const logs = ref<VideoLog[]>([]);
const logBox = ref<HTMLElement | null>(null);
let logTimer: number | undefined;

let refreshTimer: number | undefined;

/** 进度百分比：无上限时按渐近曲线估算，有上限按比例 */
function progressOf(row: Video): number {
  if (row.collectStatus === 'success') return 100;
  const limit = row.collectMaxComments;
  if (limit && limit > 0) return Math.min(99, Math.round((row.collectTotal / limit) * 100));
  const n = row.collectTotal;
  if (!n) return row.collectStatus === 'running' ? 5 : 0;
  return Math.round(92 * (1 - Math.exp(-n / 1500)));
}

async function load(silent = false) {
  if (!silent) loading.value = true;
  try {
    const r = await videoApi.list({ keyword: keyword.value, page: page.value, pageSize: pageSize.value });
    rows.value = r.list;
    total.value = r.total;
    // 同步调度器状态
    const active = r.list.some((v) => ['running', 'pending'].includes(v.collectStatus));
    if (active) {
      const s = await fetch('/api/videos/scheduler').then((x) => x.json()).catch(() => null);
      if (s?.code === 200) scheduler.value = s.data as SchedulerInfo;
    }
  } catch (e) {
    if (!silent) ElMessage.error((e as Error).message);
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  page.value = 1;
  void load();
}

async function ensureAccounts() {
  if (accounts.value.length) return;
  try {
    accounts.value = await accountApi.options();
  } catch {
    /* ignore */
  }
  if (accounts.value.length && !createForm.value.accountId) {
    createForm.value.accountId = accounts.value[0].accountId;
  }
}

async function openCreate() {
  createForm.value = {
    raw: '',
    remark: '',
    accountId: createForm.value.accountId,
    collectReplies: false,
    maxComments: 0,
    intervalMs: 500,
    autoCollect: true,
  };
  createVisible.value = true;
  await ensureAccounts();
}

async function submitCreate() {
  const raw = createForm.value.raw.trim();
  if (!raw) {
    ElMessage.warning('请填写视频链接或视频ID');
    return;
  }
  creating.value = true;
  try {
    const f = createForm.value;
    const collect = {
      collectReplies: f.collectReplies === true,
      maxComments: f.maxComments > 0 ? f.maxComments : null,
      intervalMs: f.intervalMs,
      accountId: f.accountId || undefined,
    };
    const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

    if (lines.length === 1) {
      await videoApi.create({
        raw: lines[0],
        remark: f.remark,
        accountId: f.accountId || undefined,
        collect,
        autoCollect: f.autoCollect,
      });
      ElMessage.success('录入成功');
      if (f.autoCollect) {
        ElNotification.success({
          title: '已加入采集队列',
          message: '将在前面的视频采集完成后自动开始',
          duration: 3000,
        });
      }
    } else {
      const r = await videoApi.batch({
        raws: lines,
        remark: f.remark,
        accountId: f.accountId || undefined,
        collect,
        autoCollect: f.autoCollect,
      });
      if (r.failed.length) {
        ElMessageBox.alert(
          r.failed.map((x) => `· ${x.raw.slice(0, 60)}：${x.reason}`).join('\n'),
          `批量录入：成功 ${r.success.length} 条，失败 ${r.failed.length} 条`,
          { type: 'warning' },
        );
      } else {
        ElMessage.success(`批量录入成功 ${r.success.length} 条`);
      }
    }
    createVisible.value = false;
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    creating.value = false;
  }
}

function openEdit(row: Video) {
  editId.value = row.id;
  editForm.value = { title: row.title, coverUrl: row.coverUrl, remark: row.remark };
  editVisible.value = true;
}

async function submitEdit() {
  saving.value = true;
  try {
    await videoApi.update(editId.value, { ...editForm.value });
    ElMessage.success('已保存');
    editVisible.value = false;
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    saving.value = false;
  }
}

async function openCollect(row: Video) {
  collectTarget.value = row;
  await ensureAccounts();
  collectForm.value = {
    // 回填已保存的采集配置
    accountId: row.collectAccountId || accounts.value[0]?.accountId || '',
    collectReplies: row.collectReplies === true,
    maxComments: row.collectMaxComments ?? 0,
    intervalMs: row.collectIntervalMs || 500,
  };
  collectVisible.value = true;
}

async function submitCollect() {
  if (!collectTarget.value) return;
  const f = collectForm.value;
  if (!f.accountId) {
    ElMessage.warning('请先选择采集账户');
    return;
  }
  collecting.value = true;
  try {
    await videoApi.collect(collectTarget.value.id, {
      accountId: f.accountId,
      collectReplies: f.collectReplies === true,
      maxComments: f.maxComments > 0 ? f.maxComments : null,
      intervalMs: f.intervalMs,
    });
    ElMessage.success('已开始采集');
    collectVisible.value = false;
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    collecting.value = false;
  }
}

const actionLabels: Record<string, string> = { pause: '暂停', resume: '继续', cancel: '取消' };

async function act(row: Video, action: 'pause' | 'resume' | 'cancel') {
  try {
    await videoApi[action](row.id);
    ElMessage.success(`已${actionLabels[action]}`);
    await load(true);
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

/** 导出该视频采集的评论 */
async function exportVideo(row: Video) {
  if (!row.collected) {
    ElMessage.warning('该视频还没有采集到评论');
    return;
  }
  try {
    const name = await downloadFile(
      '/api/comments/export',
      { scope: 'video', videoId: row.id, replies: 'include' },
      'comments.xlsx',
    );
    ElMessage.success(`已开始下载：${name}`);
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

function viewComments(row: Video) {
  router.push({ path: '/comments', query: { videoId: String(row.id) } });
}

async function onCommand(cmd: string, row: Video) {
  if (cmd === 'edit') return openEdit(row);
  if (cmd === 'logs') return openLogs(row);
  if (cmd === 'delete') {
    try {
      await ElMessageBox.confirm(
        `确定删除「${row.title || row.awemeId}」吗？该视频的评论数据和采集日志会一并删除。`,
        '删除确认',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
      );
      await videoApi.remove(row.id);
      ElMessage.success('已删除');
      await load();
    } catch (e) {
      if (e === 'cancel' || e === 'close') return;
      ElMessage.error((e as Error).message);
    }
  }
}

/* ---------- 日志 ---------- */
async function openLogs(row: Video) {
  logTarget.value = row;
  logs.value = [];
  logsVisible.value = true;
  await pullLogs();
  if (logTimer) window.clearInterval(logTimer);
  logTimer = window.setInterval(() => void pullLogs(), 2500);
}

async function pullLogs() {
  if (!logTarget.value) return;
  const lastId = logs.value.length ? logs.value[logs.value.length - 1].id : 0;
  try {
    const list = await videoApi.logs(logTarget.value.id, lastId);
    if (list.length) {
      logs.value.push(...list);
      await nextTick();
      if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight;
    }
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  await load();
  refreshTimer = window.setInterval(() => {
    if (rows.value.some((r) => ['running', 'pending'].includes(r.collectStatus))) {
      void load(true);
    }
  }, 3000);
});

onBeforeUnmount(() => {
  if (logTimer) window.clearInterval(logTimer);
  if (refreshTimer) window.clearInterval(refreshTimer);
});
</script>

<style scoped>
.header-actions {
  display: flex;
  gap: 10px;
}

.video-cell {
  display: flex;
  gap: 12px;
  align-items: center;
}
.cover {
  width: 54px;
  height: 72px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-soft);
  display: grid;
  place-items: center;
  color: var(--text-3);
}
.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover.small {
  width: 44px;
  height: 58px;
}
.video-meta {
  min-width: 0;
  flex: 1;
}
.video-title {
  font-weight: 600;
  color: var(--text-1);
  font-size: 13.5px;
}
.video-sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-3);
  display: flex;
  align-items: center;
  gap: 4px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dot-sep {
  opacity: 0.6;
}
.remark {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-3);
}
.counts {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12.5px;
  color: var(--text-2);
}
.counts span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.collect-cell {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: flex-start;
}
.row-progress {
  width: 100%;
  max-width: 160px;
}
.collect-sub {
  font-size: 12px;
}
.collect-sub b {
  color: var(--brand-600);
}
.err {
  font-size: 11.5px;
  color: var(--el-color-danger);
  max-width: 100%;
}

.form-hint {
  font-size: 12px;
  margin-top: 6px;
  line-height: 1.6;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
}
.switch-label {
  font-size: 12.5px;
}

.collect-target {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg-soft);
  border-radius: 10px;
  margin-bottom: 14px;
  font-weight: 600;
}

.danger-item {
  color: var(--el-color-danger);
}

.log-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.error-msg {
  font-size: 12.5px;
  color: var(--el-color-danger);
}
.log-box {
  height: calc(100vh - 170px);
  overflow: auto;
  background: var(--bg-soft);
  border-radius: 10px;
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.7;
}
.log-line {
  display: flex;
  gap: 8px;
  color: var(--text-2);
  border-bottom: 1px dashed var(--border);
  padding: 3px 0;
}
.log-time {
  color: var(--text-3);
  flex-shrink: 0;
}
.log-msg {
  word-break: break-all;
}
.level-warn .log-msg {
  color: #d97706;
}
.level-error .log-msg {
  color: var(--el-color-danger);
}

@media (max-width: 640px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
