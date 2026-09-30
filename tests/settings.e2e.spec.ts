import { expect, test } from '@playwright/test';
import { CONTROL_ACTIONS, CONTROL_OPTIONS } from '../src/controls';

test('Settings keeps keyboard access, saved values, remapping and calm controls', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('[data-do="settings"]').click();
  const dialog = page.getByRole('dialog');
  await page.screenshot({ path: testInfo.outputPath('settings-top.png') });
  await dialog.locator('.control-options').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('settings-controls.png') });
  await expect(dialog.locator('input[type=range]')).toHaveCount(7 + CONTROL_OPTIONS.filter(o => o.min !== undefined).length);
  await expect(dialog.locator('input[type=checkbox]')).toHaveCount(4 + CONTROL_OPTIONS.filter(o => o.min === undefined).length);
  await expect(dialog.locator('select')).toHaveCount(4);
  // Tab reaches each control without landing on the replaced, hidden selects.
  await dialog.locator('.close-modal').focus();
  const reached = new Set<string>();
  for (let i = 0; i < 65; i++) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return { inside: !!el.closest('dialog'), id: el.id || el.dataset.setting || el.dataset.control || '', outline: getComputedStyle(el).outlineStyle };
    });
    expect(focus.inside).toBe(true); expect(focus.outline).not.toBe('none'); reached.add(focus.id);
    if (focus.id === 'save-settings') break;
  }
  for (const id of ['sensitivity', 'fov', 'master', 'effects', 'ambience', 'music', 'ui-scale', 'reduced-motion', 'adaptive', 'show-fps', 'save-settings', ...CONTROL_OPTIONS.map(o => o.key)]) expect(reached.has(id)).toBe(true);
  const sensitivity = dialog.getByRole('slider', { name: 'Sensibilidade do mouse', exact: true });
  await sensitivity.focus(); await page.keyboard.press('ArrowRight'); await expect(sensitivity).toHaveValue('1.05');
  await expect(sensitivity).toHaveAttribute('aria-valuetext', '1,05×');
  const volume = dialog.getByRole('slider', { name: 'Volume geral', exact: true });
  await volume.focus(); await page.keyboard.press('Home'); await expect(volume).toHaveValue('0');
  await expect(volume).toHaveAttribute('aria-valuetext', '0%');
  await volume.press('End'); await expect(volume).toHaveValue('1');
  const scale = dialog.getByRole('slider', { name: 'Tamanho da interface', exact: true });
  await scale.focus(); await page.keyboard.press('ArrowLeft'); await expect(scale).toHaveValue('95');
  const low = dialog.getByRole('group', { name: 'Qualidade gráfica', exact: true }).getByRole('button', { name: 'Leve', exact: true });
  await low.focus(); await page.keyboard.press('Space'); await expect(low).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('#quality-note')).toContainText('mais fôlego');
  for (const id of ['reduced-motion', 'adaptive', 'show-fps']) {
    const box = dialog.locator(`#${id}`), before = await box.isChecked();
    await box.focus(); await page.keyboard.press('Space'); expect(await box.isChecked()).toBe(!before);
  }
  await expect(page.locator('body')).toHaveClass(/reduce-motion/);
  expect(await low.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  for (const option of CONTROL_OPTIONS) {
    if (option.min === undefined) {
      const box = dialog.getByRole('checkbox', { name: option.label, exact: true });
      await box.focus(); await box.press('Space'); await expect(box).toBeChecked();
    } else {
      const slider = dialog.getByRole('slider', { name: option.label, exact: true });
      await expect(slider).toHaveAttribute('min', String(option.min));
      await expect(slider).toHaveAttribute('max', String(option.max));
      await expect(slider).toHaveAttribute('step', String(option.step));
      await slider.press('Home'); await expect(slider).toHaveValue(String(option.min));
      await slider.press('End'); await expect(slider).toHaveValue(String(option.max));
    }
  }
  const summary = dialog.locator('.bindings summary'); await summary.focus(); await page.keyboard.press('Enter');
  await expect(dialog.locator('[data-binding]')).toHaveCount(CONTROL_ACTIONS.length);
  for (const action of CONTROL_ACTIONS) await expect(dialog.getByRole('button', { name: `${action.label}: trocar tecla`, exact: true })).toBeVisible();
  const melee = dialog.locator('[data-binding="melee"]'), previous = dialog.locator('[data-binding="lastWeapon"]');
  await melee.press('Enter'); await page.keyboard.press('KeyX');
  await expect(melee).toHaveText('X'); await expect(previous).toHaveText('V');
  const reload = dialog.locator('[data-binding="reload"]'); await reload.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('KeyT');
  await expect(reload).toHaveText('T');
  await reload.press('Enter'); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible(); await expect(reload).toHaveText('T');
  await dialog.locator('#save-settings').focus(); await page.keyboard.press('Enter'); await expect(dialog).toHaveCount(0);
  await page.reload(); await page.locator('[data-do="settings"]').click();
  await expect(page.getByRole('slider', { name: 'Sensibilidade do mouse', exact: true })).toHaveValue('1.05');
  await expect(page.locator('#graphics')).toHaveValue('low'); await expect(page.locator('#reduced-motion')).toBeChecked();
  for (const option of CONTROL_OPTIONS) {
    if (option.min === undefined) await expect(page.getByRole('checkbox', { name: option.label, exact: true })).toBeChecked();
    else await expect(page.getByRole('slider', { name: option.label, exact: true })).toHaveValue(String(option.max));
  }
  await page.locator('.bindings summary').press('Enter'); await expect(page.locator('[data-binding="reload"]')).toHaveText('T');
  await page.locator('#reset-bindings').focus(); await page.keyboard.press('Space'); await expect(page.locator('[data-binding="reload"]')).toHaveText('R');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});


test('Mouse rebinding swaps actions, cancels safely and persists the new actions', async ({ page }) => {
  await page.goto('/'); await page.locator('[data-do="settings"]').click();
  const dialog = page.getByRole('dialog'); await dialog.locator('.bindings summary').click();
  const melee = dialog.locator('[data-binding="melee"]'), previous = dialog.locator('[data-binding="lastWeapon"]');
  await melee.click(); await melee.click({ button: 'right' });
  await expect(melee).toHaveText('Mouse dir.'); await expect(dialog.locator('[data-binding="ads"]')).toHaveText('V');
  await previous.click(); await previous.click({ button: 'middle' }); await expect(previous).toHaveText('Mouse meio');
  // The completing left click must not arm a second capture.
  await previous.click(); await previous.click(); await expect(previous).toHaveText('Mouse esq.');
  await expect(previous).not.toHaveClass(/capturing/); await expect(dialog.locator('[data-binding="fire"]')).toHaveText('Mouse meio');
  await melee.click(); await dialog.locator('#save-settings').click(); await expect(dialog).toHaveCount(0);
  await page.reload(); await page.locator('[data-do="settings"]').click(); await page.locator('.bindings summary').click();
  await expect(page.locator('[data-binding="melee"]')).toHaveText('Mouse dir.');
  await expect(page.locator('[data-binding="lastWeapon"]')).toHaveText('Mouse esq.');
  await page.locator('#reset-bindings').click();
  await expect(page.locator('[data-binding="melee"]')).toHaveText('V');
  await expect(page.locator('[data-binding="lastWeapon"]')).toHaveText('X');
});
