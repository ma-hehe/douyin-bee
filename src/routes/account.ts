import { Router } from 'express';
import { HttpError } from './error';
import { useOne } from '@/browser/browser_pool';
import { getStorageState } from '@/utils/kit';
import { logger } from '@/utils/logger';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { accountRepo, type AccountRow } from '@/db/account';
import { loadSession } from '@/douyin/session';
import { checkAccountFileHealth, isLoginInProgress, markLoginFinished, markLoginStarted } from '@/services/account.service';

const router = Router();

/** 把数据库行转成前端友好结构 */
function toDto(row: AccountRow) {
  return {
    id: row.id,
    accountId: row.account_id,
    nickname: row.nickname || '',
    avatarUrl: row.avatar_url || '',
    douyinUid: row.douyin_uid || '',
    status: row.status,
    lastLogin: row.last_login,
    lastCheck: row.last_check,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 进行中的登录：accountId -> 临时状态 */
const loginState = new Map<string, { status: 'waiting' | 'success' | 'failed'; message: string; at: number }>();

/** 登录流程最长等待时间（超时自动关闭浏览器窗口） */
const LOGIN_TIMEOUT_MS = 10 * 60_000;

/**
 * GET /api/account/login?accountId=
 * 保持现状：在本机弹出 Edge 窗口，用户在窗口内扫码。
 * 接口立即返回 accountId（传了则沿用，用于「重新登录」），前端轮询 /login/status。
 */
router.get('/login', (req, res) => {
  let raw = String(req.query.accountId ?? '').trim();
  if (!raw) raw = String(Date.now());
  const id = raw;

  if (isLoginInProgress(id)) {
    res.json({ code: 200, data: { accountId: id }, message: '该账户已在登录中，请完成浏览器窗口中的扫码' });
    return;
  }

  loginState.set(id, { status: 'waiting', message: '', at: Date.now() });
  markLoginStarted(id);

  void runLogin(id)
    .catch((e) => {
      logger.error(`account ${id} 登录流程异常: ${(e as Error).message}`);
      loginState.set(id, { status: 'failed', message: (e as Error).message, at: Date.now() });
    })
    .finally(() => markLoginFinished(id));

  res.json({ code: 200, data: { accountId: id }, message: '请在打开的浏览器中扫码登录' });
});

/** 后台执行：打开浏览器 -> 等待扫码 -> 保存会话 */
async function runLogin(id: string) {
  let logined = false;
  try {
    await useOne(id, false, async (ctx) => {
      const page = await ctx.newPage();
      await page.goto('https://www.douyin.com', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const deadline = Date.now() + LOGIN_TIMEOUT_MS;
      while (Date.now() < deadline) {
        try {
          if ((await page.locator('button', { hasText: '登录' }).count()) > 0) {
            await page.waitForTimeout(500);
            continue;
          }
        } catch {
          // 窗口被用户关闭
          throw new Error('浏览器窗口已关闭，未完成登录');
        }
        logger.info(`account ${id} 扫码成功`);
        logined = true;
        try {
          page.locator('button', { hasText: '保存' }).first().click({ delay: 1000, timeout: 10_000 });
        } catch (e) {
          await page.goto('https://www.douyin.com/user/self?from_tab_name=main');
          try {
            await page.locator('.trust-login-switch-button').first().click({ delay: 1000, timeout: 30_000 });
          } catch {
            /* 页面没有该按钮时忽略 */
          }
        }
        await page.waitForTimeout(1000);
        break;
      }
      if (!logined) throw new Error('扫码超时（10 分钟）');

      await saveSessionAndUpsert(id, ctx);
    });
    loginState.set(id, { status: 'success', message: '登录成功', at: Date.now() });
  } catch (e) {
    const msg = (e as Error).message;
    loginState.set(id, { status: 'failed', message: msg, at: Date.now() });
    throw e;
  }
}

/** 登录状态轮询 */
router.get('/login/status', (req, res) => {
  const id = String(req.query.id ?? '');
  let state = loginState.get(id);

  if (!state) {
    // 没有进行中的登录（进程重启等）：以库里记录为准
    const row = accountRepo.findByAccountId(id);
    res.json({
      code: 200,
      message: '成功',
      data: row ? { status: 'success', account: toDto(row), message: '' } : { status: 'failed', account: null, message: '未找到登录流程，请重新发起' },
    });
    return;
  }

  if (state.status === 'waiting' && Date.now() - state.at > LOGIN_TIMEOUT_MS + 30_000) {
    state = { status: 'failed', message: '扫码超时', at: Date.now() };
  }
  if (state.status !== 'waiting') loginState.delete(id);

  const row = accountRepo.findByAccountId(id);
  res.json({
    code: 200,
    message: '成功',
    data: { status: state.status, account: row ? toDto(row) : null, message: state.message },
  });
});

/**
 * GET /api/account/open?accountId=
 * 保持现状：打开浏览器窗口让用户自行操作，关闭后保存会话。
 */
router.get('/open', (req, res) => {
  const { accountId = '' } = req.query;
  if (accountId === '') throw new HttpError(400, '账户ID不能为空');
  const id = String(accountId);

  void useOne(id, false, async (ctx) => {
    try {
      const page = await ctx.newPage();
      await page.goto('https://www.douyin.com', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      while (true) {
        try {
          await page.waitForTimeout(500);
        } catch {
          break;
        }
      }
    } finally {
      await saveSessionAndUpsert(id, ctx);
    }
  }).catch((e) => logger.error(`account ${id} open 失败: ${(e as Error).message}`));

  res.json({ code: 200, data: { accountId: id }, message: '请在打开的浏览器中查看' });
});

/** 保存 storageState 并把账户信息写入数据库 */
async function saveSessionAndUpsert(id: string, ctx: { storageState: (o: { path: string }) => Promise<unknown> }) {
  const path = getStorageState(id);
  if (!existsSync(path)) writeFileSync(path, '', { encoding: 'utf-8' });
  await ctx.storageState({ path });

  let nickname = '';
  let avatarUrl = '';
  let uid = '';
  let sec_uid = '';
  try {
    const session = await loadSession(id);
    nickname = session.nickname || '';
    avatarUrl = session.avatar_url || '';
    uid = session.uid || '';
    sec_uid = session.sec_uid || '';
  } catch (e) {
    logger.warn(`account ${id} 会话解析失败: ${(e as Error).message}`);
  }
  accountRepo.upsertLogin(id, { nickname, avatarUrl, uid, sec_uid });
  logger.info(`account ${id} 登录态已保存`);
}

/** GET /api/account/list */
router.get('/list', (req, res) => {
  const pageNumber = parseInt(String(req.query.page ?? 1), 10) || 1;
  const pageSize = Math.min(parseInt(String(req.query.pageSize ?? 20), 10) || 20, 200);
  const { accounts, total } = accountRepo.list(pageNumber, pageSize);
  res.json({ code: 200, message: '成功', data: { list: accounts.map(toDto), total } });
});

/** GET /api/account/options —— 下拉选择用 */
router.get('/options', (_req, res) => {
  const rows = accountRepo.listUsable();
  res.json({
    code: 200,
    message: '成功',
    data: rows.map((r) => ({
      accountId: r.account_id,
      nickname: r.nickname || '',
      avatarUrl: r.avatar_url || '',
      status: r.status,
    })),
  });
});

/** GET /api/account/:id/health —— 手动检测登录态 */
router.get('/:id/health', (req, res) => {
  const row = accountRepo.findByAccountId(req.params.id);
  if (!row) throw new HttpError(404, '账户不存在');
  const health = checkAccountFileHealth(row.account_id);
  accountRepo.updateCheck(row.account_id, health.valid ? 'active' : 'invalid');
  res.json({
    code: 200,
    data: { valid: health.valid, reason: health.reason },
    message: health.valid ? '登录态有效' : `登录态失效：${health.reason}`,
  });
});

/** PATCH /api/account/:id —— 启用 / 停用 */
router.patch('/:id', (req, res) => {
  const { status } = req.body ?? {};
  if (!['active', 'disabled'].includes(status)) {
    throw new HttpError(400, 'status 只能是 active / disabled');
  }
  const ok = accountRepo.updateStatus(req.params.id, status);
  if (!ok) throw new HttpError(404, '账户不存在');
  res.json({ code: 200, data: null, message: '已更新' });
});

/** DELETE /api/account/:id —— 删除账户并清理会话文件 */
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const path = getStorageState(id);
  if (existsSync(path)) {
    try {
      rmSync(path, { force: true });
    } catch (e) {
      logger.warn(`删除会话文件失败 ${path}: ${(e as Error).message}`);
    }
  }
  const ok = accountRepo.delete(id);
  if (!ok) throw new HttpError(404, '账户不存在');
  res.json({ code: 200, data: null, message: '已删除' });
});

export default router;
