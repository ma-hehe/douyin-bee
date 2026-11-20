import { spawn } from 'node:child_process';
import { logger } from '@/utils/logger';

/**
 * 用系统默认浏览器打开地址。
 * Windows 下用 `cmd /c start`（不需要额外依赖），其他平台回退到 start/open/xdg-open。
 */
export function openBrowser(url: string): void {
  const platform = process.platform;

  if (platform === 'win32') {
    // cmd /c start "" "url" —— 空标题占位，避免 start 把带引号的 URL 当成窗口标题
    const child = spawn('cmd.exe', ['/c', 'start', '""', url], {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true,
    });
    child.on('error', (e) => logger.warn(`打开浏览器失败: ${e.message}`));
    child.unref();
    return;
  }

  const cmd = platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(cmd, [url], { detached: true, stdio: 'ignore' });
  child.on('error', (e) => logger.warn(`打开浏览器失败: ${e.message}`));
  child.unref();
}
