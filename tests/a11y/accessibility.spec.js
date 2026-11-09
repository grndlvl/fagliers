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

test('event and achievement images link to full-size images in a new window', async ({ page }) => {
  const imageLinks = page.locator('[data-event-image], [data-achievement-image]');
  await expect(imageLinks).toHaveCount(4);
  for (const imageLink of await imageLinks.all()) {
    await expect(imageLink).toHaveAttribute('href', /^images\/events\/.+\.(jpg|png|webp)$/);
    await expect(imageLink).toHaveAttribute('target', '_blank');
    await expect(imageLink).toHaveAttribute('rel', /noopener/);
    // The new-window behaviour must be announced, not just visual (WCAG 3.2.5),
    // using the same sr-only wording as every other external link on the page.
    await expect(imageLink).toHaveAccessibleName(/opens in new window/i);
    // The image's own alt must reach the link name, not be masked by an aria-label.
    await expect(imageLink).toHaveAccessibleName(/Joel|Faglier|Tyler|Dixon|Quincy|Evans|Tillman/i);
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
  await page.locator('[data-achievement-image]').focus();
  expect(await page.locator('[data-achievement-image]').evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
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

test('reflow, text spacing and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.marquee-track').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
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
  const kidsSchedule = page.locator('#kids-schedule').locator('..');
  await expect(kidsSchedule.locator('dt')).toHaveText(['Mon & Wed', 'Tuesday', 'Thursday', 'Friday']);
  await expect(kidsSchedule.locator('dd')).toHaveText(['Karate Kickboxing', 'BJJ Gi', 'BJJ No Gi', 'MMA']);
  await expect(page.locator('#coaches article h3')).toHaveText([
    'Jason Faglier Jr.',
    'Jason Faglier Sr.',
    'Joel Faglier',
  ]);
  const jasonCard = page.locator('#coaches article').first();
  await expect(jasonCard).toContainText('Gym owner · Head coach');
  await expect(jasonCard).toContainText('22–5 combined amateur and professional record');
  await expect(jasonCard).toContainText('Ironman triathlete');
  await expect(page.locator('#joel-faglier-ufc-debut h2')).toHaveText('Joel Faglier wins his UFC debut');
  await expect(page.getByRole('heading', { name: 'Two UFC fighters. One Augusta foundation.' })).toBeVisible();
  await expect(page.getByText('UFC fighters got their start here', { exact: true })).toBeVisible();
  const ufcFighterCards = page.locator('[data-ufc-fighter]');
  await expect(ufcFighterCards).toHaveCount(2);
  await expect(ufcFighterCards.locator('h3')).toHaveText(['Malcolm Wellmaker', 'Joel Faglier']);
  await expect(ufcFighterCards.nth(0).locator('img')).toHaveAttribute('alt', /Malcolm/);
  await expect(ufcFighterCards.nth(1).locator('img')).toHaveAttribute('alt', /Joel/);
  expect(await page.locator('#joel-faglier-ufc-debut, #joel-beach-worlds').evaluateAll(elements => elements.map(element => element.id))).toEqual([
    'joel-faglier-ufc-debut',
    'joel-beach-worlds',
  ]);
  const highlightLinks = page.locator('#joel-faglier-ufc-debut a[href="https://www.ufc.com/video/161155"]');
  await expect(highlightLinks).toHaveCount(2);
  for (const link of await highlightLinks.all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAccessibleName(/opens in new window/i);
  }
  await expect(page.locator('#events')).toBeVisible();
  await expect(page.locator('[data-section-nav-link][href="#events"]')).toHaveCount(3);
  await expect(page.locator('#events article')).toHaveCount(3);
  expect(await page.locator('#events article').evaluateAll(events => events.map(event => event.id))).toEqual([
    'joel-faglier-seminar-november-2026',
    'tyler-dixon-scrap-7-november-2026',
    'quincy-evans-fury-fc-126-december-2026',
  ]);
  await expect(page.locator('#tyler-dixon-scrap-7-november-2026')).toContainText('Tyler Dixon of Faglier\'s MMA vs. Jay Foreman of ANAX Collective');
  await expect(page.locator('#quincy-evans-fury-fc-126-december-2026')).toContainText('Quincy Evans of Faglier\'s MMA vs. Shawn Tillman');
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
