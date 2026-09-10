const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs/promises');

async function scan(page, testInfo, state) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  await fs.writeFile(testInfo.outputPath(`${state}-axe.json`), JSON.stringify({ violations: results.violations, incomplete: results.incomplete }, null, 2));
  await testInfo.attach(`${state}-axe`, {
    body: JSON.stringify({ violations: results.violations, incomplete: results.incomplete }, null, 2),
    contentType: 'application/json',
  });
  expect(results.violations).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
});

test('page and expanded disclosures pass axe', async ({ page }, testInfo) => {
  await scan(page, testInfo, 'page');
  for (const summary of await page.locator('summary').all()) {
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(summary.locator('..')).toHaveAttribute('open', '');
  }
  if (await page.locator('#navToggle').isVisible()) {
    await page.locator('#navToggle').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#navToggle')).toHaveAttribute('aria-expanded', 'true');
  }
  await scan(page, testInfo, 'expanded');
});

test('event flyers link to the full-size image in a new window', async ({ page }) => {
  const flyers = page.locator('[data-flyer]');
  await expect(flyers).toHaveCount(2);
  for (const flyer of await flyers.all()) {
    await expect(flyer).toHaveAttribute('href', /^images\/events\/.+\.jpg$/);
    await expect(flyer).toHaveAttribute('target', '_blank');
    await expect(flyer).toHaveAttribute('rel', /noopener/);
    // The new-window behaviour must be announced, not just visual (WCAG 3.2.5),
    // using the same sr-only wording as every other external link on the page.
    await expect(flyer).toHaveAccessibleName(/opens in new window/i);
    // The image's own alt must reach the link name, not be masked by an aria-label.
    await expect(flyer).toHaveAccessibleName(/flyer/i);
  }
  await expect(page.locator('dialog')).toHaveCount(0);
});

test('skip link, menu and focus indicators support keyboard use', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const toggle = page.locator('#navToggle');
  if (await toggle.isVisible()) {
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#mobileMenu')).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelector('#mobileMenu').contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(page.locator('#mobileMenu')).not.toBeVisible();
  }
  await page.locator('[data-flyer]').first().focus();
  expect(await page.locator('[data-flyer]').first().evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  const links = selector => page.locator(selector).evaluateAll(nodes => nodes.map(el => ({ text: el.textContent.trim(), href: el.getAttribute('href') })));
  expect(await links('footer nav[aria-label="Explore"] a')).toEqual(await links('[data-nav-link]'));
});

test('moving text can be paused with the keyboard', async ({ page }) => {
  const toggle = page.locator('#marqueeToggle');
  await expect(toggle).toHaveAccessibleName('Pause animation');
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveText('Resume animation');
  expect(await page.locator('.marquee-track').evaluate(el => getComputedStyle(el).animationPlayState)).toBe('paused');
  await page.keyboard.press('Enter');
  expect(await page.locator('.marquee-track').evaluate(el => getComputedStyle(el).animationPlayState)).toBe('running');
});

test('reflow, text spacing, reduced motion and event alignment', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.marquee-track').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  if (page.viewportSize().width >= 768) {
    const rows = await page.locator('#events article').evaluateAll(cards => cards.map(card => [...card.children].map(el => Math.round(el.getBoundingClientRect().top))));
    expect(rows[0]).toEqual(rows[1]);
  }
  await page.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
