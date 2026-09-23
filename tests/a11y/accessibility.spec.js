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

test('upcoming event images link to the full-size image in a new window', async ({ page }) => {
  const eventImages = page.locator('[data-event-image]');
  await expect(eventImages).toHaveCount(3);
  for (const eventImage of await eventImages.all()) {
    await expect(eventImage).toHaveAttribute('href', /^images\/events\/.+\.(jpg|png|webp)$/);
    await expect(eventImage).toHaveAttribute('target', '_blank');
    await expect(eventImage).toHaveAttribute('rel', /noopener/);
    // The new-window behaviour must be announced, not just visual (WCAG 3.2.5),
    // using the same sr-only wording as every other external link on the page.
    await expect(eventImage).toHaveAccessibleName(/opens in new window/i);
    // The image's own alt must reach the link name, not be masked by an aria-label.
    await expect(eventImage).toHaveAccessibleName(/Joel|Malcolm|Trunk or Treat/i);
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
  await page.locator('[data-event-image]').first().focus();
  expect(await page.locator('[data-event-image]').first().evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  const links = selector => page.locator(selector).evaluateAll(nodes => nodes.map(el => ({ text: el.textContent.trim(), href: el.getAttribute('href') })));
  const primaryLinks = await links('[data-nav-link]');
  expect(primaryLinks).toEqual([
    { text: 'Programs', href: '#programs' },
    { text: 'Train', href: '#train' },
    { text: 'Schedule', href: '#schedule' },
    { text: 'Pricing', href: '#pricing' },
    { text: 'Coaches', href: '#coaches' },
    { text: 'Events', href: '#events' },
    { text: 'Gallery', href: '#gallery' },
    { text: 'Visit', href: '#visit' },
  ]);
  expect(await links('[data-mobile-nav-link]')).toEqual(primaryLinks);
  expect(await links('footer nav[aria-label="Explore"] a')).toEqual(primaryLinks);
});

test('moving text can be paused with the keyboard', async ({ page }) => {
  const toggle = page.locator('#marqueeToggle');
  await expect(toggle).toHaveAccessibleName('Pause scrolling discipline list');
  await toggle.focus();
  await page.keyboard.press('Space');
  // Icon-only control: the state change must reach the accessible name, not just the glyph.
  await expect(toggle).toHaveAccessibleName('Resume scrolling discipline list');
  await expect(toggle.locator('[data-marquee-icon="play"]')).toBeVisible();
  await expect(toggle.locator('[data-marquee-icon="pause"]')).toBeHidden();
  expect(await page.locator('.marquee-track').evaluate(el => getComputedStyle(el).animationPlayState)).toBe('paused');
  // VoiceOver does not reliably re-announce a changed aria-label, so state is also spoken.
  await expect(page.locator('#marqueeStatus')).toHaveText('Discipline list paused');
  await page.keyboard.press('Enter');
  expect(await page.locator('.marquee-track').evaluate(el => getComputedStyle(el).animationPlayState)).toBe('running');
  await expect(page.locator('#marqueeStatus')).toHaveText('Discipline list scrolling');
});

test('in-page navigation preserves destination focus and current-location context', async ({ page }) => {
  const mobileToggle = page.locator('#navToggle');
  if (await mobileToggle.isVisible()) {
    await mobileToggle.focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-mobile-nav-link][href="#programs"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#mobileMenu')).not.toBeVisible();
    await expect(page.locator('#programs [data-section-heading]')).toBeFocused();
  } else {
    await page.locator('[data-nav-link][href="#programs"]').click();
  }

  const matchingLinks = page.locator('[data-section-nav-link][href="#programs"]');
  await expect(matchingLinks).toHaveCount(3);
  for (const link of await matchingLinks.all()) {
    await expect(link).toHaveAttribute('aria-current', 'location');
    expect(await link.evaluate(el => getComputedStyle(el).textDecorationLine)).toContain('underline');
  }
});

test('the marquee control survives its clipping band and forced colors', async ({ page }) => {
  const toggle = page.locator('#marqueeToggle');
  await toggle.focus();
  // The band is overflow-hidden, so an outset ring would be clipped away at top and bottom.
  const ring = await toggle.evaluate(el => {
    const s = getComputedStyle(el);
    return { offset: parseFloat(s.outlineOffset), width: parseFloat(s.outlineWidth) };
  });
  expect(ring.width).toBeGreaterThan(0);
  expect(ring.offset).toBeLessThan(0);

  // Forced colors strips the gradient behind the glyph; the button needs its own surface.
  await page.emulateMedia({ forcedColors: 'active' });
  const surface = await toggle.evaluate(el => getComputedStyle(el).backgroundColor);
  const alpha = surface.startsWith('rgba') ? parseFloat(surface.split(',')[3]) : 1;
  expect(alpha).toBeGreaterThan(0);
  await page.emulateMedia({ forcedColors: null });
});

test('event row, reflow, text spacing and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.marquee-track').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  if (page.viewportSize().width >= 1024) {
    const eventCardTops = await page.locator('#events article').evaluateAll(cards => cards.map(card => Math.round(card.getBoundingClientRect().top)));
    expect(new Set(eventCardTops).size).toBe(1);
  }
  await page.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('card order supports the marketing funnel', async ({ page }) => {
  await expect(page.locator('#schedule h3')).toHaveText([
    'Kids Classes',
    'MMA',
    'Muay Thai Kickboxing',
    'Brazilian Jiu-Jitsu',
    'Open Mat',
    'Weekend',
  ]);
  await expect(page.locator('#coaches article h3')).toHaveText([
    'Jason Faglier Sr.',
    'Joel Faglier',
    'Jason Faglier Jr.',
  ]);
  expect(await page.locator('#events article').evaluateAll(cards => cards.map(card => card.id))).toEqual([
    'joel-beach-worlds',
    'malcolm-wellmaker-ufc',
    'trunk-or-treat-2026',
  ]);
  await expect(page.locator('[data-membership-tiers]')).toHaveJSProperty('tagName', 'UL');
  await expect(page.locator('[data-membership-tiers] > li > h3')).toHaveText([
    '1 Discipline',
    '2 Disciplines',
    '3 Disciplines',
    'Unlimited Classes',
  ]);
  await expect(page.locator('[data-secondary-pricing]')).toHaveJSProperty('tagName', 'UL');
  await expect(page.locator('[data-secondary-pricing] > li > h3')).toHaveText([
    'Family Price Cap',
    'Open Mat / Drop-In',
    'Karate Starter Gear · Gi*',
    'BJJ Starter Gear · Gi*',
  ]);
});
