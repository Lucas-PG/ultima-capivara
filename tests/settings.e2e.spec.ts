import { expect, test } from '@playwright/test';

test('Settings keeps keyboard access, saved values, remapping and calm controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('[data-do="settings"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('input[type=range]')).toHaveCount(7);
  await expect(dialog.locator('input[type=checkbox]')).toHaveCount(4);
  await expect(dialog.locator('select')).toHaveCount(4);
  // Tab reaches each control without landing on the replaced, hidden selects.
  await dialog.locator('.close-modal').focus();
  const reached = new Set<string>();
  for (let i = 0; i < 36; i++) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return { inside: !!el.closest('dialog'), id: el.id || el.dataset.setting || '', outline: getComputedStyle(el).outlineStyle };
    });
    expect(focus.inside).toBe(true); expect(focus.outline).not.toBe('none'); reached.add(focus.id);
  }
  for (const id of ['sensitivity', 'fov', 'master', 'effects', 'ambience', 'music', 'ui-scale', 'reduced-motion', 'ads-toggle', 'adaptive', 'show-fps', 'save-settings']) expect(reached.has(id)).toBe(true);
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
  for (const id of ['reduced-motion', 'ads-toggle', 'adaptive', 'show-fps']) {
    const box = dialog.locator(`#${id}`), before = await box.isChecked();
    await box.focus(); await page.keyboard.press('Space'); expect(await box.isChecked()).toBe(!before);
  }
  await expect(page.locator('body')).toHaveClass(/reduce-motion/);
  expect(await low.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  const summary = dialog.locator('.bindings summary'); await summary.focus(); await page.keyboard.press('Enter');
  const reload = dialog.locator('[data-binding="reload"]'); await reload.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('KeyT');
  await expect(reload).toHaveText('T');
  await reload.press('Enter'); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible(); await expect(reload).toHaveText('T');
  await dialog.locator('#save-settings').focus(); await page.keyboard.press('Enter'); await expect(dialog).toHaveCount(0);
  await page.reload(); await page.locator('[data-do="settings"]').click();
  await expect(page.getByRole('slider', { name: 'Sensibilidade do mouse', exact: true })).toHaveValue('1.05');
  await expect(page.locator('#graphics')).toHaveValue('low'); await expect(page.locator('#reduced-motion')).toBeChecked();
  await page.locator('.bindings summary').press('Enter'); await expect(page.locator('[data-binding="reload"]')).toHaveText('T');
  await page.locator('#reset-bindings').focus(); await page.keyboard.press('Space'); await expect(page.locator('[data-binding="reload"]')).toHaveText('R');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});
