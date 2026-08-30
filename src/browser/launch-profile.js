import { chromium } from 'playwright';
import { logger } from '../utils/logger.js';
import { get } from '../utils/config.js';
import { FlowError, ErrorCodes } from '../utils/errors.js';
import { launchChromeDirect, setPage, setContext, setConnected, setBrowser, isBrowserConnected } from './connect.js';

import { findChromeExecutable, getDefaultUserDataDir } from './executable-finder.js';

let detectedChromePath = null;
try {
  detectedChromePath = findChromeExecutable();
} catch (e) {
  detectedChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

const CHROME_PATH = get('chromePath', detectedChromePath);
const CDP_PORT = get('cdpPort', 9333);
const FLOW_URL = get('flowUrl', 'https://labs.google/fx/tools/flow');

export async function launchKiaraProfile(headless = false) {
  if (isBrowserConnected()) {
    logger.info('Browser already connected, reusing');
    return { success: true, message: 'Already connected' };
  }

  const userDataDir = get('chromeUserDataDir', getDefaultUserDataDir());

  logger.info('Launching Chrome via direct+CDP method (anti-detection)', { userDataDir });

  try {
    // Try connecting to existing Chrome instance first
    const existing = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    logger.info('Found existing Chrome instance, reusing');
    const ctx = existing.contexts()[0];
    const pages = ctx?.pages() || [];
    const pg = pages.find(p => p.url().includes('labs.google')) ||
               pages.find(p => !p.url().startsWith('chrome://') && !p.url().includes('recaptcha')) ||
               pages[0];
    setBrowser(existing);
    setContext(ctx);
    setConnected(true);
    if (pg) { setPage(pg); return { browser: existing, context: ctx, page: pg }; }
    const newPage = await ctx.newPage();
    setPage(newPage);
    return { browser: existing, context: ctx, page: newPage };
  } catch {
    // Launch Chrome directly (not via Playwright) for anti-detection, pointed
    // at our dedicated persistent profile (never copied/deleted).
    return await launchChromeDirect({
      chromePath: CHROME_PATH,
      cdpPort: CDP_PORT,
      headless,
      persistentDir: userDataDir,
    });
  }
}

export async function navigateToFlow(page, toolPage) {
  const targetUrl = toolPage === true
    ? 'https://labs.google/fx/fr/tools/flow'
    : FLOW_URL;

  logger.info('Navigating to Google Flow', { url: targetUrl });
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const currentUrl = page.url();
  logger.info('Flow page loaded', { url: currentUrl.substring(0, 100) });

  if (currentUrl.includes('accounts.google.com')) {
    return { authenticated: false, url: currentUrl,
      message: 'OAuth blocked — Google detects automation. Use Chrome direct+CDP launch method.' };
  }

  return { authenticated: true, url: currentUrl };
}
