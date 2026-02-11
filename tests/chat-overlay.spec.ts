import { test, expect } from '@playwright/test';

// The watch page embeds YouTube which never reaches networkidle.
// Use domcontentloaded and wait for specific elements.

test.describe('ChatOverlay UI', () => {
  test.beforeEach(async ({ page }) => {
    // Clear persisted chat history
    await page.addInitScript(() => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('chalk-video-chat-'));
      keys.forEach(k => localStorage.removeItem(k));
    });
    await page.goto('/watch?v=dQw4w9WgXcQ', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Chat' }).waitFor({ state: 'visible', timeout: 20000 });
  });

  test('page loads with Chat and Transcript buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Chat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transcript' })).toBeVisible();
  });

  test('chat overlay opens via Chat button and has dialog role', async ({ page }) => {
    await page.getByRole('button', { name: 'Chat' }).click();
    // Wait for the dialog DOM element to appear
    const dialog = page.locator('[role="dialog"][aria-label="Video chat"]');
    await dialog.waitFor({ state: 'attached', timeout: 5000 });
    // Verify ARIA attributes
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-label', 'Video chat');
  });

  test('overlay has header with label, chat icon, and Esc hint', async ({ page }) => {
    await page.getByRole('button', { name: 'Chat' }).click();
    const dialog = page.locator('[role="dialog"][aria-label="Video chat"]');
    await dialog.waitFor({ state: 'attached', timeout: 5000 });

    await expect(dialog.getByText('Ask about this video')).toBeVisible();
    await expect(dialog.locator('kbd')).toContainText('Esc');
  });

  test('overlay has Quick questions with suggestion buttons', async ({ page }) => {
    await page.getByRole('button', { name: 'Chat' }).click();
    const dialog = page.locator('[role="dialog"][aria-label="Video chat"]');
    await dialog.waitFor({ state: 'attached', timeout: 5000 });

    await expect(dialog.getByText('Quick questions')).toBeVisible();
    // Suggestions from pickSuggestions (randomized, so just check count)
    const suggestions = dialog.locator('button.group');
    const count = await suggestions.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('input area has textarea, model selector, and send button', async ({ page }) => {
    await page.getByRole('button', { name: 'Chat' }).click();
    const dialog = page.locator('[role="dialog"][aria-label="Video chat"]');
    await dialog.waitFor({ state: 'attached', timeout: 5000 });

    await expect(dialog.locator('textarea[aria-label="Video question input"]')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Send message' })).toBeVisible();
    await expect(dialog.getByText('Auto')).toBeVisible();
  });

  test('send button disables when empty, enables when text entered', async ({ page }) => {
    await page.getByRole('button', { name: 'Chat' }).click();
    const dialog = page.locator('[role="dialog"][aria-label="Video chat"]');
    await dialog.waitFor({ state: 'attached', timeout: 5000 });

    const sendBtn = dialog.getByRole('button', { name: 'Send message' });
    await expect(sendBtn).toBeDisabled();

    const textarea = dialog.locator('textarea[aria-label="Video question input"]');
    await textarea.fill('Hello');
    await expect(sendBtn).toBeEnabled();
  });

  test('Escape key closes overlay', async ({ page }) => {
    await page.getByRole('button', { name: 'Chat' }).click();
    const dialog = page.locator('[role="dialog"][aria-label="Video chat"]');
    await dialog.waitFor({ state: 'attached', timeout: 5000 });

    const textarea = dialog.locator('textarea[aria-label="Video question input"]');
    await textarea.focus();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeAttached({ timeout: 3000 });
  });

  test('close button dismisses overlay', async ({ page }) => {
    await page.getByRole('button', { name: 'Chat' }).click();
    const dialog = page.locator('[role="dialog"][aria-label="Video chat"]');
    await dialog.waitFor({ state: 'attached', timeout: 5000 });

    await dialog.getByRole('button', { name: /Close chat/ }).click();
    await expect(dialog).not.toBeAttached({ timeout: 3000 });
  });

  test('glass panel has gradient background', async ({ page }) => {
    await page.getByRole('button', { name: 'Chat' }).click();
    const dialog = page.locator('[role="dialog"][aria-label="Video chat"]');
    await dialog.waitFor({ state: 'attached', timeout: 5000 });

    const bgImage = await dialog.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bgImage).toContain('gradient');
  });

  test('panel width is bounded to max-w-3xl', async ({ page }) => {
    await page.getByRole('button', { name: 'Chat' }).click();
    const dialog = page.locator('[role="dialog"][aria-label="Video chat"]');
    await dialog.waitFor({ state: 'attached', timeout: 5000 });

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    // max-w-3xl = 768px, plus some tolerance
    expect(box!.width).toBeLessThanOrEqual(800);
  });

  test('messages area has aria-live for accessibility', async ({ page }) => {
    await page.getByRole('button', { name: 'Chat' }).click();
    const dialog = page.locator('[role="dialog"][aria-label="Video chat"]');
    await dialog.waitFor({ state: 'attached', timeout: 5000 });

    const liveRegion = dialog.locator('[aria-live="polite"]');
    await expect(liveRegion).toBeAttached();
  });

  test('clicking suggestion sends message and shows assistant avatar', async ({ page }) => {
    await page.getByRole('button', { name: 'Chat' }).click();
    const dialog = page.locator('[role="dialog"][aria-label="Video chat"]');
    await dialog.waitFor({ state: 'attached', timeout: 5000 });

    // Click first suggestion
    await dialog.locator('button.group').first().click();

    // Quick questions should disappear
    await expect(dialog.getByText('Quick questions')).not.toBeVisible({ timeout: 5000 });

    // Assistant avatar (sparkle in circle) should appear
    const avatar = dialog.locator('.rounded-full.bg-chalk-accent\\/15');
    await expect(avatar.first()).toBeAttached({ timeout: 10000 });
  });
});
