<template>
  <div>
    <div class="page-header">
      <div>
        <h2 class="page-title">账户管理</h2>
        <div class="page-subtitle">管理用于采集的抖音登录账户，登录态将保存在本机会话文件中</div>
      </div>
      <div class="header-actions">
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="startLogin">添加账户</el-button>
      </div>
    </div>

    <div class="panel panel--pad">
      <el-table v-loading="loading" :data="rows" row-key="id" :empty-text="loading ? ' ' : '暂无账户，点击右上角「添加账户」开始'">
        <el-table-column label="账户" min-width="220">
          <template #default="{ row }">
            <div class="account-cell">
              <el-avatar :size="40" :src="row.avatarUrl" class="account-avatar">
                {{ (row.nickname || row.accountId).slice(0, 1) }}
              </el-avatar>
              <div class="account-meta">
                <div class="account-name">{{ row.nickname || '未获取昵称' }}</div>
                <div class="account-id">本地ID：{{ row.accountId }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="抖音UID" min-width="140">
          <template #default="{ row }">
            <span class="mono">{{ row.douyinUid || '-' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="登录状态" width="130">
          <template #default="{ row }">
            <el-tag :type="ACCOUNT_STATUS[row.status]?.type || 'info'" effect="light" round>
              {{ ACCOUNT_STATUS[row.status]?.label || row.status }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="最近登录" min-width="170">
          <template #default="{ row }">
            <div class="time-cell">
              <span>{{ formatTime(row.lastLogin, 'YYYY-MM-DD HH:mm') }}</span>
              <span class="muted">{{ fromNow(row.lastLogin) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="最近检测" min-width="150">
          <template #default="{ row }">
            <span class="muted">{{ row.lastCheck ? formatTime(row.lastCheck, 'MM-DD HH:mm') : '-' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :loading="checkingId === row.accountId"
              @click="checkHealth(row)"
            >
              检测登录态
            </el-button>
            <el-button link type="primary" @click="startLogin(row.accountId)">重新登录</el-button>
            <el-dropdown trigger="click" @command="(cmd: string) => onCommand(cmd, row)">
              <el-button link type="primary">更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="open">打开浏览器窗口</el-dropdown-item>
                  <el-dropdown-item v-if="row.status !== 'disabled'" command="disable">停用账户</el-dropdown-item>
                  <el-dropdown-item v-else command="enable">启用账户</el-dropdown-item>
                  <el-dropdown-item command="delete" divided class="danger-item">删除账户</el-dropdown-item>
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

    <!-- 扫码登录对话框 -->
    <el-dialog v-model="loginVisible" title="抖音账户扫码登录" width="460px" :close-on-click-modal="false" @closed="stopPolling">
      <div class="login-dialog">
        <div class="login-icon">
          <el-icon :size="30"><Iphone /></el-icon>
        </div>
        <template v-if="loginState === 'waiting'">
          <h3>请在浏览器窗口中扫码登录</h3>
          <p class="muted login-tip">
            系统已在本机打开浏览器窗口，请使用抖音 App 扫码登录。<br />
            登录成功后窗口关闭即可，此页面会自动检测结果。
          </p>
          <div class="login-progress">
            <el-progress :percentage="100" :indeterminate="true" :duration="2" :show-text="false" :stroke-width="4" />
            <span class="muted">等待扫码中…</span>
          </div>
        </template>
        <template v-else-if="loginState === 'success'">
          <h3>登录成功</h3>
          <div v-if="loggedAccount" class="logged">
            <el-avatar :size="44" :src="loggedAccount.avatarUrl">
              {{ (loggedAccount.nickname || loggedAccount.accountId).slice(0, 1) }}
            </el-avatar>
            <div>
              <div class="logged-name">{{ loggedAccount.nickname || '未获取昵称' }}</div>
              <div class="muted">本地ID：{{ loggedAccount.accountId }}</div>
            </div>
          </div>
        </template>
        <template v-else>
          <h3>登录未完成</h3>
          <p class="muted login-tip">{{ loginMessage || '扫码超时或窗口已关闭，请重新尝试。' }}</p>
        </template>
      </div>
      <template #footer>
        <el-button @click="loginVisible = false">关闭</el-button>
        <el-button v-if="loginState !== 'success'" type="primary" @click="retryLogin">重新发起登录</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown, Iphone, Plus, Refresh } from '@element-plus/icons-vue';
import { accountApi, type Account } from '@/api';
import { ACCOUNT_STATUS, formatTime, fromNow } from '@/utils/format';

const rows = ref<Account[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const checkingId = ref('');

const loginVisible = ref(false);
const loginState = ref<'waiting' | 'success' | 'failed'>('waiting');
const loginMessage = ref('');
const loggedAccount = ref<Account | null>(null);
let pollTimer: number | undefined;
let pollingId = '';

async function load() {
  loading.value = true;
  try {
    const r = await accountApi.list({ page: page.value, pageSize: pageSize.value });
    rows.value = r.list;
    total.value = r.total;
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    loading.value = false;
  }
}

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

async function startLogin(accountId?: string) {
  // 重新登录时沿用原账户ID，后端会复用同一份会话文件
  if (accountId) {
    ElMessage.info('正在打开浏览器窗口，请扫码登录');
  }
  loginState.value = 'waiting';
  loginMessage.value = '';
  loggedAccount.value = null;
  loginVisible.value = true;
  try {
    const r = await accountApi.login(accountId);
    pollingId = r.accountId;
    stopPolling();
    pollTimer = window.setInterval(async () => {
      try {
        const s = await accountApi.loginStatus(pollingId);
        loginState.value = s.status;
        loginMessage.value = s.message;
        if (s.account) loggedAccount.value = s.account;
        if (s.status !== 'waiting') {
          stopPolling();
          if (s.status === 'success') {
            ElMessage.success('账户添加成功');
            await load();
          }
        }
      } catch {
        /* 轮询失败忽略，下一轮再试 */
      }
    }, 2000);
  } catch (e) {
    loginState.value = 'failed';
    loginMessage.value = (e as Error).message;
  }
}

function retryLogin() {
  const id = loggedAccount.value?.accountId;
  loginVisible.value = false;
  setTimeout(() => startLogin(id), 200);
}

async function checkHealth(row: Account) {
  checkingId.value = row.accountId;
  try {
    const r = await accountApi.health(row.accountId);
    if (r.valid) ElMessage.success('登录态有效');
    else ElMessage.warning(`登录态失效：${r.reason}`);
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    checkingId.value = '';
  }
}

async function onCommand(cmd: string, row: Account) {
  try {
    if (cmd === 'open') {
      await accountApi.open(row.accountId);
      ElMessage.success('已打开浏览器窗口，操作完成后关闭窗口即可');
      return;
    }
    if (cmd === 'disable' || cmd === 'enable') {
      await accountApi.setStatus(row.accountId, cmd === 'disable' ? 'disabled' : 'active');
      ElMessage.success(cmd === 'disable' ? '账户已停用' : '账户已启用');
      await load();
      return;
    }
    if (cmd === 'delete') {
      await ElMessageBox.confirm(
        `确定删除账户「${row.nickname || row.accountId}」吗？会话文件会一并删除。`,
        '删除确认',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
      );
      await accountApi.remove(row.accountId);
      ElMessage.success('已删除');
      await load();
    }
  } catch (e) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error((e as Error).message);
  }
}

onMounted(load);
onBeforeUnmount(stopPolling);
</script>

<style scoped>
.header-actions {
  display: flex;
  gap: 10px;
}

.account-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}
.account-avatar {
  flex-shrink: 0;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: #fff;
  font-weight: 600;
}
.account-meta {
  min-width: 0;
}
.account-name {
  font-weight: 600;
  color: var(--text-1);
}
.account-id {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 2px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  color: var(--text-2);
}
.time-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}
.time-cell .muted {
  font-size: 11.5px;
}

:deep(.danger-item) {
  color: var(--el-color-danger);
}

.login-dialog {
  text-align: center;
  padding: 8px 4px 4px;
}
.login-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 14px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  box-shadow: 0 10px 26px rgba(99, 102, 241, 0.35);
}
.login-dialog h3 {
  margin: 0 0 8px;
  font-size: 17px;
  color: var(--text-1);
}
.login-tip {
  font-size: 13px;
  line-height: 1.7;
  margin: 0 0 18px;
}
.login-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12.5px;
}
.logged {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
  margin-top: 12px;
  text-align: left;
}
.logged-name {
  font-weight: 600;
  color: var(--text-1);
}
</style>
