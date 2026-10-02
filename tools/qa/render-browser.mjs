// Rendering diagnostics choose a browser/backend explicitly and record the choice.
// One browser is launched at a time; CPU throttling is only available in Chromium.
import { chromium, firefox, webkit } from '@playwright/test';

export const browserName = process.env.BROWSER || 'chrome';
export const angle = process.env.ANGLE || (process.platform === 'darwin' ? 'metal' : 'gl-egl');
export const firefoxForceWebGL = process.env.FIREFOX_FORCE_WEBGL === '1';
export const firefoxForceEGL = process.env.MOZ_WEBGL_FORCE_EGL === '1';
export const vulkanNative = process.env.VULKAN_NATIVE === '1';

export async function launchRenderBrowser() {
  if (browserName === 'firefox') return firefox.launch({
    // Diagnostic retry only. The ordinary Firefox attempt is always recorded
    // first; never present a forced driver path as default browser support.
    firefoxUserPrefs: firefoxForceWebGL ? { 'webgl.force-enabled': true } : {},
  });
  if (browserName === 'webkit') return webkit.launch();
  if (browserName !== 'chrome') throw new Error(`Unknown BROWSER: ${browserName}`);
  return chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${angle}`,
    ...(angle === 'vulkan' && vulkanNative ? ['--enable-features=Vulkan', '--use-vulkan=native'] : []),
    ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : [])] });
}

export async function throttleRenderPage(page, rate) {
  if (browserName !== 'chrome') {
    if (rate !== 1) throw new Error('CPU_THROTTLE requires Chrome/CDP');
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
}

export function captureRenderErrors(page, errors) {
  page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ type: 'console', message: message.text() });
  });
}
