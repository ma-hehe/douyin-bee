import { existsSync } from 'node:fs';
import { chromium } from 'patchright';
import { logger } from '@/utils/logger';

/**
 * 浏览器启动器。
 *
 * 打包为 exe 时不内置 Chromium，统一使用目标机器上的 Microsoft Edge。
 * 注意：本模块会在 import 时加载 patchright，因此入口必须先 import '@/bootstrap'。
 */

/** 常见 Edge 安装路径 */
const EDGE_PATHS = [
  process.env['ProgramFiles'] && `${process.env['ProgramFiles']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env['ProgramFiles(x86)'] &&
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env['LOCALAPPDATA'] &&
    `${process.env['LOCALAPPDATA']}\\Microsoft\\Edge\\Application\\msedge.exe`,
].filter((p): p is string => !!p);

/** 本机是否安装了 Microsoft Edge */
export function isEdgeInstalled(): boolean {
  return EDGE_PATHS.some((p) => existsSync(p));
}

/** Edge 缺失时的统一提示语 */
export const EDGE_MISSING_MESSAGE =
  '未检测到 Microsoft Edge 浏览器。采集与扫码登录需要 Edge 支持，请先安装 Edge 后重试（Windows 10/11 通常已自带）。';

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

/**
 * 启动一个 Edge 实例。使用系统 Edge（channel: msedge），不依赖内置 Chromium。
 * Edge 缺失时抛出带明确提示的错误。
 */
export async function launchEdge(headless = true) {
  if (!isEdgeInstalled()) {
    logger.error(EDGE_MISSING_MESSAGE);
    throw new Error(EDGE_MISSING_MESSAGE);
  }
  return chromium.launch({
    channel: 'msedge',
    headless,
    args: LAUNCH_ARGS,
  });
}
