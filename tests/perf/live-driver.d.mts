import type { Page } from '@playwright/test';
export function startDriver(page: Page): Promise<void>;
export function stopDriver(page: Page): Promise<void>;
